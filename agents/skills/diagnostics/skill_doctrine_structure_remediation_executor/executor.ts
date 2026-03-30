import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SkillContext, SkillExecutionResult } from '../../../types/skill';
import { createSkillMetadata } from '../../../types/skill';
import { readDevVars } from '../../../utils/devVars';
import { readWranglerConfig, type WranglerBindingConfig, type WranglerConfig } from '../../../utils/wranglerConfig';
import {
  executeDoctrineCoherenceAudit,
  type DoctrineCoherenceAuditInput
} from '../skill_doctrine_coherence_audit/executor';

type ExecutionMode = 'preview' | 'apply';
type TargetEnvironment = 'production' | 'local';
type Severity = 'low' | 'medium' | 'high' | 'critical';
type RiskLevel = 'low' | 'medium' | 'high';

interface DoctrineLineResponse {
  title: string;
  summary: string;
  representative_dictamen_id: string;
  doctrinal_state: 'consolidado' | 'en_evolucion' | 'bajo_tension';
  top_fuentes_legales: Array<{ tipo_norma: string; numero: string | null; count: number }>;
  top_descriptores_AI: string[];
  key_dictamenes: Array<{
    id: string;
    titulo: string;
    fecha: string | null;
    rol_en_linea: string;
  }>;
  pivot_dictamen?: {
    id: string;
    titulo: string;
    fecha: string | null;
    signal: string;
    reason: string;
  } | null;
  time_span: {
    from: string | null;
    to: string | null;
  };
  relation_dynamics: {
    dominant_bucket: 'consolida' | 'desarrolla' | 'ajusta' | null;
    summary: string;
  };
  coherence_signals?: {
    cluster_cohesion_score: number;
    semantic_dispersion: number;
    outlier_probability: number;
    descriptor_noise_score: number;
    fragmentation_risk: number;
    coherence_status: 'cohesiva' | 'mixta' | 'fragmentada';
    summary: string;
  };
}

interface DoctrineInsightsResponse {
  overview: {
    totalLines: number;
    materiaEvaluated: string | null;
  };
  lines: DoctrineLineResponse[];
}

interface SafetyCheck {
  check: string;
  passed: boolean;
  detail: string;
}

interface MergePreviewLine {
  id: string;
  title: string;
  doctrinal_state: string;
  top_fuentes_legales: string[];
  top_descriptores_AI: string[];
  pivot_dictamen_id: string | null;
  time_span: {
    from: string | null;
    to: string | null;
  };
}

interface SelectedCandidate {
  action_type: 'suggest_merge_clusters';
  confidence: number;
  rationale: string;
  affected_ids: string[];
  expected_product_impact: 'medium' | 'high';
  risk_level: RiskLevel;
  line_title: string;
  source_line_count: number;
  average_fuente_overlap: number;
  average_descriptor_overlap: number;
  low_risk: boolean;
}

interface BeforeState {
  total_lines_visible: number;
  lines_to_merge: MergePreviewLine[];
}

interface AfterState {
  expected_total_lines_visible: number;
  merged_line: {
    title: string;
    representative_dictamen_id: string;
    merged_cluster_count: number;
    merged_representative_ids: string[];
    top_fuentes_legales: string[];
    top_descriptores_AI: string[];
    pivot_dictamen_id: string | null;
    note: string;
  };
}

interface WriteSummary {
  attempted: boolean;
  applied: boolean;
  blocked_reason: string | null;
  rows_written: number;
}

interface D1ResultMeta {
  changes?: number;
  rows_read?: number;
  rows_written?: number;
}

export interface DoctrineStructureRemediationExecutorInput {
  mode?: ExecutionMode;
  targetEnvironment?: TargetEnvironment;
  limit?: number;
  candidateIndex?: number;
  backendBaseUrl?: string;
  query?: string;
  dryRun?: boolean;
  confirmRepresentativeIds?: string[];
}

