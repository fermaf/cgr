import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SkillContext, SkillExecutionResult } from '../../../types/skill';
import { createSkillMetadata } from '../../../types/skill';
import { readWranglerConfig, type WranglerBindingConfig, type WranglerConfig } from '../../../utils/wranglerConfig';
import { readDevVars } from '../../../utils/devVars';
import {
  executeMetadataRemediationPlanner,
  type MetadataRemediationPlannerData,
  type MetadataRemediationPlannerInput
} from '../skill_metadata_remediation_planner/executor';

type ExecutionMode = 'preview' | 'apply';
type TargetEnvironment = 'staging' | 'local';
type Severity = 'low' | 'medium' | 'high' | 'critical';
type RiskLevel = 'low' | 'medium' | 'high';
type SuggestedStrategy = 'regenerate_from_source' | 'regenerate_from_existing_metadata' | 'needs_manual_semantic_review';
type ExecutionStrategy = SuggestedStrategy | 'skip_until_write_guard_satisfied';

const STAGING_REPROCESS_BASE_URL = 'https://cgr-platform-staging.abogado.workers.dev';
const LOCAL_REPROCESS_BASE_URL = 'http://127.0.0.1:8787';
const SOURCE_MISSING_ORIGINS = new Set(['missing_kv', 'sin_kv', 'error_sin_KV_source']);
const SAFE_BLOCKER_APPLY_LIMIT = 5;

export interface MetadataBlockerRegenerationExecutorInput {
  mode?: ExecutionMode;
  targetEnvironment?: TargetEnvironment;
  maxBatchSize?: number;
  dryRun?: boolean;
  includeExamples?: boolean;
  allowIds?: string[];
  reprocessBaseUrl?: string;
}

interface PlannerBatch {
  batch_id: string;
  estimated_count: number;
}

interface BlockerRow {
  id: string;
  materia: string;
  old_url: string;
  origen_importacion: string;
  estado: string;
  titulo: string;
  resumen: string;
  analisis: string;
  etiquetas_json: string;
  fuentes_legales_json: string;
  booleanos_json: string;
  modelo_llm: string;
  fecha_enriquecimiento: string;
}

interface D1ResultMeta {
  changes?: number;
  rows_read?: number;
  rows_written?: number;
}

interface SafetyCheck {
  check: string;
  passed: boolean;
  detail: string;
}

interface StrategySummary {
  strategy: ExecutionStrategy;
  count: number;
  risk_level: RiskLevel;
  auto_regenerable_count: number;
  sample_ids: string[];
}

interface BlockerCandidate {
  id: string;
  missing_fields: Array<'titulo' | 'resumen' | 'analisis'>;
  suggested_strategy: SuggestedStrategy;
  execution_strategy: ExecutionStrategy;
  risk_level: RiskLevel;
  auto_regenerable: boolean;
  apply_eligible: boolean;
  source_signals: {
    old_url_present: boolean;
    origen_importacion: string;
    likely_source_available: boolean;
  };
  supporting_metadata: {
    materia_present: boolean;
    labels_count: number;
    fuentes_count: number;
    boolean_keys_count: number;
    modelo_llm: string;
    fecha_enriquecimiento: string;
  };
  recommendation: string;
  reason_if_blocked?: string;
}

interface ApplyAttempt {
  id: string;
  strategy: ExecutionStrategy;
  attempted: boolean;
  applied: boolean;
  status_code?: number;
  response_excerpt?: string;
  reason_if_skipped?: string;
}

interface ExecutorStats {
  targetEnvironment: TargetEnvironment | 'unknown';
  mode: ExecutionMode;
  dryRun: boolean;
  maxBatchSize: number;
  planner: {
    severity: Severity;
    first_fix_batch_count: number;
  };
  blocker_count: number;
  selected_count: number;
  applied_count: number;
  skipped_count: number;
  strategy_counts: Record<ExecutionStrategy, number>;
  queryErrors: string[];
  auditTrailPath: string | null;
}

export interface MetadataBlockerRegenerationExecutorData {
  summary: {
    checkedAt: string;
    mode: ExecutionMode;
    targetEnvironment: TargetEnvironment | 'unknown';
    severity: Severity;
    headline: string;
    audit_trail_path: string | null;
  };
  candidate_count: number;
  applied_count: number;
  skipped_count: number;
  blockers: BlockerCandidate[];
  strategy_summary: StrategySummary[];
  safety_checks: SafetyCheck[];
  apply_summary: {
    attempted: boolean;
    applied: boolean;
    blocked_reason: string | null;
    api_calls_attempted: number;
    api_calls_succeeded: number;
  };
  apply_attempts: ApplyAttempt[];
  stats: ExecutorStats;
  severity: Severity;
  next_actions: string[];
}

