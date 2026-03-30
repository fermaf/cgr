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
type NormalizationType =
  | 'trim_whitespace'
  | 'collapse_whitespace'
  | 'snake_case_to_spaces'
  | 'dedupe_normalized_duplicates';

export interface MetadataAutoNormalizationExecutorInput {
  mode?: ExecutionMode;
  targetEnvironment?: TargetEnvironment;
  maxBatchSize?: number;
  dryRun?: boolean;
  allowedNormalizationTypes?: string[];
  allowIds?: string[];
  includeExamples?: boolean;
}

interface CandidateRow {
  dictamen_id: string;
  etiquetas_json: string;
}

interface D1AggregateRow {
  candidate_count: number;
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

interface ChangeEntry {
  id: string;
  field: 'etiquetas_json';
  before: string;
  after: string;
  normalization_type: string;
  normalization_types: NormalizationType[];
  applied: boolean;
  reason_if_skipped?: string;
}

interface NormalizationGroup {
  type: NormalizationType;
  count: number;
  risk_level: RiskLevel;
  examples: Array<{
    id: string;
    before: string;
    after: string;
  }>;
}

interface ExecutorStats {
  targetEnvironment: TargetEnvironment | 'unknown';
  mode: ExecutionMode;
  dryRun: boolean;
  maxBatchSize: number;
  planner: {
    severity: Severity;
    first_fix_count: number;
    semantic_review_count: number;
    auto_normalizable_count: number;
  };
  candidateCount: number;
  selectedCount: number;
  appliedCount: number;
  skippedCount: number;
  queryErrors: string[];
  auditTrailPath: string | null;
}

export interface MetadataAutoNormalizationExecutorData {
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
  normalization_groups: NormalizationGroup[];
  changes: ChangeEntry[];
  safety_checks: SafetyCheck[];
  write_summary: {
    attempted: boolean;
    applied: boolean;
    write_operations: number;
    blocked_reason: string | null;
  };
  stats: ExecutorStats;
  severity: Severity;
  next_actions: string[];
}

const DEFAULT_NORMALIZATION_TYPES: NormalizationType[] = [
  'trim_whitespace',
  'collapse_whitespace',
  'snake_case_to_spaces',
  'dedupe_normalized_duplicates'
];
const SAFE_AUTO_NORMALIZATION_APPLY_LIMIT = 20;

function normalizeMode(mode: unknown): ExecutionMode {
  return mode === 'apply' ? 'apply' : 'preview';
}

function normalizeTargetEnvironment(value: unknown): TargetEnvironment | null {
  if (value === 'staging' || value === 'local') return value;
  return null;
}

function normalizeMaxBatchSize(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(200, parsed));
}

function normalizeAllowedNormalizationTypes(value: unknown): NormalizationType[] {
  if (!Array.isArray(value)) return DEFAULT_NORMALIZATION_TYPES;
  const normalized = value
    .map((item) => String(item).trim())
    .filter((item): item is NormalizationType => DEFAULT_NORMALIZATION_TYPES.includes(item as NormalizationType));
  return normalized.length > 0 ? [...new Set(normalized)] : DEFAULT_NORMALIZATION_TYPES;
}

function normalizeAllowIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeText(value: string): string {
  return compactText(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function parseLabels(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (typeof entry === 'string') return [entry];
      if (entry && typeof entry === 'object' && typeof (entry as { label?: unknown }).label === 'string') {
        return [String((entry as { label: string }).label)];
      }
      return [];
    });
  } catch {
    return [];
  }
}

function normalizeLabelKey(value: string): string {
  return normalizeText(value.replace(/_/g, ' '));
}

function applyLabelNormalizations(label: string, allowedTypes: NormalizationType[]): {
  value: string;
  appliedTypes: NormalizationType[];
} {
  let current = label;
  const appliedTypes: NormalizationType[] = [];

  if (allowedTypes.includes('trim_whitespace')) {
    const next = current.trim();
    if (next !== current) {
      current = next;
      appliedTypes.push('trim_whitespace');
    }
  }

  if (allowedTypes.includes('snake_case_to_spaces')) {
    const next = current.replace(/_/g, ' ');
    if (next !== current) {
      current = next;
      appliedTypes.push('snake_case_to_spaces');
    }
  }

  if (allowedTypes.includes('collapse_whitespace')) {
    const next = current.replace(/\s+/g, ' ').trim();
    if (next !== current) {
      current = next;
      appliedTypes.push('collapse_whitespace');
    }
  }

  return {
    value: current,
    appliedTypes
  };
}