export interface DoctrineStructureRemediationExecutorData {
  summary: {
    checkedAt: string;
    mode: ExecutionMode;
    targetEnvironment: TargetEnvironment | 'unknown';
    severity: Severity;
    headline: string;
    audit_trail_path: string | null;
  };
  selected_candidate: SelectedCandidate | null;
  before_state: BeforeState | null;
  after_state: AfterState | null;
  safety_checks: SafetyCheck[];
  write_summary: WriteSummary;
  stats: {
    total_lines_visible: number;
    merge_candidates_seen: number;
    low_risk_merge_candidates: number;
  };
  severity: Severity;
  next_actions: string[];
}

function normalizeMode(value: unknown): ExecutionMode {
  return value === 'apply' ? 'apply' : 'preview';
}

function normalizeTargetEnvironment(value: unknown): TargetEnvironment | null {
  if (value === 'production' || value === 'local') return value;
  return null;
}

function normalizeLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return 8;
  return Math.max(4, Math.min(12, parsed));
}

function normalizeCandidateIndex(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(20, parsed));
}

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeTitle(value: string): string {
  return compactText(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/_/g, ' ')
    .toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function overlapRatio(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const shared = left.filter((item) => rightSet.has(item)).length;
  return round(shared / Math.min(left.length, right.length));
}

function topFuenteKeys(line: DoctrineLineResponse): string[] {
  return line.top_fuentes_legales.map((fuente) => `${fuente.tipo_norma}::${fuente.numero ?? ''}`);
}

function descriptorKeys(line: DoctrineLineResponse): string[] {
  return line.top_descriptores_AI.map((descriptor) => normalizeTitle(descriptor));
}

function averagePairwiseOverlap(lines: DoctrineLineResponse[], extractor: (line: DoctrineLineResponse) => string[]): number {
  if (lines.length < 2) return 0;
  const scores: number[] = [];
  for (let leftIndex = 0; leftIndex < lines.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < lines.length; rightIndex += 1) {
      scores.push(overlapRatio(extractor(lines[leftIndex]), extractor(lines[rightIndex])));
    }
  }
  if (scores.length === 0) return 0;
  return round(scores.reduce((acc, score) => acc + score, 0) / scores.length);
}