function normalizeMode(value: unknown): ExecutionMode {
  return value === 'apply' ? 'apply' : 'preview';
}

function normalizeTargetEnvironment(value: unknown): TargetEnvironment | null {
  if (value === 'staging' || value === 'local') return value;
  return null;
}

function normalizeMaxBatchSize(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return 25;
  return Math.max(1, Math.min(50, parsed));
}

function normalizeAllowIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function parseArrayLike(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseObjectLike(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function severityRank(severity: Severity): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
}

function getWranglerEnvironmentConfig(
  config: WranglerConfig | null,
  targetEnvironment: TargetEnvironment
): {
  vars: Record<string, unknown>;
  d1Binding: WranglerBindingConfig | null;
  baseD1Binding: WranglerBindingConfig | null;
} {
  if (!config) {
    return { vars: {}, d1Binding: null, baseD1Binding: null };
  }

  if (targetEnvironment === 'staging') {
    const staging = (config as WranglerConfig & {
      env?: Record<string, { vars?: Record<string, unknown>; d1_databases?: WranglerBindingConfig[] }>;
    }).env?.staging;
    return {
      vars: staging?.vars ?? {},
      d1Binding: staging?.d1_databases?.[0] ?? null,
      baseD1Binding: config.d1_databases?.[0] ?? null
    };
  }

  return {
    vars: config.vars ?? {},
    d1Binding: config.d1_databases?.[0] ?? null,
    baseD1Binding: config.d1_databases?.[0] ?? null
  };
}

function inferCloudflareAccountId(mistralApiUrl: string | null): string | null {
  if (!mistralApiUrl) return null;
  try {
    const url = new URL(mistralApiUrl);
    const match = url.pathname.match(/\/v1\/([a-f0-9]{32})\//i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function queryD1<T>(params: {
  accountId: string;
  apiToken: string;
  databaseId: string;
  sql: string;
  queryName: string;
  queryParams?: Array<string | number | boolean | null>;
}): Promise<{
  rows: T[];
  meta: D1ResultMeta | null;
  error: string | null;
}> {
  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${params.accountId}/d1/database/${params.databaseId}/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${params.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sql: params.sql,
          params: params.queryParams ?? []
        })
      }
    );
  } catch (error) {
    return {
      rows: [],
      meta: null,
      error: `${params.queryName}: network_error ${error instanceof Error ? error.message : String(error)}`
    };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      rows: [],
      meta: null,
      error: `${params.queryName}: HTTP ${response.status} ${body.slice(0, 240)}`
    };
  }

  const payload = await response.json() as {
    success?: boolean;
    errors?: Array<{ message?: string }>;
    result?: Array<{ success?: boolean; results?: T[]; meta?: D1ResultMeta }>;
  };

  if (payload.success === false) {
    return {
      rows: [],
      meta: null,
      error: `${params.queryName}: ${payload.errors?.map((entry) => entry.message).filter(Boolean).join('; ') || 'query failed'}`
    };
  }

  return {
    rows: payload.result?.[0]?.results ?? [],
    meta: payload.result?.[0]?.meta ?? null,
    error: null
  };
}

function deriveReprocessBaseUrl(targetEnvironment: TargetEnvironment, explicitBaseUrl?: string): string {
  if (typeof explicitBaseUrl === 'string' && explicitBaseUrl.trim().length > 0) {
    return explicitBaseUrl.trim().replace(/\/+$/, '');
  }

  return targetEnvironment === 'local' ? LOCAL_REPROCESS_BASE_URL : STAGING_REPROCESS_BASE_URL;
}

function summarizePlannerFirstFixCount(plannerData: MetadataRemediationPlannerData): number {
  const batch = plannerData.batches.find((entry: PlannerBatch) => entry.batch_id === 'first_fix_batch');
  return batch?.estimated_count ?? 0;
}

