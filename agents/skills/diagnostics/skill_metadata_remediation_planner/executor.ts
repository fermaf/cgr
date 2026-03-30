import type { SkillContext, SkillExecutionResult } from '../../../types/skill';
import { createSkillMetadata } from '../../../types/skill';
import { readWranglerConfig, type WranglerBindingConfig, type WranglerConfig } from '../../../utils/wranglerConfig';
import { readDevVars } from '../../../utils/devVars';
import {
  executeMetadataQualityAudit,
  type MetadataQualityAuditData,
  type MetadataQualityAuditInput
} from '../skill_metadata_quality_audit/executor';

type CheckMode = 'quick' | 'standard';
type Severity = 'low' | 'medium' | 'high' | 'critical';
type TargetEnvironment = 'staging' | 'local';
type Priority = 'P0' | 'P1' | 'P2' | 'P3';
type RiskLevel = 'low' | 'medium' | 'high';
type Bucket = 'critical_blockers' | 'auto_normalizable' | 'needs_semantic_review' | 'low_priority_noise';
type StrategyDecision = 'keep' | 'normalize' | 'review' | 'defer';
type ProductImpact = 'high' | 'medium' | 'low';

export interface MetadataRemediationPlannerInput {
  mode?: CheckMode;
  targetEnvironment?: TargetEnvironment;
  maxSuggestedBatches?: number;
  includeExamples?: boolean;
  includeAutoFixEligibility?: boolean;
}

interface RemediationPlanItem {
  order: number;
  batch_id: string;
  objective: string;
  why_now: string;
  expected_product_gain: string;
  risk_level: RiskLevel;
}

interface BatchPlan {
  batch_id: string;
  bucket: Bucket;
  priority: Priority;
  estimated_count: number;
  risk_level: RiskLevel;
  auto_fix_eligible: boolean;
  product_impact: ProductImpact;
  rationale: string;
  sample_ids: string[];
  recommended_execution_style: string;
}

interface StrategyByBucket {
  bucket: Bucket;
  decision: StrategyDecision;
  why: string;
  expected_product_gain: string;
}

interface PlannerStats {
  targetEnvironment: TargetEnvironment;
  mode: CheckMode;
  maxSuggestedBatches: number;
  includeExamples: boolean;
  includeAutoFixEligibility: boolean;
  source_audit: {
    severity: Severity;
    auditedCount: number;
    blockingRecords: number;
    longMateria: number;
    resolutionVerbMateria: number;
    sampleNarrativeMateria: number;
    sampleWeakResumen: number;
  };
  planner_counts: {
    criticalBlockers: number;
    autoNormalizableLowerBound: number;
    semanticReviewEstimated: number;
    lowPriorityDeferred: number;
  };
  query_support: {
    blockerIdsResolved: number;
    autoFixIdsResolved: number;
    queryErrors: string[];
  };
}

export interface MetadataRemediationPlannerData {
  summary: {
    checkedAt: string;
    mode: CheckMode;
    targetEnvironment: TargetEnvironment;
    severity: Severity;
    headline: string;
  };
  remediation_plan: RemediationPlanItem[];
  batches: BatchPlan[];
  strategy_by_bucket: StrategyByBucket[];
  stats: PlannerStats;
  severity: Severity;
  next_actions: string[];
}

interface D1PlannerRow {
  id: string;
  etiquetas_json: string;
}

interface D1FormattingAggregateRow {
  underscore_label_rows: number;
  double_space_label_rows: number;
}

function normalizeMode(mode: unknown): CheckMode {
  return mode === 'standard' ? 'standard' : 'quick';
}

function normalizeTargetEnvironment(value: unknown): TargetEnvironment {
  return value === 'local' ? 'local' : 'staging';
}