function inferSeverity(candidate: SelectedCandidate | null, writeSummary: WriteSummary): Severity {
  if (writeSummary.applied) return 'low';
  if (!candidate) return 'medium';
  if (!candidate.low_risk) return 'high';
  return writeSummary.blocked_reason ? 'medium' : 'low';
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

function getWranglerEnvironmentConfig(
  config: WranglerConfig | null,
  targetEnvironment: TargetEnvironment
): {
  vars: Record<string, unknown>;
  d1Binding: WranglerBindingConfig | null;
} {
  if (!config) return { vars: {}, d1Binding: null };

  if (targetEnvironment === 'production') {
    const production = (config as WranglerConfig & {
      env?: Record<string, { vars?: Record<string, unknown>; d1_databases?: WranglerBindingConfig[] }>;
    }).env?.production;
    return {
      vars: production?.vars ?? config.vars ?? {},
      d1Binding: production?.d1_databases?.[0] ?? config.d1_databases?.[0] ?? null
    };
  }

  return {
    vars: config.vars ?? {},
    d1Binding: config.d1_databases?.[0] ?? null
  };
}

async function queryD1<T>(params: {
  accountId: string;
  apiToken: string;
  databaseId: string;
  sql: string;
  queryName: string;
  queryParams?: Array<string | number | boolean | null>;
}): Promise<{ rows: T[]; meta: D1ResultMeta | null; error: string | null }> {
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
      error: `${params.queryName}: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  const payload = await response.json() as {
    success?: boolean;
    result?: Array<{ results?: T[]; meta?: D1ResultMeta }>;
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || payload.success === false) {
    const detail = payload.errors?.map((entry) => entry.message).filter(Boolean).join('; ') || `HTTP ${response.status}`;
    return {
      rows: [],
      meta: null,
      error: `${params.queryName}: ${detail}`
    };
  }

  const first = payload.result?.[0];
  return {
    rows: first?.results ?? [],
    meta: first?.meta ?? null,
    error: null
  };
}

async function fetchDoctrineLines(backendBaseUrl: string, limit: number): Promise<DoctrineInsightsResponse> {
  const response = await fetch(`${backendBaseUrl}/api/v1/insights/doctrine-lines?limit=${limit}`);
  if (!response.ok) {
    throw new Error(`doctrine-lines returned HTTP ${response.status}`);
  }
  return response.json() as Promise<DoctrineInsightsResponse>;
}

function buildSelectedCandidate(
  candidateAction: {
    confidence: number;
    rationale: string;
    affected_ids: string[];
    expected_product_impact: 'medium' | 'high';
    risk_level: RiskLevel;
  },
  lines: DoctrineLineResponse[]
): SelectedCandidate {
  const averageFuenteOverlap = averagePairwiseOverlap(lines, topFuenteKeys);
  const averageDescriptorOverlap = averagePairwiseOverlap(lines, descriptorKeys);
  const normalizedTitles = uniqueStrings(lines.map((line) => normalizeTitle(line.title)));
  const lowRisk = normalizedTitles.length === 1
    && candidateAction.confidence >= 0.84
    && lines.length >= 2
    && lines.length <= 8
    && (averageFuenteOverlap >= 0.65 || averageDescriptorOverlap >= 0.5);

  return {
    action_type: 'suggest_merge_clusters',
    confidence: candidateAction.confidence,
    rationale: candidateAction.rationale,
    affected_ids: candidateAction.affected_ids,
    expected_product_impact: candidateAction.expected_product_impact,
    risk_level: candidateAction.risk_level,
    line_title: lines[0]?.title ?? 'Sin título',
    source_line_count: lines.length,
    average_fuente_overlap: averageFuenteOverlap,
    average_descriptor_overlap: averageDescriptorOverlap,
    low_risk: lowRisk
  };
}

function buildBeforeState(payload: DoctrineInsightsResponse, lines: DoctrineLineResponse[]): BeforeState {
  return {
    total_lines_visible: payload.overview.totalLines,
    lines_to_merge: lines.map((line) => ({
      id: line.representative_dictamen_id,
      title: line.title,
      doctrinal_state: line.doctrinal_state,
      top_fuentes_legales: line.top_fuentes_legales.map((fuente) => fuente.numero ? `${fuente.tipo_norma} ${fuente.numero}` : fuente.tipo_norma),
      top_descriptores_AI: line.top_descriptores_AI,
      pivot_dictamen_id: line.pivot_dictamen?.id ?? null,
      time_span: line.time_span
    }))
  };
}

function buildAfterState(payload: DoctrineInsightsResponse, selected: SelectedCandidate, lines: DoctrineLineResponse[]): AfterState {
  const topFuentes = uniqueStrings(lines.flatMap((line) => line.top_fuentes_legales.map((fuente) => fuente.numero ? `${fuente.tipo_norma} ${fuente.numero}` : fuente.tipo_norma))).slice(0, 5);
  const topDescriptores = uniqueStrings(lines.flatMap((line) => line.top_descriptores_AI)).slice(0, 5);
  const canonicalRepresentativeId = selected.affected_ids[0];

  return {
    expected_total_lines_visible: Math.max(payload.overview.totalLines - (lines.length - 1), 0),
    merged_line: {
      title: lines[0]?.title ?? 'Sin título',
      representative_dictamen_id: canonicalRepresentativeId,
      merged_cluster_count: lines.length,
      merged_representative_ids: lines.map((line) => line.representative_dictamen_id),
      top_fuentes_legales: topFuentes,
      top_descriptores_AI: topDescriptores,
      pivot_dictamen_id: lines.find((line) => line.representative_dictamen_id === canonicalRepresentativeId)?.pivot_dictamen?.id
        ?? lines.flatMap((line) => line.pivot_dictamen ? [line.pivot_dictamen.id] : [])[0]
        ?? null,
      note: `La línea integrada consolidará ${lines.length} clusters equivalentes en un solo recorrido doctrinal.`
    }
  };
}

async function writeAuditTrail(repoRoot: string, payload: Record<string, unknown>): Promise<string> {
  const directory = path.join(repoRoot, 'agents', 'out', 'doctrine-structure-remediation');
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}

export async function executeDoctrineStructureRemediationExecutor(
  context: SkillContext,
  input: DoctrineStructureRemediationExecutorInput = {}
): Promise<SkillExecutionResult<DoctrineStructureRemediationExecutorData>> {
  const startedAt = Date.now();
  const mode = normalizeMode(input.mode);
  const explicitTargetEnvironment = normalizeTargetEnvironment(input.targetEnvironment);
  const targetEnvironment = explicitTargetEnvironment ?? 'unknown';
  const limit = normalizeLimit(input.limit);
  const candidateIndex = normalizeCandidateIndex(input.candidateIndex);
  const confirmRepresentativeIds = normalizeIds(input.confirmRepresentativeIds);
  const dryRun = input.dryRun === true;
  const safetyChecks: SafetyCheck[] = [];
  let auditTrailPath: string | null = null;

  const coherenceInput: DoctrineCoherenceAuditInput = {
    limit,
    mode: limit > 6 ? 'standard' : 'quick',
    backendBaseUrl: typeof input.backendBaseUrl === 'string' && input.backendBaseUrl.trim().length > 0
      ? input.backendBaseUrl.trim().replace(/\/$/, '')
      : 'https://cgr-platform.abogado.workers.dev',
    query: typeof input.query === 'string' && input.query.trim().length > 0
      ? input.query.trim()
      : undefined
  };

  const coherenceResult = await executeDoctrineCoherenceAudit(context, coherenceInput);
  const payload = coherenceInput.query
    ? await (async () => {
        const response = await fetch(
          `${coherenceInput.backendBaseUrl!}/api/v1/insights/doctrine-search?q=${encodeURIComponent(coherenceInput.query!)}&limit=${limit}`
        );
        if (!response.ok) {
          throw new Error(`doctrine-search returned HTTP ${response.status}`);
        }
        return response.json() as Promise<DoctrineInsightsResponse>;
      })()
    : await fetchDoctrineLines(coherenceInput.backendBaseUrl!, limit);
  const mergeCandidates = coherenceResult.data.candidate_actions.filter((candidate) => candidate.action_type === 'suggest_merge_clusters');
  const selectedRaw = mergeCandidates[candidateIndex] ?? null;

  let selectedCandidate: SelectedCandidate | null = null;
  let beforeState: BeforeState | null = null;
  let afterState: AfterState | null = null;
  let writeSummary: WriteSummary = {
    attempted: false,
    applied: false,
    blocked_reason: null,
    rows_written: 0
  };

  if (selectedRaw) {
    const selectedLines = payload.lines.filter((line) => selectedRaw.affected_ids.includes(line.representative_dictamen_id));
    selectedCandidate = buildSelectedCandidate(selectedRaw, selectedLines);
    beforeState = buildBeforeState(payload, selectedLines);
    afterState = buildAfterState(payload, selectedCandidate, selectedLines);
  }

  safetyChecks.push({
    check: 'target_environment_explicit',
    passed: explicitTargetEnvironment !== null,
    detail: explicitTargetEnvironment
      ? `Se usará ${explicitTargetEnvironment}.`
      : 'La skill exige targetEnvironment explícito para preview o apply.'
  });
  safetyChecks.push({
    check: 'preview_default',
    passed: mode === 'preview' || input.mode === 'apply',
    detail: mode === 'preview'
      ? 'La skill quedó en preview por defecto.'
      : 'Se solicitó apply explícitamente.'
  });
  safetyChecks.push({
    check: 'single_merge_only',
    passed: true,
    detail: 'La skill solo selecciona y ejecuta un merge candidate por corrida.'
  });
  safetyChecks.push({
    check: 'candidate_available',
    passed: Boolean(selectedCandidate),
    detail: selectedCandidate
      ? `Se seleccionó ${selectedCandidate.line_title}.`
      : 'No se encontró un candidate_action de tipo suggest_merge_clusters.'
  });
  safetyChecks.push({
    check: 'candidate_low_risk',
    passed: Boolean(selectedCandidate?.low_risk),
    detail: selectedCandidate
      ? `Confianza ${selectedCandidate.confidence}, overlap fuentes ${selectedCandidate.average_fuente_overlap}, overlap descriptores ${selectedCandidate.average_descriptor_overlap}.`
      : 'No aplica porque no hay candidato.'
  });
  safetyChecks.push({
    check: 'confirm_representative_ids_for_apply',
    passed: mode !== 'apply' || dryRun || (
      selectedCandidate !== null
      && confirmRepresentativeIds.length > 0
      && selectedCandidate.affected_ids.every((id) => confirmRepresentativeIds.includes(id))
    ),
    detail: mode !== 'apply' || dryRun
      ? 'No aplica porque la skill quedó en preview/dry-run.'
      : confirmRepresentativeIds.length > 0
        ? `Confirmación explícita recibida para ${confirmRepresentativeIds.length} IDs.`
        : 'Apply exige confirmRepresentativeIds para el merge seleccionado.'
  });

  const wrangler = await readWranglerConfig(context.repoRoot);
  const devVars = await readDevVars(context.repoRoot);
  let databaseId: string | null = null;
  let accountId: string | null = null;
  let apiToken = '';

  if (explicitTargetEnvironment) {
    const envConfig = getWranglerEnvironmentConfig(wrangler.config, explicitTargetEnvironment);
    databaseId = typeof envConfig.d1Binding?.database_id === 'string' ? envConfig.d1Binding.database_id : null;
    apiToken = devVars.values.CLOUDFLARE_API_TOKEN ?? '';
    accountId = inferCloudflareAccountId(
      typeof envConfig.vars.MISTRAL_API_URL === 'string' ? envConfig.vars.MISTRAL_API_URL : null
    );
  }

  safetyChecks.push({
    check: 'production_credentials_available',
    passed: mode !== 'apply' || dryRun || Boolean(databaseId && accountId && apiToken),
    detail: mode !== 'apply' || dryRun
      ? 'No aplica porque la skill quedó en preview/dry-run.'
      : databaseId && accountId && apiToken
        ? 'Credenciales D1 disponibles para persistir la remediación derivada.'
        : 'Faltan credenciales D1 para persistir el merge en production.'
  });

  if (mode === 'apply' && !dryRun) {
    writeSummary.attempted = true;

    const failedCheck = safetyChecks.find((check) => !check.passed);
    if (failedCheck) {
      writeSummary.blocked_reason = failedCheck.check;
    } else if (!selectedCandidate || !beforeState || !afterState || !databaseId || !accountId || !apiToken) {
      writeSummary.blocked_reason = 'missing_apply_context';
    } else {
      const createTable = await queryD1<Record<string, never>>({
        accountId,
        apiToken,
        databaseId,
        queryName: 'create_doctrine_structure_remediations_table',
        sql: `
          CREATE TABLE IF NOT EXISTS doctrine_structure_remediations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action_type TEXT NOT NULL,
            action_status TEXT NOT NULL DEFAULT 'applied',
            normalized_title TEXT NOT NULL,
            canonical_title TEXT NOT NULL,
            canonical_representative_id TEXT NOT NULL,
            merged_representative_ids_json TEXT NOT NULL,
            confidence_score REAL NOT NULL DEFAULT 0.0,
            rationale TEXT,
            metadata_json TEXT,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `
      });

      if (createTable.error) {
        writeSummary.blocked_reason = createTable.error;
      } else {
        const createIndex = await queryD1<Record<string, never>>({
          accountId,
          apiToken,
          databaseId,
          queryName: 'create_doctrine_structure_remediations_unique_index',
          sql: `
            CREATE UNIQUE INDEX IF NOT EXISTS idx_doctrine_structure_remediations_unique
              ON doctrine_structure_remediations(action_type, normalized_title, canonical_representative_id)
          `
        });

        if (createIndex.error) {
          writeSummary.blocked_reason = createIndex.error;
        } else {
          const upsert = await queryD1<Record<string, never>>({
            accountId,
            apiToken,
            databaseId,
            queryName: 'upsert_merge_cluster_override',
            sql: `
              INSERT INTO doctrine_structure_remediations (
                action_type,
                action_status,
                normalized_title,
                canonical_title,
                canonical_representative_id,
                merged_representative_ids_json,
                confidence_score,
                rationale,
                metadata_json,
                created_by,
                updated_at
              ) VALUES (?, 'applied', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT(action_type, normalized_title, canonical_representative_id)
              DO UPDATE SET
                action_status = excluded.action_status,
                merged_representative_ids_json = excluded.merged_representative_ids_json,
                confidence_score = excluded.confidence_score,
                rationale = excluded.rationale,
                metadata_json = excluded.metadata_json,
                created_by = excluded.created_by,
                updated_at = datetime('now')
            `,
            queryParams: [
              'merge_clusters',
              normalizeTitle(selectedCandidate.line_title),
              selectedCandidate.line_title,
              selectedCandidate.affected_ids[0],
              JSON.stringify(selectedCandidate.affected_ids),
              selectedCandidate.confidence,
              selectedCandidate.rationale,
              JSON.stringify({
                before_state: beforeState,
                after_state: afterState
              }),
              'skill_doctrine_structure_remediation_executor'
            ]
          });

          if (upsert.error) {
            writeSummary.blocked_reason = upsert.error;
          } else {
            writeSummary.applied = true;
            writeSummary.rows_written = Number(upsert.meta?.rows_written ?? upsert.meta?.changes ?? 1);
          }
        }
      }
    }
  }

  const severity = inferSeverity(selectedCandidate, writeSummary);
  const headline = !selectedCandidate
    ? 'No se encontró un merge doctrinal candidato en la muestra revisada.'
    : writeSummary.applied
      ? `Se aplicó un merge doctrinal de bajo riesgo para ${selectedCandidate.line_title}.`
      : `Se preparó un merge doctrinal para ${selectedCandidate.line_title}${writeSummary.blocked_reason ? `, pero apply quedó bloqueado por ${writeSummary.blocked_reason}.` : '.'}`;

  auditTrailPath = await writeAuditTrail(context.repoRoot, {
    summary: {
      checkedAt: new Date().toISOString(),
      mode,
      targetEnvironment,
      severity,
      headline
    },
    selected_candidate: selectedCandidate,
    before_state: beforeState,
    after_state: afterState,
    safety_checks: safetyChecks,
    write_summary: writeSummary
  });

  const data: DoctrineStructureRemediationExecutorData = {
    summary: {
      checkedAt: new Date().toISOString(),
      mode,
      targetEnvironment,
      severity,
      headline,
      audit_trail_path: auditTrailPath
    },
    selected_candidate: selectedCandidate,
    before_state: beforeState,
    after_state: afterState,
    safety_checks: safetyChecks,
    write_summary: writeSummary,
    stats: {
      total_lines_visible: payload.overview.totalLines,
      merge_candidates_seen: mergeCandidates.length,
      low_risk_merge_candidates: mergeCandidates.length > 0 && selectedCandidate?.low_risk ? 1 : 0
    },
    severity,
    next_actions: writeSummary.applied
      ? [
          'Desplegar backend y frontend para reflejar la remediación estructural en la web visible.',
          'Validar doctrine-lines y doctrine-search sobre la materia afectada para confirmar reducción de duplicación.'
        ]
      : [
          'Revisar el before/after del merge seleccionado.',
          'Ejecutar apply con confirmRepresentativeIds si el candidato sigue siendo de bajo riesgo.'
        ]
  };

  return {
    status: 'success',
    data,
    metadata: createSkillMetadata(
      'skill_doctrine_structure_remediation_executor',
      context.sessionId,
      'agents-native',
      Date.now() - startedAt
    )
  };
}