function classifyBlocker(row: BlockerRow, params: {
  mode: ExecutionMode;
  writeGuardSatisfied: boolean;
  endpointReady: boolean;
}): BlockerCandidate {
  const missingFields = ([
    compactText(row.titulo) ? null : 'titulo',
    compactText(row.resumen) ? null : 'resumen',
    compactText(row.analisis) ? null : 'analisis'
  ].filter(Boolean) as Array<'titulo' | 'resumen' | 'analisis'>);
  const labelsCount = parseArrayLike(row.etiquetas_json).length;
  const fuentesCount = parseArrayLike(row.fuentes_legales_json).length;
  const booleanKeysCount = Object.keys(parseObjectLike(row.booleanos_json)).length;
  const materiaPresent = compactText(row.materia).length > 0;
  const oldUrlPresent = compactText(row.old_url).length > 0;
  const origin = compactText(row.origen_importacion);
  const likelySourceAvailable = oldUrlPresent || (origin.length > 0 && !SOURCE_MISSING_ORIGINS.has(origin));
  const existingMetadataStrong = materiaPresent && labelsCount >= 2 && (fuentesCount > 0 || booleanKeysCount >= 2);
  const allCoreMissing = missingFields.length === 3;
  const oneCoreMissing = missingFields.length === 1;

  let suggestedStrategy: SuggestedStrategy;
  let riskLevel: RiskLevel;
  let recommendation: string;

  if (oneCoreMissing && existingMetadataStrong) {
    suggestedStrategy = 'regenerate_from_existing_metadata';
    riskLevel = 'medium';
    recommendation = 'Intentar completar el campo faltante usando metadata ya presente antes de un re-proceso integral.';
  } else if (likelySourceAvailable) {
    suggestedStrategy = 'regenerate_from_source';
    riskLevel = allCoreMissing ? 'medium' : 'high';
    recommendation = 'Reprocesar desde fuente/KV con la ruta puntual /api/v1/dictamenes/:id/re-process cuando exista entorno aislado.';
  } else {
    suggestedStrategy = 'needs_manual_semantic_review';
    riskLevel = 'high';
    recommendation = 'No hay señales suficientes de fuente segura; requiere revisión manual antes de regenerar.';
  }

  const applyEligible = suggestedStrategy !== 'needs_manual_semantic_review'
    && params.writeGuardSatisfied
    && params.endpointReady;
  const executionStrategy: ExecutionStrategy = params.mode === 'apply' && !applyEligible && suggestedStrategy !== 'needs_manual_semantic_review'
    ? 'skip_until_write_guard_satisfied'
    : suggestedStrategy;

  return {
    id: row.id,
    missing_fields: missingFields,
    suggested_strategy: suggestedStrategy,
    execution_strategy: executionStrategy,
    risk_level: riskLevel,
    auto_regenerable: applyEligible,
    apply_eligible: applyEligible,
    source_signals: {
      old_url_present: oldUrlPresent,
      origen_importacion: origin || 'unknown',
      likely_source_available: likelySourceAvailable
    },
    supporting_metadata: {
      materia_present: materiaPresent,
      labels_count: labelsCount,
      fuentes_count: fuentesCount,
      boolean_keys_count: booleanKeysCount,
      modelo_llm: compactText(row.modelo_llm),
      fecha_enriquecimiento: compactText(row.fecha_enriquecimiento)
    },
    recommendation,
    reason_if_blocked: executionStrategy === 'skip_until_write_guard_satisfied'
      ? 'El registro parece regenerable, pero faltan guardas operativas para escribir con seguridad.'
      : undefined
  };
}

function buildStrategySummary(blockers: BlockerCandidate[]): StrategySummary[] {
  const grouped = new Map<ExecutionStrategy, StrategySummary>();

  for (const blocker of blockers) {
    if (!grouped.has(blocker.execution_strategy)) {
      grouped.set(blocker.execution_strategy, {
        strategy: blocker.execution_strategy,
        count: 0,
        risk_level: blocker.risk_level,
        auto_regenerable_count: 0,
        sample_ids: []
      });
    }

    const group = grouped.get(blocker.execution_strategy)!;
    group.count += 1;
    group.auto_regenerable_count += blocker.auto_regenerable ? 1 : 0;
    if (group.sample_ids.length < 6) {
      group.sample_ids.push(blocker.id);
    }
    if (severityRank(blocker.risk_level === 'high' ? 'high' : blocker.risk_level === 'medium' ? 'medium' : 'low')
      > severityRank(group.risk_level === 'high' ? 'high' : group.risk_level === 'medium' ? 'medium' : 'low')) {
      group.risk_level = blocker.risk_level;
    }
  }

  return [...grouped.values()].sort((left, right) => right.count - left.count || left.strategy.localeCompare(right.strategy));
}