function normalizeMaxSuggestedBatches(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return 4;
  return Math.max(1, Math.min(6, parsed));
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
      if (typeof entry === 'string') return [compactText(entry)];
      if (entry && typeof entry === 'object' && typeof (entry as { label?: unknown }).label === 'string') {
        return [compactText(String((entry as { label: string }).label))];
      }
      return [];
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeLabel(value: string): string {
  return normalizeText(value.replace(/_/g, ' '));
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
} {
  if (!config) {
    return { vars: {}, d1Binding: null };
  }

  if (targetEnvironment === 'staging') {
    const staging = (config as WranglerConfig & {
      env?: Record<string, { vars?: Record<string, unknown>; d1_databases?: WranglerBindingConfig[] }>;
    }).env?.staging;
    return {
      vars: staging?.vars ?? {},
      d1Binding: staging?.d1_databases?.[0] ?? null
    };
  }

  return {
    vars: config.vars ?? {},
    d1Binding: config.d1_databases?.[0] ?? null
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
      error: `${params.queryName}: network_error ${error instanceof Error ? error.message : String(error)}`
    };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      rows: [],
      error: `${params.queryName}: HTTP ${response.status} ${body.slice(0, 240)}`
    };
  }

  const payload = await response.json() as {
    success?: boolean;
    errors?: Array<{ message?: string }>;
    result?: Array<{ success?: boolean; results?: T[] }>;
  };

  if (payload.success === false) {
    return {
      rows: [],
      error: `${params.queryName}: ${payload.errors?.map((entry) => entry.message).filter(Boolean).join('; ') || 'query failed'}`
    };
  }

  return {
    rows: payload.result?.[0]?.results ?? [],
    error: null
  };
}

function findFinding(auditData: MetadataQualityAuditData, type: string) {
  return auditData.findings.find((finding) => finding.type === type);
}

function estimateSemanticReviewCount(auditData: MetadataQualityAuditData): number {
  const total = auditData.stats.d1.aggregate.auditedCount;
  const sampleNarrative = auditData.stats.d1.sample.narrativeMateria;
  const sampleInspected = auditData.stats.d1.sample.inspectedCount;
  if (sampleInspected > 0 && sampleNarrative === sampleInspected) return total;
  return Math.max(
    auditData.stats.d1.aggregate.longMateria,
    auditData.stats.d1.aggregate.resolutionVerbMateria,
    0
  );
}

function inferOverallSeverity(batches: BatchPlan[]): Severity {
  if (batches.some((batch) => batch.priority === 'P0')) return 'critical';
  if (batches.some((batch) => batch.priority === 'P1')) return 'high';
  if (batches.some((batch) => batch.priority === 'P2')) return 'medium';
  return 'low';
}

function buildHeadline(batches: BatchPlan[]): string {
  if (batches.length === 0) {
    return 'No se sugirieron batches de remediación en la revisión actual.';
  }

  const top = batches[0];
  return `Se sugieren ${batches.length} batches; el primero es ${top.batch_id} para ${top.bucket} con prioridad ${top.priority}.`;
}