function buildNormalizedLabels(labels: string[], allowedTypes: NormalizationType[]): {
  labels: string[];
  types: NormalizationType[];
  skippedReason: string | null;
} {
  const result: string[] = [];
  const seen = new Set<string>();
  const appliedTypes = new Set<NormalizationType>();

  for (const original of labels) {
    const normalized = applyLabelNormalizations(original, allowedTypes);
    for (const type of normalized.appliedTypes) {
      appliedTypes.add(type);
    }

    if (!normalized.value.trim()) {
      return {
        labels,
        types: [...appliedTypes],
        skippedReason: 'empty_label_after_normalization'
      };
    }

    const dedupeKey = normalizeLabelKey(normalized.value);
    if (allowedTypes.includes('dedupe_normalized_duplicates') && seen.has(dedupeKey)) {
      appliedTypes.add('dedupe_normalized_duplicates');
      continue;
    }

    seen.add(dedupeKey);
    result.push(normalized.value);
  }

  return {
    labels: result,
    types: [...appliedTypes],
    skippedReason: null
  };
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
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

async function executeD1<T>(params: {
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

function buildNormalizationGroups(changes: ChangeEntry[]): NormalizationGroup[] {
  const groups = new Map<NormalizationType, NormalizationGroup>();

  for (const change of changes) {
    for (const type of change.normalization_types) {
      if (!groups.has(type)) {
        groups.set(type, {
          type,
          count: 0,
          risk_level: type === 'dedupe_normalized_duplicates' ? 'medium' : 'low',
          examples: []
        });
      }

      const group = groups.get(type)!;
      group.count += 1;
      if (group.examples.length < 5) {
        group.examples.push({
          id: change.id,
          before: change.before,
          after: change.after
        });
      }
    }
  }

  return [...groups.values()].sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));
}

function determineSeverity(params: {
  mode: ExecutionMode;
  applyBlocked: boolean;
  appliedCount: number;
  candidateCount: number;
  plannerSeverity: Severity;
}): Severity {
  if (params.mode === 'apply' && params.applyBlocked) return 'high';
  if (params.mode === 'apply' && params.appliedCount > 0) return 'medium';
  if (params.candidateCount > 0) return params.plannerSeverity;
  return 'low';
}

async function writeAuditArtifact(repoRoot: string, payload: unknown): Promise<string> {
  const directory = path.join(repoRoot, 'agents', 'out', 'metadata-auto-normalization');
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

export async function executeMetadataAutoNormalizationExecutor(
  context: SkillContext,
  rawInput: MetadataAutoNormalizationExecutorInput = {}
): Promise<SkillExecutionResult<MetadataAutoNormalizationExecutorData>> {
  const startedAt = Date.now();
  const mode = normalizeMode(rawInput.mode);
  const explicitTargetEnvironment = normalizeTargetEnvironment(rawInput.targetEnvironment);
  const dryRun = rawInput.dryRun ?? (mode !== 'apply');
  const maxBatchSize = normalizeMaxBatchSize(rawInput.maxBatchSize);
  const allowedNormalizationTypes = normalizeAllowedNormalizationTypes(rawInput.allowedNormalizationTypes);
  const allowIds = normalizeAllowIds(rawInput.allowIds);
  const includeExamples = rawInput.includeExamples !== false;
  const plannerInput: MetadataRemediationPlannerInput = {
    mode: 'quick',
    targetEnvironment: explicitTargetEnvironment ?? 'staging',
    includeExamples,
    includeAutoFixEligibility: true
  };
  const plannerResult = await executeMetadataRemediationPlanner(context, plannerInput);
  const plannerData: MetadataRemediationPlannerData = plannerResult.data;

  const wrangler = await readWranglerConfig(context.repoRoot);
  const devVars = await readDevVars(context.repoRoot);
  const queryErrors: string[] = [];
  const safetyChecks: SafetyCheck[] = [];
  const changes: ChangeEntry[] = [];
  let auditTrailPath: string | null = null;
  let candidateCount = 0;
  let appliedCount = 0;
  let skippedCount = 0;
  let blockedReason: string | null = null;

  safetyChecks.push({
    check: 'target_environment_explicit',
    passed: explicitTargetEnvironment !== null,
    detail: explicitTargetEnvironment
      ? `Se usará ${explicitTargetEnvironment}.`
      : 'La skill exige targetEnvironment explícito para cualquier preview o apply.'
  });

  const targetEnvironment = explicitTargetEnvironment ?? 'unknown';

  let environmentIsolated = false;
  let databaseId: string | null = null;
  let cloudflareAccountId: string | null = null;
  let cloudflareApiToken = '';

  if (explicitTargetEnvironment) {
    const envConfig = getWranglerEnvironmentConfig(wrangler.config, explicitTargetEnvironment);
    databaseId = typeof envConfig.d1Binding?.database_id === 'string' ? envConfig.d1Binding.database_id : null;
    const baseDatabaseId = typeof envConfig.baseD1Binding?.database_id === 'string' ? envConfig.baseD1Binding.database_id : null;
    cloudflareApiToken = devVars.values.CLOUDFLARE_API_TOKEN ?? '';
    cloudflareAccountId = inferCloudflareAccountId(
      typeof envConfig.vars.MISTRAL_API_URL === 'string' ? envConfig.vars.MISTRAL_API_URL : null
    );
    environmentIsolated = explicitTargetEnvironment === 'staging'
      ? Boolean(databaseId && baseDatabaseId && databaseId !== baseDatabaseId)
      : false;

    safetyChecks.push({
      check: 'production_forbidden',
      passed: true,
      detail: 'La skill solo admite staging o local; production queda fuera del contrato.'
    });
    safetyChecks.push({
      check: 'shared_runtime_write_acknowledged',
      passed: true,
      detail: explicitTargetEnvironment === 'staging'
        ? (environmentIsolated
          ? 'Staging está aislado, pero la skill igual exige allowlist y lote pequeño.'
          : 'Staging comparte runtime/datos reales; la seguridad depende de allowlist, lote pequeño y audit trail.')
        : 'No aplica porque no se apuntó a staging.'
    });
    safetyChecks.push({
      check: 'local_snapshot_supported',
      passed: explicitTargetEnvironment !== 'local',
      detail: explicitTargetEnvironment === 'local'
        ? 'No existe snapshot local cableado para aplicar cambios de forma segura.'
        : 'No aplica porque no se apuntó a local.'
    });
    safetyChecks.push({
      check: 'd1_credentials_available',
      passed: Boolean(databaseId && cloudflareAccountId && cloudflareApiToken),
      detail: databaseId && cloudflareAccountId && cloudflareApiToken
        ? 'Credenciales y binding D1 disponibles.'
        : 'Faltan credenciales o binding D1 para consultar staging.'
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
    check: 'only_auto_normalizable_scope',
    passed: true,
    detail: 'La ejecución se limita a etiquetas_json del bucket auto_normalizable.'
  });
  safetyChecks.push({
    check: 'apply_allowlist_present',
    passed: mode !== 'apply' || dryRun || allowIds.length > 0,
    detail: mode !== 'apply' || dryRun
      ? 'No aplica porque la skill quedó en preview/dry-run.'
      : allowIds.length > 0
        ? `Allowlist explícita recibida para ${allowIds.length} IDs.`
        : 'Apply exige allowIds explícito para no abrir escrituras amplias.'
  });
  safetyChecks.push({
    check: 'apply_batch_within_safe_limit',
    passed: mode !== 'apply' || dryRun || maxBatchSize <= SAFE_AUTO_NORMALIZATION_APPLY_LIMIT,
    detail: mode !== 'apply' || dryRun
      ? 'No aplica porque la skill quedó en preview/dry-run.'
      : maxBatchSize <= SAFE_AUTO_NORMALIZATION_APPLY_LIMIT
        ? `Batch dentro del límite seguro (${SAFE_AUTO_NORMALIZATION_APPLY_LIMIT}).`
        : `Apply supera el límite seguro de ${SAFE_AUTO_NORMALIZATION_APPLY_LIMIT} cambios.`
  });

  const canQuery = explicitTargetEnvironment === 'staging' && Boolean(databaseId && cloudflareAccountId && cloudflareApiToken);

  if (canQuery) {
    const aggregateQuery = await executeD1<D1AggregateRow>({
      accountId: cloudflareAccountId!,
      apiToken: cloudflareApiToken,
      databaseId: databaseId!,
      queryName: 'auto_normalization_candidate_count',
      sql: `
        SELECT COUNT(*) AS candidate_count
        FROM enriquecimiento e
        JOIN dictamenes d ON d.id = e.dictamen_id
        WHERE d.estado IN ('enriched', 'vectorized')
          AND (
            INSTR(COALESCE(e.etiquetas_json, ''), '_') > 0
            OR INSTR(COALESCE(e.etiquetas_json, ''), '  ') > 0
          )
      `
    });

    const candidatesQuery = await executeD1<CandidateRow>({
      accountId: cloudflareAccountId!,
      apiToken: cloudflareApiToken,
      databaseId: databaseId!,
      queryName: 'auto_normalization_candidates',
      sql: `
        SELECT e.dictamen_id, COALESCE(e.etiquetas_json, '[]') AS etiquetas_json
        FROM enriquecimiento e
        JOIN dictamenes d ON d.id = e.dictamen_id
        WHERE d.estado IN ('enriched', 'vectorized')
          AND (
            INSTR(COALESCE(e.etiquetas_json, ''), '_') > 0
            OR INSTR(COALESCE(e.etiquetas_json, ''), '  ') > 0
          )
        ORDER BY e.dictamen_id ASC
        LIMIT 2000
      `
    });

    for (const error of [aggregateQuery.error, candidatesQuery.error]) {
      if (error) queryErrors.push(error);
    }

    candidateCount = Number(aggregateQuery.rows[0]?.candidate_count ?? 0);

    const candidateRows = candidatesQuery.rows;
    for (const row of candidateRows) {
      const originalLabels = parseLabels(row.etiquetas_json);
      if (originalLabels.length === 0) {
        skippedCount += 1;
        continue;
      }

      const normalized = buildNormalizedLabels(originalLabels, allowedNormalizationTypes);
      if (normalized.skippedReason) {
        changes.push({
          id: row.dictamen_id,
          field: 'etiquetas_json',
          before: row.etiquetas_json,
          after: row.etiquetas_json,
          normalization_type: 'skipped',
          normalization_types: normalized.types,
          applied: false,
          reason_if_skipped: normalized.skippedReason
        });
        skippedCount += 1;
        continue;
      }

      const afterJson = JSON.stringify(normalized.labels);
      if (afterJson === row.etiquetas_json) {
        continue;
      }

      changes.push({
        id: row.dictamen_id,
        field: 'etiquetas_json',
        before: row.etiquetas_json,
        after: afterJson,
        normalization_type: normalized.types.length === 1 ? normalized.types[0] : 'multiple',
        normalization_types: normalized.types,
        applied: false
      });
    }

    const allowIdSet = allowIds.length > 0 ? new Set(allowIds) : null;
    const eligibleChanges = allowIdSet
      ? changes.filter((change) => allowIdSet.has(change.id))
      : changes;
    candidateCount = eligibleChanges.length;
    const selectedChanges = eligibleChanges.slice(0, maxBatchSize);

    if (mode === 'apply' && !dryRun) {
      if (explicitTargetEnvironment !== 'staging') {
        blockedReason = 'apply_requires_staging';
      } else if (allowIds.length === 0) {
        blockedReason = 'apply_allowlist_required';
      } else if (maxBatchSize > SAFE_AUTO_NORMALIZATION_APPLY_LIMIT) {
        blockedReason = 'apply_batch_exceeds_safe_limit';
      } else if (queryErrors.length > 0) {
        blockedReason = 'candidate_selection_failed';
      } else {
        for (const change of selectedChanges) {
          const updateResult = await executeD1<Record<string, never>>({
            accountId: cloudflareAccountId!,
            apiToken: cloudflareApiToken,
            databaseId: databaseId!,
            queryName: `apply_${change.id}`,
            sql: `
              UPDATE enriquecimiento
              SET etiquetas_json = ?
              WHERE dictamen_id = ?
                AND etiquetas_json = ?
            `,
            queryParams: [change.after, change.id, change.before]
          });

          if (updateResult.error) {
            change.reason_if_skipped = updateResult.error;
            skippedCount += 1;
            continue;
          }

          const written = Number(updateResult.meta?.changes ?? updateResult.meta?.rows_written ?? 0);
          if (written > 0) {
            change.applied = true;
            appliedCount += 1;
          } else {
            change.reason_if_skipped = 'stale_source_value_or_noop';
            skippedCount += 1;
          }
        }
      }
    }

    changes.splice(0, changes.length, ...selectedChanges);
  }

  if (mode === 'apply' && !dryRun && !blockedReason && appliedCount === 0 && changes.length > 0) {
    blockedReason = 'no_changes_applied';
  }

  const normalizationGroups = buildNormalizationGroups(changes.filter((change) => change.normalization_types.length > 0));
  const severity = determineSeverity({
    mode,
    applyBlocked: Boolean(blockedReason),
    appliedCount,
    candidateCount,
    plannerSeverity: plannerData.severity
  });

  const nextActions = uniqueStrings([
    blockedReason === 'apply_allowlist_required'
      ? 'Generar preview, seleccionar IDs y reintentar apply con allowIds explícito.'
      : '',
    blockedReason === 'apply_batch_exceeds_safe_limit'
      ? `Reducir el lote a ${SAFE_AUTO_NORMALIZATION_APPLY_LIMIT} o menos antes de aplicar.`
      : '',
    candidateCount > 0 && mode === 'preview'
      ? `Revisar preview de ${Math.min(candidateCount, maxBatchSize)} cambios antes de habilitar apply.`
      : '',
    candidateCount === 0
      ? 'No se detectaron candidatos seguros adicionales bajo la política actual.'
      : '',
    plannerData.next_actions[0] ?? ''
  ]);

  const artifactPayload = {
    createdAt: new Date().toISOString(),
    skill: 'skill_metadata_auto_normalization_executor',
    mode,
    dryRun,
    targetEnvironment,
    allowedNormalizationTypes,
    allowIds,
    safetyChecks,
    candidateCount,
    appliedCount,
    skippedCount,
    changes,
    normalizationGroups,
    queryErrors
  };
  auditTrailPath = await writeAuditArtifact(context.repoRoot, artifactPayload);

  const data: MetadataAutoNormalizationExecutorData = {
    summary: {
      checkedAt: new Date().toISOString(),
      mode,
      targetEnvironment,
      severity,
      headline: mode === 'preview'
        ? `Preview listo para ${candidateCount} candidatos conservadores del bucket auto_normalizable.`
        : blockedReason
          ? `Apply bloqueado: ${blockedReason}.`
          : `Apply ejecutado sobre ${appliedCount} registros.`,
      audit_trail_path: auditTrailPath
    },
    candidate_count: candidateCount,
    applied_count: appliedCount,
    skipped_count: skippedCount,
    normalization_groups: normalizationGroups,
    changes,
    safety_checks: safetyChecks,
    write_summary: {
      attempted: mode === 'apply' && !dryRun,
      applied: appliedCount > 0,
      write_operations: appliedCount,
      blocked_reason: blockedReason
    },
    stats: {
      targetEnvironment,
      mode,
      dryRun,
      maxBatchSize,
      planner: {
        severity: plannerData.severity,
        first_fix_count: plannerData.stats.planner_counts.criticalBlockers,
        semantic_review_count: plannerData.stats.planner_counts.semanticReviewEstimated,
        auto_normalizable_count: plannerData.stats.planner_counts.autoNormalizableLowerBound
      },
      candidateCount,
      selectedCount: changes.length,
      appliedCount,
      skippedCount,
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
      'skill_metadata_auto_normalization_executor',
      context.sessionId,
      'agents-native',
      Date.now() - startedAt
    )
  };
}