function determineSeverity(params: {
  blockerCount: number;
  appliedCount: number;
  applyBlocked: boolean;
  queryErrors: string[];
}): Severity {
  if (params.queryErrors.length > 0) return 'high';
  if (params.blockerCount > 0 && params.applyBlocked) return 'critical';
  if (params.appliedCount > 0) return 'medium';
  if (params.blockerCount > 0) return 'high';
  return 'low';
}

function buildHeadline(params: {
  blockerCount: number;
  topStrategy: StrategySummary | null;
  mode: ExecutionMode;
  applyBlocked: boolean;
}): string {
  if (params.blockerCount === 0) {
    return 'No se detectaron blockers críticos en la cohorte revisada.';
  }

  if (params.mode === 'apply' && params.applyBlocked) {
    return `Se identificaron ${params.blockerCount} blockers, pero apply quedó bloqueado por seguridad de entorno.`;
  }

  if (!params.topStrategy) {
    return `Se identificaron ${params.blockerCount} blockers, sin estrategia dominante clara.`;
  }

  return `Se identificaron ${params.blockerCount} blockers; la estrategia dominante es ${params.topStrategy.strategy} con ${params.topStrategy.count} casos.`;
}

async function writeAuditArtifact(repoRoot: string, payload: unknown): Promise<string> {
  const directory = path.join(repoRoot, 'agents', 'out', 'metadata-blocker-regeneration');
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

export async function executeMetadataBlockerRegenerationExecutor(
  context: SkillContext,
  rawInput: MetadataBlockerRegenerationExecutorInput = {}
): Promise<SkillExecutionResult<MetadataBlockerRegenerationExecutorData>> {
  const startedAt = Date.now();
  const mode = normalizeMode(rawInput.mode);
  const explicitTargetEnvironment = normalizeTargetEnvironment(rawInput.targetEnvironment);
  const dryRun = rawInput.dryRun ?? (mode !== 'apply');
  const maxBatchSize = normalizeMaxBatchSize(rawInput.maxBatchSize);
  const allowIds = normalizeAllowIds(rawInput.allowIds);
  const includeExamples = rawInput.includeExamples !== false;
  const queryErrors: string[] = [];
  const safetyChecks: SafetyCheck[] = [];
  const applyAttempts: ApplyAttempt[] = [];

  safetyChecks.push({
    check: 'target_environment_explicit',
    passed: explicitTargetEnvironment !== null,
    detail: explicitTargetEnvironment
      ? `Se usará ${explicitTargetEnvironment}.`
      : 'La skill exige targetEnvironment explícito.'
  });

  const plannerInput: MetadataRemediationPlannerInput = {
    mode: 'quick',
    targetEnvironment: explicitTargetEnvironment ?? 'staging',
    includeExamples,
    includeAutoFixEligibility: false
  };
  const plannerResult = await executeMetadataRemediationPlanner(context, plannerInput);
  const plannerData = plannerResult.data;

  const wrangler = await readWranglerConfig(context.repoRoot);
  const devVars = await readDevVars(context.repoRoot);
  const targetEnvironment = explicitTargetEnvironment ?? 'unknown';
  let blockers: BlockerCandidate[] = [];
  let blockedReason: string | null = null;
  let auditTrailPath: string | null = null;
  let appliedCount = 0;
  let skippedCount = 0;
  let selectedCount = 0;

  let databaseId: string | null = null;
  let baseDatabaseId: string | null = null;
  let cloudflareAccountId: string | null = null;
  let cloudflareApiToken = '';
  let reprocessBaseUrl: string | null = null;
  let reprocessToken = '';
  let endpointReady = false;

  if (explicitTargetEnvironment) {
    const envConfig = getWranglerEnvironmentConfig(wrangler.config, explicitTargetEnvironment);
    databaseId = typeof envConfig.d1Binding?.database_id === 'string' ? envConfig.d1Binding.database_id : null;
    baseDatabaseId = typeof envConfig.baseD1Binding?.database_id === 'string' ? envConfig.baseD1Binding.database_id : null;
    cloudflareApiToken = devVars.values.CLOUDFLARE_API_TOKEN ?? '';
    cloudflareAccountId = inferCloudflareAccountId(
      typeof envConfig.vars.MISTRAL_API_URL === 'string' ? envConfig.vars.MISTRAL_API_URL : null
    );
    reprocessToken = devVars.values.INGEST_TRIGGER_TOKEN ?? String(envConfig.vars.INGEST_TRIGGER_TOKEN ?? '');
    reprocessBaseUrl = deriveReprocessBaseUrl(explicitTargetEnvironment, rawInput.reprocessBaseUrl);
    endpointReady = Boolean(reprocessBaseUrl);

    safetyChecks.push({
      check: 'production_forbidden',
      passed: true,
      detail: 'La skill solo admite staging o local; production queda fuera del contrato.'
    });
    safetyChecks.push({
      check: 'shared_runtime_write_acknowledged',
      passed: true,
      detail: explicitTargetEnvironment === 'staging'
        ? 'La skill asume runtime/datos reales y se protege con allowlist, batch pequeño y audit trail.'
        : 'No aplica porque no se apuntó a staging.'
    });
    safetyChecks.push({
      check: 'd1_query_credentials_available',
      passed: Boolean(databaseId && cloudflareAccountId && cloudflareApiToken),
      detail: databaseId && cloudflareAccountId && cloudflareApiToken
        ? 'Credenciales y binding D1 disponibles.'
        : 'Faltan credenciales o binding D1 para consultar blockers.'
    });
    safetyChecks.push({
      check: 'reprocess_endpoint_ready',
      passed: endpointReady,
      detail: endpointReady
        ? `Base URL de reproceso resuelta: ${reprocessBaseUrl}.`
        : 'No se pudo resolver base URL para /api/v1/dictamenes/:id/re-process.'
    });
  }

  safetyChecks.push({
    check: 'preview_default',
    passed: mode === 'preview' || rawInput.mode === 'apply',
    detail: mode === 'preview'
      ? 'La skill quedó en preview por defecto.'
      : 'Se pidió apply explícitamente.'
  });
  safetyChecks.push({
    check: 'scope_limited_to_blockers',
    passed: true,
    detail: 'La ejecución se limita al bucket critical_blockers y no toca deuda semántica masiva.'
  });
  safetyChecks.push({
    check: 'apply_allowlist_present',
    passed: mode !== 'apply' || dryRun || allowIds.length > 0,
    detail: mode !== 'apply' || dryRun
      ? 'No aplica porque la skill quedó en preview/dry-run.'
      : allowIds.length > 0
        ? `Allowlist explícita recibida para ${allowIds.length} IDs.`
        : 'Apply exige allowIds explícito para evitar reproceso amplio.'
  });
  safetyChecks.push({
    check: 'apply_batch_within_safe_limit',
    passed: mode !== 'apply' || dryRun || maxBatchSize <= SAFE_BLOCKER_APPLY_LIMIT,
    detail: mode !== 'apply' || dryRun
      ? 'No aplica porque la skill quedó en preview/dry-run.'
      : maxBatchSize <= SAFE_BLOCKER_APPLY_LIMIT
        ? `Batch dentro del límite seguro (${SAFE_BLOCKER_APPLY_LIMIT}).`
        : `Apply supera el límite seguro de ${SAFE_BLOCKER_APPLY_LIMIT} reprocesos.`
  });

  const canQuery = explicitTargetEnvironment === 'staging' && Boolean(databaseId && cloudflareAccountId && cloudflareApiToken);

  if (canQuery) {
    const blockerQuery = await queryD1<BlockerRow>({
      accountId: cloudflareAccountId!,
      apiToken: cloudflareApiToken,
      databaseId: databaseId!,
      queryName: 'blocker_regeneration_candidates',
      sql: `
        SELECT
          d.id,
          COALESCE(TRIM(d.materia), '') AS materia,
          COALESCE(TRIM(d.old_url), '') AS old_url,
          COALESCE(TRIM(d.origen_importacion), '') AS origen_importacion,
          COALESCE(TRIM(d.estado), '') AS estado,
          COALESCE(TRIM(e.titulo), '') AS titulo,
          COALESCE(TRIM(e.resumen), '') AS resumen,
          COALESCE(TRIM(e.analisis), '') AS analisis,
          COALESCE(TRIM(e.etiquetas_json), '[]') AS etiquetas_json,
          COALESCE(TRIM(e.fuentes_legales_json), '[]') AS fuentes_legales_json,
          COALESCE(TRIM(e.booleanos_json), '{}') AS booleanos_json,
          COALESCE(TRIM(e.modelo_llm), '') AS modelo_llm,
          COALESCE(TRIM(e.fecha_enriquecimiento), '') AS fecha_enriquecimiento
        FROM dictamenes d
        LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
        WHERE d.estado IN ('enriched', 'vectorized')
          AND (
            TRIM(COALESCE(e.titulo, '')) = ''
            OR TRIM(COALESCE(e.resumen, '')) = ''
            OR TRIM(COALESCE(e.analisis, '')) = ''
          )
        ORDER BY d.id ASC
        LIMIT 100
      `
    });

    if (blockerQuery.error) {
      queryErrors.push(blockerQuery.error);
    } else {
      const writeGuardSatisfied = mode !== 'apply'
        || dryRun
        || (allowIds.length > 0 && maxBatchSize <= SAFE_BLOCKER_APPLY_LIMIT);
      blockers = blockerQuery.rows.map((row) => classifyBlocker(row, {
        mode,
        writeGuardSatisfied,
        endpointReady
      }));
    }
  } else if (explicitTargetEnvironment === 'local') {
    queryErrors.push('local_blocker_query_not_wired: no hay snapshot local conectado para revisar blockers.');
  }

  const allowIdSet = allowIds.length > 0 ? new Set(allowIds) : null;
  const eligibleBlockers = allowIdSet
    ? blockers.filter((blocker) => allowIdSet.has(blocker.id))
    : blockers;
  const candidateCount = eligibleBlockers.length;
  const selectedBlockers = eligibleBlockers.slice(0, maxBatchSize);
  selectedCount = selectedBlockers.length;

  if (mode === 'apply') {
    if (dryRun) {
      blockedReason = 'dry_run_enabled';
    } else if (!explicitTargetEnvironment) {
      blockedReason = 'target_environment_missing';
    } else if (allowIds.length === 0) {
      blockedReason = 'apply_allowlist_required';
    } else if (maxBatchSize > SAFE_BLOCKER_APPLY_LIMIT) {
      blockedReason = 'apply_batch_exceeds_safe_limit';
    } else if (!endpointReady || !reprocessBaseUrl) {
      blockedReason = 'reprocess_endpoint_not_configured';
    }

    if (!blockedReason) {
      for (const blocker of selectedBlockers) {
        if (blocker.suggested_strategy !== 'regenerate_from_source') {
          applyAttempts.push({
            id: blocker.id,
            strategy: blocker.execution_strategy,
            attempted: false,
            applied: false,
            reason_if_skipped: blocker.suggested_strategy === 'regenerate_from_existing_metadata'
              ? 'existing_metadata_regeneration_not_implemented'
              : 'manual_semantic_review_required'
          });
          skippedCount += 1;
          continue;
        }

        try {
          const response = await fetch(
            `${reprocessBaseUrl}/api/v1/dictamenes/${encodeURIComponent(blocker.id)}/re-process?force=true`,
            {
              method: 'POST',
              headers: reprocessToken ? { 'x-admin-token': reprocessToken } : undefined
            }
          );
          const responseText = await response.text().catch(() => '');
          const applied = response.ok;
          applyAttempts.push({
            id: blocker.id,
            strategy: blocker.execution_strategy,
            attempted: true,
            applied,
            status_code: response.status,
            response_excerpt: responseText.slice(0, 240)
          });
          if (applied) {
            appliedCount += 1;
          } else {
            skippedCount += 1;
          }
        } catch (error) {
          applyAttempts.push({
            id: blocker.id,
            strategy: blocker.execution_strategy,
            attempted: true,
            applied: false,
            reason_if_skipped: `network_error ${error instanceof Error ? error.message : String(error)}`
          });
          skippedCount += 1;
        }
      }
    } else {
      skippedCount = selectedBlockers.length;
      for (const blocker of selectedBlockers) {
        applyAttempts.push({
          id: blocker.id,
          strategy: blocker.execution_strategy,
          attempted: false,
          applied: false,
          reason_if_skipped: blockedReason
        });
      }
    }
  } else {
    skippedCount = selectedBlockers.length;
  }

  const strategySummary = buildStrategySummary(blockers);
  const severity = determineSeverity({
    blockerCount: candidateCount,
    appliedCount,
    applyBlocked: Boolean(blockedReason),
    queryErrors
  });

  const nextActions = uniqueStrings([
    candidateCount > 0
      ? `Mantener first_fix_batch acotado a ${candidateCount} registros críticos exactos.`
      : '',
    strategySummary.find((entry) => entry.strategy === 'regenerate_from_source')
      ? `Preparar regeneración puntual desde fuente para ${strategySummary.find((entry) => entry.strategy === 'regenerate_from_source')?.count ?? 0} blockers.`
      : '',
    strategySummary.find((entry) => entry.strategy === 'skip_until_write_guard_satisfied')
      ? 'Completar allowlist explícita y mantener lote pequeño antes de habilitar apply.'
      : '',
    strategySummary.find((entry) => entry.strategy === 'needs_manual_semantic_review')
      ? `Enviar ${strategySummary.find((entry) => entry.strategy === 'needs_manual_semantic_review')?.count ?? 0} casos a revisión manual o semántica asistida.`
      : '',
    blockedReason === 'apply_allowlist_required'
      ? 'Seleccionar IDs exactos desde el preview y reintentar apply con allowIds.'
      : '',
    blockedReason === 'apply_batch_exceeds_safe_limit'
      ? `Reducir el lote a ${SAFE_BLOCKER_APPLY_LIMIT} o menos antes de aplicar.`
      : '',
    queryErrors.length > 0
      ? 'Resolver errores de soporte D1 antes de operar esta skill en modo apply.'
      : ''
  ]);

  const artifactPayload = {
    summary: {
      checkedAt: new Date().toISOString(),
      mode,
      targetEnvironment,
      blockedReason
    },
    allowIds,
    planner: plannerData.summary,
    blockers: includeExamples ? selectedBlockers : blockers,
    strategy_summary: strategySummary,
    safety_checks: safetyChecks,
    apply_attempts: applyAttempts,
    query_errors: queryErrors
  };
  auditTrailPath = await writeAuditArtifact(context.repoRoot, artifactPayload);

  const data: MetadataBlockerRegenerationExecutorData = {
    summary: {
      checkedAt: new Date().toISOString(),
      mode,
      targetEnvironment,
      severity,
      headline: buildHeadline({
        blockerCount: candidateCount,
        topStrategy: strategySummary[0] ?? null,
        mode,
        applyBlocked: Boolean(blockedReason)
      }),
      audit_trail_path: auditTrailPath
    },
    candidate_count: candidateCount,
    applied_count: appliedCount,
    skipped_count: skippedCount,
    blockers: includeExamples ? selectedBlockers : blockers,
    strategy_summary: strategySummary,
    safety_checks: safetyChecks,
    apply_summary: {
      attempted: mode === 'apply',
      applied: appliedCount > 0,
      blocked_reason: blockedReason,
      api_calls_attempted: applyAttempts.filter((entry) => entry.attempted).length,
      api_calls_succeeded: applyAttempts.filter((entry) => entry.applied).length
    },
    apply_attempts: applyAttempts,
    stats: {
      targetEnvironment,
      mode,
      dryRun,
      maxBatchSize,
      planner: {
        severity: plannerData.severity,
        first_fix_batch_count: summarizePlannerFirstFixCount(plannerData)
      },
      blocker_count: candidateCount,
      selected_count: selectedCount,
      applied_count: appliedCount,
      skipped_count: skippedCount,
      strategy_counts: {
        regenerate_from_source: blockers.filter((entry) => entry.execution_strategy === 'regenerate_from_source').length,
        regenerate_from_existing_metadata: blockers.filter((entry) => entry.execution_strategy === 'regenerate_from_existing_metadata').length,
        needs_manual_semantic_review: blockers.filter((entry) => entry.execution_strategy === 'needs_manual_semantic_review').length,
        skip_until_write_guard_satisfied: blockers.filter((entry) => entry.execution_strategy === 'skip_until_write_guard_satisfied').length
      },
      queryErrors,
      auditTrailPath
    },
    severity,
    next_actions: nextActions
  };

  return {
    status: 'success',
    data,
    metadata: createSkillMetadata(
      'skill_metadata_blocker_regeneration_executor',
      context.sessionId,
      'agents-native',
      Date.now() - startedAt
    )
  };
}