export async function executeMetadataRemediationPlanner(
  context: SkillContext,
  rawInput: MetadataRemediationPlannerInput = {}
): Promise<SkillExecutionResult<MetadataRemediationPlannerData>> {
  const startedAt = Date.now();
  const mode = normalizeMode(rawInput.mode);
  const targetEnvironment = normalizeTargetEnvironment(rawInput.targetEnvironment);
  const maxSuggestedBatches = normalizeMaxSuggestedBatches(rawInput.maxSuggestedBatches);
  const includeExamples = rawInput.includeExamples !== false;
  const includeAutoFixEligibility = rawInput.includeAutoFixEligibility !== false;

  const auditInput: MetadataQualityAuditInput = {
    mode,
    targetEnvironment,
    includeExamples,
    includeProductImpact: true
  };
  const auditResult = await executeMetadataQualityAudit(context, auditInput);
  const auditData = auditResult.data;

  const wrangler = await readWranglerConfig(context.repoRoot);
  const devVars = await readDevVars(context.repoRoot);
  const envConfig = getWranglerEnvironmentConfig(wrangler.config, targetEnvironment);
  const databaseId = typeof envConfig.d1Binding?.database_id === 'string' ? envConfig.d1Binding.database_id : null;
  const cloudflareApiToken = devVars.values.CLOUDFLARE_API_TOKEN ?? '';
  const cloudflareAccountId = inferCloudflareAccountId(
    typeof envConfig.vars.MISTRAL_API_URL === 'string' ? envConfig.vars.MISTRAL_API_URL : null
  );

  const queryErrors: string[] = [];
  let blockerIds: string[] = [];
  let autoFixIds: string[] = [];
  let autoFixLowerBound = 0;

  if (targetEnvironment === 'staging' && databaseId && cloudflareApiToken && cloudflareAccountId) {
    const blockerQuery = await queryD1<D1PlannerRow>({
      accountId: cloudflareAccountId,
      apiToken: cloudflareApiToken,
      databaseId,
      queryName: 'planner_blockers',
      sql: `
        SELECT d.id, COALESCE(TRIM(e.etiquetas_json), '[]') AS etiquetas_json
        FROM dictamenes d
        LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
        WHERE d.estado IN ('enriched', 'vectorized')
          AND (
            TRIM(COALESCE(e.titulo, '')) = ''
            OR TRIM(COALESCE(e.resumen, '')) = ''
            OR TRIM(COALESCE(e.analisis, '')) = ''
            OR TRIM(COALESCE(e.etiquetas_json, '')) IN ('', '[]', 'null')
          )
        ORDER BY d.id ASC
        LIMIT 50
      `
    });

    const formattingAggregateQuery = includeAutoFixEligibility
      ? await queryD1<D1FormattingAggregateRow>({
          accountId: cloudflareAccountId,
          apiToken: cloudflareApiToken,
          databaseId,
          queryName: 'planner_auto_fix_aggregate',
          sql: `
            SELECT
              SUM(CASE WHEN INSTR(COALESCE(e.etiquetas_json, ''), '_') > 0 THEN 1 ELSE 0 END) AS underscore_label_rows,
              SUM(CASE WHEN INSTR(COALESCE(e.etiquetas_json, ''), '  ') > 0 THEN 1 ELSE 0 END) AS double_space_label_rows
            FROM dictamenes d
            LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
            WHERE d.estado IN ('enriched', 'vectorized')
          `
        })
      : { rows: [], error: null };

    const formattingIdsQuery = includeAutoFixEligibility
      ? await queryD1<D1PlannerRow>({
          accountId: cloudflareAccountId,
          apiToken: cloudflareApiToken,
          databaseId,
          queryName: 'planner_auto_fix_ids',
          sql: `
            SELECT d.id, COALESCE(TRIM(e.etiquetas_json), '[]') AS etiquetas_json
            FROM dictamenes d
            LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
            WHERE d.estado IN ('enriched', 'vectorized')
              AND (
                INSTR(COALESCE(e.etiquetas_json, ''), '_') > 0
                OR INSTR(COALESCE(e.etiquetas_json, ''), '  ') > 0
              )
            ORDER BY d.id ASC
            LIMIT 50
          `
        })
      : { rows: [], error: null };

    for (const error of [blockerQuery.error, formattingAggregateQuery.error, formattingIdsQuery.error]) {
      if (error) queryErrors.push(error);
    }

    blockerIds = blockerQuery.rows.map((row) => row.id);

    if (includeAutoFixEligibility) {
      const aggregateRow = formattingAggregateQuery.rows[0];
      const idsFromQuery = formattingIdsQuery.rows.map((row) => row.id);
      const idsFromParsedLabels = formattingIdsQuery.rows
        .filter((row) => {
          const labels = parseLabels(row.etiquetas_json);
          const normalized = labels.map(normalizeLabel).filter(Boolean);
          const duplicateNormalized = normalized.length - new Set(normalized).size;
          return labels.some((label) => label.includes('_') || /\s{2,}/.test(label)) || duplicateNormalized > 0;
        })
        .map((row) => row.id);
      autoFixIds = uniqueStrings([...idsFromQuery, ...idsFromParsedLabels]).slice(0, 20);
      autoFixLowerBound = Math.max(
        Number(aggregateRow?.underscore_label_rows ?? 0),
        Number(aggregateRow?.double_space_label_rows ?? 0),
        autoFixIds.length
      );
    }
  }

  const totalAudited = auditData.stats.d1.aggregate.auditedCount;
  const blockingRecords = auditData.stats.d1.aggregate.blockingRecords;
  const semanticReviewEstimated = estimateSemanticReviewCount(auditData);
  const weakResumenCount = auditData.stats.d1.sample.weakResumen;
  const autoFixBatchCount = includeAutoFixEligibility ? autoFixLowerBound : 0;
  const lowPriorityDeferred = Math.max(0, totalAudited - Math.max(semanticReviewEstimated, blockingRecords));

  const semanticExamples = findFinding(auditData, 'materia_narrativa_o_pseudo_resumen')?.affected_examples ?? [];
  const blockerExamples = findFinding(auditData, 'campos_doctrinales_bloqueantes')?.affected_examples ?? [];

  const batches: BatchPlan[] = [];

  if (blockingRecords > 0) {
    batches.push({
      batch_id: 'first_fix_batch',
      bucket: 'critical_blockers',
      priority: 'P0',
      estimated_count: blockingRecords,
      risk_level: 'medium',
      auto_fix_eligible: false,
      product_impact: 'high',
      rationale: 'Campos doctrinales vacíos bloquean key_dictamenes, títulos visibles y explicabilidad inmediata.',
      sample_ids: includeExamples ? blockerIds.slice(0, 10) : [],
      recommended_execution_style: 'manual_review_then_targeted_regeneration'
    });
  }

  if (includeAutoFixEligibility && autoFixBatchCount > 0) {
    batches.push({
      batch_id: 'presentation_normalization_batch',
      bucket: 'auto_normalizable',
      priority: blockingRecords > 0 ? 'P1' : 'P0',
      estimated_count: autoFixBatchCount,
      risk_level: 'low',
      auto_fix_eligible: true,
      product_impact: 'medium',
      rationale: 'Existe una cohorte conservadora de labels con patrones triviales normalizables sin reinterpretar doctrina.',
      sample_ids: includeExamples ? autoFixIds.slice(0, 10) : [],
      recommended_execution_style: 'deterministic_preview_then_batch_normalization'
    });
  }

  if (semanticReviewEstimated > 0) {
    batches.push({
      batch_id: 'semantic_review_batch',
      bucket: 'needs_semantic_review',
      priority: blockingRecords > 0 ? 'P1' : 'P0',
      estimated_count: semanticReviewEstimated,
      risk_level: 'high',
      auto_fix_eligible: false,
      product_impact: 'high',
      rationale: 'La materia narrativa y pseudo-resumida degrada cluster labels, dominantTheme y doctrine-lines; no conviene tocarla a ciegas.',
      sample_ids: includeExamples ? semanticExamples.map((example) => example.id).slice(0, 10) : [],
      recommended_execution_style: 'rule_assisted_semantic_review_in_small_batches'
    });
  }

  if (lowPriorityDeferred > 0 && batches.length < maxSuggestedBatches) {
    batches.push({
      batch_id: 'defer_batch',
      bucket: 'low_priority_noise',
      priority: 'P3',
      estimated_count: lowPriorityDeferred,
      risk_level: 'low',
      auto_fix_eligible: false,
      product_impact: 'low',
      rationale: 'Existe ruido residual con retorno marginal comparado con blockers y deuda semántica dominante.',
      sample_ids: [],
      recommended_execution_style: 'defer_until_core_metadata_is_stable'
    });
  }

  batches.sort((left, right) => {
    const priorityRank: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return priorityRank[left.priority] - priorityRank[right.priority]
      || severityRank(right.product_impact === 'high' ? 'high' : right.product_impact === 'medium' ? 'medium' : 'low')
        - severityRank(left.product_impact === 'high' ? 'high' : left.product_impact === 'medium' ? 'medium' : 'low');
  });

  const limitedBatches = batches.slice(0, maxSuggestedBatches);
  const remediationPlan: RemediationPlanItem[] = limitedBatches.map((batch, index) => ({
    order: index + 1,
    batch_id: batch.batch_id,
    objective: batch.bucket === 'critical_blockers'
      ? 'Cerrar la lista exacta de registros con metadata doctrinal vacía.'
      : batch.bucket === 'auto_normalizable'
        ? 'Normalizar presentación sin reinterpretar doctrina.'
        : batch.bucket === 'needs_semantic_review'
          ? 'Separar deuda semántica por lotes manejables para revisión.'
          : 'Posponer ruido menor hasta estabilizar el corpus visible.',
    why_now: batch.bucket === 'critical_blockers'
      ? 'Porque degrada directamente UI y key_dictamenes.'
      : batch.bucket === 'auto_normalizable'
        ? 'Porque es barato, seguro y reduce fricción visible.'
        : batch.bucket === 'needs_semantic_review'
          ? 'Porque hoy es la principal fuente de labels doctrinales pobres.'
          : 'Porque no compite bien contra deuda con impacto alto.',
    expected_product_gain: batch.bucket === 'critical_blockers'
      ? 'Mejorar títulos visibles y evitar resultados doctrinales vacíos.'
      : batch.bucket === 'auto_normalizable'
        ? 'Reducir ruido de presentación y dejar base lista para fix batch futuro.'
        : batch.bucket === 'needs_semantic_review'
          ? 'Mejorar dominantTheme, cluster_label y doctrine-lines.'
          : 'Evitar trabajo de bajo retorno antes de sanear lo importante.',
    risk_level: batch.risk_level
  }));

  const strategyByBucket: StrategyByBucket[] = [
    {
      bucket: 'critical_blockers',
      decision: blockingRecords > 0 ? 'review' : 'keep',
      why: blockingRecords > 0
        ? 'Los vacíos exactos requieren completar contenido, no normalización superficial.'
        : 'No hay blockers exactos que justifiquen una intervención dedicada.'
      ,
      expected_product_gain: 'Recupera UI visible, key_dictamenes y confianza en resultados demo.'
    },
    {
      bucket: 'auto_normalizable',
      decision: autoFixBatchCount > 0 ? 'normalize' : 'defer',
      why: autoFixBatchCount > 0
        ? 'Hay patrones triviales de formato que pueden corregirse de forma determinística.'
        : 'No hay evidencia suficiente de una cohorte grande y segura para auto-fix en esta pasada.'
      ,
      expected_product_gain: 'Reduce ruido de labels sin tocar el sentido jurídico.'
    },
    {
      bucket: 'needs_semantic_review',
      decision: semanticReviewEstimated > 0 ? 'review' : 'keep',
      why: semanticReviewEstimated > 0
        ? 'La materia narrativa domina la cohorte y tocarla automáticamente sería riesgoso.'
        : 'No apareció deuda semántica material en esta cohorte.'
      ,
      expected_product_gain: 'Mejora naming doctrinal, clustering y doctrine-lines.'
    },
    {
      bucket: 'low_priority_noise',
      decision: lowPriorityDeferred > 0 ? 'defer' : 'keep',
      why: lowPriorityDeferred > 0
        ? 'Su retorno es menor que blockers y revisión semántica.'
        : 'No se detectó ruido menor que amerite backlog separado.'
      ,
      expected_product_gain: 'Evita dispersar esfuerzo antes de estabilizar lo visible.'
    }
  ];

  const severity = inferOverallSeverity(limitedBatches);
  const nextActions = uniqueStrings([
    blockingRecords > 0 ? `Operar primero first_fix_batch sobre ${blockingRecords} registros exactos.` : '',
    includeAutoFixEligibility && autoFixBatchCount > 0
      ? `Preparar preview de normalización determinística para ${autoFixBatchCount} candidatos conservadores.`
      : '',
    semanticReviewEstimated > 0
      ? `Diseñar lotes semánticos pequeños para ${semanticReviewEstimated} registros narrativos o pseudo-resumidos.`
      : '',
    queryErrors.length > 0
      ? 'Resolver errores de soporte D1 antes de automatizar cualquier planificación posterior.'
      : ''
  ]);

  const data: MetadataRemediationPlannerData = {
    summary: {
      checkedAt: new Date().toISOString(),
      mode,
      targetEnvironment,
      severity,
      headline: buildHeadline(limitedBatches)
    },
    remediation_plan: remediationPlan,
    batches: limitedBatches,
    strategy_by_bucket: strategyByBucket,
    stats: {
      targetEnvironment,
      mode,
      maxSuggestedBatches,
      includeExamples,
      includeAutoFixEligibility,
      source_audit: {
        severity: auditData.severity,
        auditedCount: totalAudited,
        blockingRecords,
        longMateria: auditData.stats.d1.aggregate.longMateria,
        resolutionVerbMateria: auditData.stats.d1.aggregate.resolutionVerbMateria,
        sampleNarrativeMateria: auditData.stats.d1.sample.narrativeMateria,
        sampleWeakResumen: weakResumenCount
      },
      planner_counts: {
        criticalBlockers: blockingRecords,
        autoNormalizableLowerBound: autoFixBatchCount,
        semanticReviewEstimated,
        lowPriorityDeferred
      },
      query_support: {
        blockerIdsResolved: blockerIds.length,
        autoFixIdsResolved: autoFixIds.length,
        queryErrors
      }
    },
    severity,
    next_actions: nextActions
  };

  return {
    status: 'success',
    data,
    metadata: createSkillMetadata(
      'skill_metadata_remediation_planner',
      context.sessionId,
      'agents-native',
      Date.now() - startedAt
    )
  };
}
