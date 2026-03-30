import type { SkillContext, SkillExecutionResult } from '../../../types/skill';
import { createSkillMetadata } from '../../../types/skill';
import { readWranglerConfig, type WranglerBindingConfig, type WranglerConfig } from '../../../utils/wranglerConfig';
import { readDevVars } from '../../../utils/devVars';

type CheckMode = 'quick' | 'standard';
type Severity = 'low' | 'medium' | 'high' | 'critical';
type TargetEnvironment = 'staging' | 'local';
type ImpactArea =
  | 'doctrine_lines'
  | 'doctrine_search'
  | 'doctrine_clusters'
  | 'query_match_reason'
  | 'key_dictamenes'
  | 'demo_titles'
  | 'cluster_label'
  | 'dominantTheme'
  | 'materiaEvaluated';
type RemediationBucketName =
  | 'auto_normalizable'
  | 'needs_semantic_review'
  | 'low_priority_noise'
  | 'product_blocking_noise';

export interface MetadataQualityAuditInput {
  sampleSize?: number;
  mode?: CheckMode;
  targetEnvironment?: TargetEnvironment;
  includeProductImpact?: boolean;
  includeExamples?: boolean;
}

interface AuditExample {
  id: string;
  materia: string;
  titulo: string;
  resumen_preview: string;
  labels: string[];
  issues: string[];
}

interface Finding {
  type: string;
  severity: Severity;
  evidence: Record<string, unknown>;
  likely_cause: string;
  impact_area: ImpactArea[];
  affected_examples: AuditExample[];
  recommendation: string;
  auto_fix_candidate: boolean;
}

interface RemediationBucket {
  bucket: RemediationBucketName;
  severity: Severity;
  sample_count: number;
  estimated_corpus_count: number;
  rationale: string;
  recommended_strategy: string;
  examples: AuditExample[];
}

interface AggregateStats {
  auditedCount: number;
  enrichedCount: number;
  vectorizedCount: number;
  blockingRecords: number;
  emptyMateria: number;
  longMateria: number;
  resolutionVerbMateria: number;
  emptyTitulo: number;
  emptyResumen: number;
  shortResumen: number;
  emptyAnalisis: number;
  shortAnalisis: number;
  emptyLabels: number;
}

interface SampleStats {
  inspectedCount: number;
  emptyMateria: number;
  narrativeMateria: number;
  genericLabels: number;
  formattingOnlyLabels: number;
  weakTitle: number;
  weakResumen: number;
  weakAnalisis: number;
  matterDescriptorMismatch: number;
  productBlocking: number;
}

interface MetadataAuditStats {
  targetEnvironment: TargetEnvironment;
  mode: CheckMode;
  sampleSize: number;
  includeProductImpact: boolean;
  includeExamples: boolean;
  d1: {
    available: boolean;
    databaseName: string | null;
    aggregate: AggregateStats;
    sample: SampleStats;
  };
  productImpact: Record<ImpactArea, { sample_count: number; estimated_corpus_count: number }>;
}

export interface MetadataQualityAuditData {
  summary: {
    checkedAt: string;
    mode: CheckMode;
    targetEnvironment: TargetEnvironment;
    severity: Severity;
    headline: string;
  };
  findings: Finding[];
  stats: MetadataAuditStats;
  severity: Severity;
  recommended_actions: string[];
  remediation_buckets: RemediationBucket[];
}

interface D1AggregateRow {
  audited_count: number;
  enriched_count: number;
  vectorized_count: number;
  blocking_record_count: number;
  empty_materia: number;
  long_materia: number;
  resolution_verb_materia: number;
  empty_titulo: number;
  empty_resumen: number;
  short_resumen: number;
  empty_analisis: number;
  short_analisis: number;
  empty_labels: number;
}

interface D1SampleRow {
  id: string;
  materia: string;
  titulo: string;
  resumen: string;
  analisis: string;
  etiquetas_json: string;
}

interface RowInspection {
  example: AuditExample;
  bucket: RemediationBucketName | null;
  impactAreas: Set<ImpactArea>;
  flags: {
    emptyMateria: boolean;
    narrativeMateria: boolean;
    genericLabels: boolean;
    formattingOnlyLabels: boolean;
    weakTitle: boolean;
    weakResumen: boolean;
    weakAnalisis: boolean;
    matterDescriptorMismatch: boolean;
    productBlocking: boolean;
  };
}

const RESOLUTION_VERB_RE = /^(acoge|rechaza|representa|desestima|cursa|se abstiene|devuelve|aprueba|instruye|ordena|concluye|estima|declara|aclara)\b/i;
const GENERIC_LABELS = new Set([
  'administrativo',
  'dictamen',
  'general',
  'generales',
  'otros',
  'otro',
  'varios',
  'varias',
  'normativa',
  'legal',
  'juridico',
  'juridica',
  'jurídico',
  'jurídica',
  'materia',
  'tema',
  'temas',
  'procedimiento',
  'procedimientos'
]);
const LEGAL_SIGNAL_TOKENS = new Set([
  'articulo',
  'artículos',
  'art',
  'ley',
  'decreto',
  'estatuto',
  'contraloria',
  'contraloría',
  'dictamen',
  'funcionario',
  'municipal',
  'sumario',
  'administrativo',
  'responsabilidad',
  'jurisprudencia'
]);

function normalizeMode(mode: unknown): CheckMode {
  return mode === 'standard' ? 'standard' : 'quick';
}

function normalizeTargetEnvironment(value: unknown): TargetEnvironment {
  return value === 'local' ? 'local' : 'staging';
}

function normalizeSampleSize(mode: CheckMode, sampleSize: unknown): number {
  const fallback = mode === 'standard' ? 250 : 80;
  const parsed = Number.parseInt(String(sampleSize ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(20, Math.min(mode === 'standard' ? 500 : 150, parsed));
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function previewText(value: string, max = 140): string {
  const compact = compactText(value);
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

function normalizeText(value: string): string {
  return compactText(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function tokenizeText(value: string): string[] {
  return [...new Set(
    normalizeText(value)
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  )];
}

function countWords(value: string): number {
  const compact = compactText(value);
  if (!compact) return 0;
  return compact.split(/\s+/).length;
}

function hasLegalDensity(value: string): boolean {
  return tokenizeText(value).some((token) => LEGAL_SIGNAL_TOKENS.has(token));
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

function looksNarrativeMateria(value: string): boolean {
  const compact = compactText(value);
  if (!compact) return true;
  if (compact.length > 90) return true;
  if (RESOLUTION_VERB_RE.test(compact)) return true;
  if (/[.:;]/.test(compact) && countWords(compact) > 8) return true;
  if (countWords(compact) > 12 && /\b(que|sobre|respecto|mediante|solicitud|presentacion|presentación|caso|procede|corresponde|relativo|consulta)\b/i.test(compact)) {
    return true;
  }
  return false;
}

function looksWeakTitle(value: string, materia: string): boolean {
  const compact = compactText(value);
  if (!compact) return true;
  if (compact.length > 140) return true;
  if (RESOLUTION_VERB_RE.test(compact)) return true;
  if (compact.length < 18) return true;
  if (normalizeText(compact) === normalizeText(materia) && compact.length > 0) return true;
  return false;
}

function looksWeakResumen(value: string): boolean {
  const compact = compactText(value);
  if (!compact) return true;
  if (compact.length < 140) return true;
  if (countWords(compact) < 24) return true;
  return !hasLegalDensity(compact);
}

function looksWeakAnalisis(value: string): boolean {
  const compact = compactText(value);
  if (!compact) return true;
  if (compact.length < 320) return true;
  if (countWords(compact) < 55) return true;
  return !hasLegalDensity(compact);
}

function isGenericLabel(value: string): boolean {
  const normalized = normalizeLabel(value);
  return normalized.length > 0 && (GENERIC_LABELS.has(normalized) || normalized.length < 4);
}

function hasMatterDescriptorMismatch(materia: string, labels: string[]): boolean {
  const materiaTokens = tokenizeText(materia);
  const labelTokens = tokenizeText(labels.join(' '));
  if (materiaTokens.length === 0 || labelTokens.length === 0) return false;
  const labelSet = new Set(labelTokens);
  return materiaTokens.every((token) => !labelSet.has(token));
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

function maxSeverity(values: Severity[]): Severity {
  if (values.length === 0) return 'low';
  return values.reduce((current, candidate) => (
    severityRank(candidate) > severityRank(current) ? candidate : current
  ), 'low');
}

function ratio(count: number, total: number): number {
  if (total <= 0) return 0;
  return count / total;
}

function estimateCount(sampleCount: number, sampleTotal: number, population: number): number {
  if (sampleTotal <= 0 || population <= 0) return 0;
  return Math.round((sampleCount / sampleTotal) * population);
}

function uniqueExamples(examples: AuditExample[], limit = 5): AuditExample[] {
  const seen = new Set<string>();
  const result: AuditExample[] = [];
  for (const example of examples) {
    if (seen.has(example.id)) continue;
    seen.add(example.id);
    result.push(example);
    if (result.length >= limit) break;
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function normalizeCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function inspectRow(row: D1SampleRow): RowInspection {
  const materia = compactText(row.materia);
  const titulo = compactText(row.titulo);
  const resumen = compactText(row.resumen);
  const analisis = compactText(row.analisis);
  const labels = parseLabels(row.etiquetas_json);
  const normalizedLabels = labels.map(normalizeLabel).filter(Boolean);
  const genericLabels = labels.filter(isGenericLabel);
  const snakeCaseLabels = labels.filter((label) => label.includes('_'));
  const duplicateNormalizedCount = normalizedLabels.length - new Set(normalizedLabels).size;
  const casingOrAccentVariants = normalizedLabels.length > 0
    && new Set(labels.map((label) => compactText(label))).size > new Set(normalizedLabels).size;
  const emptyMateria = materia.length === 0;
  const narrativeMateria = !emptyMateria && looksNarrativeMateria(materia);
  const weakTitle = looksWeakTitle(titulo, materia);
  const weakResumen = looksWeakResumen(resumen);
  const weakAnalisis = looksWeakAnalisis(analisis);
  const hasFormattingNoise = snakeCaseLabels.length > 0 || duplicateNormalizedCount > 0 || casingOrAccentVariants;
  const meaningfulLabels = labels.filter((label) => !isGenericLabel(label));
  const matterDescriptorMismatch = !emptyMateria
    && !narrativeMateria
    && meaningfulLabels.length > 0
    && hasMatterDescriptorMismatch(materia, meaningfulLabels);

  const impactAreas = new Set<ImpactArea>();
  const issues: string[] = [];

  if (emptyMateria || narrativeMateria) {
    issues.push(emptyMateria ? 'empty_materia' : 'narrative_materia');
    impactAreas.add('doctrine_lines');
    impactAreas.add('doctrine_clusters');
    impactAreas.add('cluster_label');
    impactAreas.add('dominantTheme');
    impactAreas.add('materiaEvaluated');
  }

  if (labels.length === 0 || genericLabels.length > 0) {
    issues.push(labels.length === 0 ? 'empty_labels' : 'generic_labels');
    impactAreas.add('doctrine_search');
    impactAreas.add('query_match_reason');
  }

  if (hasFormattingNoise) {
    issues.push('label_formatting_noise');
    impactAreas.add('doctrine_search');
    impactAreas.add('query_match_reason');
  }

  if (weakTitle || weakResumen || weakAnalisis) {
    if (weakTitle) issues.push('weak_title');
    if (weakResumen) issues.push('weak_resumen');
    if (weakAnalisis) issues.push('weak_analisis');
    impactAreas.add('key_dictamenes');
    impactAreas.add('demo_titles');
    impactAreas.add('doctrine_search');
  }

  if (matterDescriptorMismatch) {
    issues.push('matter_descriptor_mismatch');
    impactAreas.add('doctrine_lines');
    impactAreas.add('doctrine_search');
    impactAreas.add('query_match_reason');
  }

  const productBlocking = emptyMateria || labels.length === 0 || !titulo || !resumen || !analisis;
  let bucket: RemediationBucketName | null = null;

  if (productBlocking) {
    bucket = 'product_blocking_noise';
  } else if (narrativeMateria || genericLabels.length > 0 || weakTitle || weakResumen || weakAnalisis || matterDescriptorMismatch) {
    bucket = 'needs_semantic_review';
  } else if (hasFormattingNoise) {
    bucket = 'auto_normalizable';
  } else if (issues.length > 0) {
    bucket = 'low_priority_noise';
  }

  return {
    example: {
      id: row.id,
      materia,
      titulo,
      resumen_preview: previewText(resumen),
      labels: labels.slice(0, 5),
      issues
    },
    bucket,
    impactAreas,
    flags: {
      emptyMateria,
      narrativeMateria,
      genericLabels: genericLabels.length > 0 || labels.length === 0,
      formattingOnlyLabels: hasFormattingNoise && !productBlocking && !narrativeMateria && genericLabels.length === 0,
      weakTitle,
      weakResumen,
      weakAnalisis,
      matterDescriptorMismatch,
      productBlocking
    }
  };
}

function buildHeadline(findings: Finding[]): string {
  if (findings.length === 0) {
    return 'No se detectó deuda doctrinal relevante en la muestra actual.';
  }

  const topFinding = findings[0];
  return `Se detectaron ${findings.length} hallazgos; el principal es ${topFinding.type} con severidad ${topFinding.severity}.`;
}

function buildImpactStats(
  inspections: RowInspection[],
  population: number
): Record<ImpactArea, { sample_count: number; estimated_corpus_count: number }> {
  const impactAreas: ImpactArea[] = [
    'doctrine_lines',
    'doctrine_search',
    'doctrine_clusters',
    'query_match_reason',
    'key_dictamenes',
    'demo_titles',
    'cluster_label',
    'dominantTheme',
    'materiaEvaluated'
  ];

  const result = Object.fromEntries(
    impactAreas.map((area) => [area, { sample_count: 0, estimated_corpus_count: 0 }])
  ) as Record<ImpactArea, { sample_count: number; estimated_corpus_count: number }>;

  for (const inspection of inspections) {
    for (const area of inspection.impactAreas) {
      result[area].sample_count += 1;
    }
  }

  for (const area of impactAreas) {
    result[area].estimated_corpus_count = estimateCount(result[area].sample_count, inspections.length, population);
  }

  return result;
}

function computeBucketSeverity(bucket: RemediationBucketName, sampleCount: number, sampleTotal: number): Severity {
  const sampleRate = ratio(sampleCount, sampleTotal);
  if (bucket === 'product_blocking_noise') {
    if (sampleRate >= 0.2) return 'critical';
    if (sampleRate >= 0.05) return 'high';
    return sampleCount > 0 ? 'medium' : 'low';
  }

  if (bucket === 'needs_semantic_review') {
    if (sampleRate >= 0.35) return 'high';
    if (sampleRate >= 0.15) return 'medium';
    return sampleCount > 0 ? 'low' : 'low';
  }

  if (bucket === 'auto_normalizable') {
    return sampleRate >= 0.1 ? 'medium' : sampleCount > 0 ? 'low' : 'low';
  }

  return sampleRate >= 0.1 ? 'low' : 'low';
}

function buildRemediationBuckets(
  inspections: RowInspection[],
  population: number,
  exampleSource: RowInspection[] = inspections
): RemediationBucket[] {
  const byBucket = new Map<RemediationBucketName, RowInspection[]>();
  for (const inspection of inspections) {
    if (!inspection.bucket) continue;
    const current = byBucket.get(inspection.bucket) ?? [];
    current.push(inspection);
    byBucket.set(inspection.bucket, current);
  }

  const descriptors: Record<RemediationBucketName, { rationale: string; strategy: string }> = {
    auto_normalizable: {
      rationale: 'Ruido principalmente formal en labels: snake_case, duplicados y variantes de casing/acentos.',
      strategy: 'Normalizar labels por reglas determinísticas antes de cualquier remediación semántica.'
    },
    needs_semantic_review: {
      rationale: 'Los campos existen pero no expresan doctrina utilizable o están desalineados con sus descriptores.',
      strategy: 'Priorizar revisión semántica asistida por reglas y luego remediación dirigida por lotes.'
    },
    low_priority_noise: {
      rationale: 'Ruido menor que no bloquea producto visible y puede esperar a una pasada posterior.',
      strategy: 'Agruparlo en backlog de limpieza incremental y no mezclarlo con deuda bloqueante.'
    },
    product_blocking_noise: {
      rationale: 'Vacíos o debilidad severa en campos que aparecen en UX y explicabilidad doctrinal.',
      strategy: 'Atacar primero este bucket para estabilizar doctrine-search, key_dictamenes y títulos visibles.'
    }
  };

  const ordered: RemediationBucketName[] = [
    'product_blocking_noise',
    'needs_semantic_review',
    'auto_normalizable',
    'low_priority_noise'
  ];

  return ordered.map((bucket) => {
    const rows = byBucket.get(bucket) ?? [];
    const exampleRows = exampleSource.filter((row) => row.bucket === bucket);
    return {
      bucket,
      severity: computeBucketSeverity(bucket, rows.length, inspections.length),
      sample_count: rows.length,
      estimated_corpus_count: estimateCount(rows.length, inspections.length, population),
      rationale: descriptors[bucket].rationale,
      recommended_strategy: descriptors[bucket].strategy,
      examples: uniqueExamples(exampleRows.map((row) => row.example))
    };
  }).filter((bucket) => bucket.sample_count > 0);
}

function addFinding(findings: Finding[], finding: Finding): void {
  findings.push(finding);
}

export async function executeMetadataQualityAudit(
  context: SkillContext,
  rawInput: MetadataQualityAuditInput = {}
): Promise<SkillExecutionResult<MetadataQualityAuditData>> {
  const startedAt = Date.now();
  const mode = normalizeMode(rawInput.mode);
  const targetEnvironment = normalizeTargetEnvironment(rawInput.targetEnvironment);
  const sampleSize = normalizeSampleSize(mode, rawInput.sampleSize);
  const includeProductImpact = rawInput.includeProductImpact !== false;
  const includeExamples = rawInput.includeExamples !== false;
  const findings: Finding[] = [];
  const wrangler = await readWranglerConfig(context.repoRoot);
  const devVars = await readDevVars(context.repoRoot);
  const envConfig = getWranglerEnvironmentConfig(wrangler.config, targetEnvironment);
  const databaseId = typeof envConfig.d1Binding?.database_id === 'string' ? envConfig.d1Binding.database_id : null;
  const databaseName = typeof envConfig.d1Binding?.database_name === 'string' ? envConfig.d1Binding.database_name : null;
  const cloudflareApiToken = devVars.values.CLOUDFLARE_API_TOKEN ?? '';
  const cloudflareAccountId = inferCloudflareAccountId(
    typeof envConfig.vars.MISTRAL_API_URL === 'string' ? envConfig.vars.MISTRAL_API_URL : null
  );

  const stats: MetadataAuditStats = {
    targetEnvironment,
    mode,
    sampleSize,
    includeProductImpact,
    includeExamples,
    d1: {
      available: false,
      databaseName,
        aggregate: {
          auditedCount: 0,
          enrichedCount: 0,
          vectorizedCount: 0,
          blockingRecords: 0,
          emptyMateria: 0,
        longMateria: 0,
        resolutionVerbMateria: 0,
        emptyTitulo: 0,
        emptyResumen: 0,
        shortResumen: 0,
        emptyAnalisis: 0,
        shortAnalisis: 0,
        emptyLabels: 0
      },
      sample: {
        inspectedCount: 0,
        emptyMateria: 0,
        narrativeMateria: 0,
        genericLabels: 0,
        formattingOnlyLabels: 0,
        weakTitle: 0,
        weakResumen: 0,
        weakAnalisis: 0,
        matterDescriptorMismatch: 0,
        productBlocking: 0
      }
    },
    productImpact: {
      doctrine_lines: { sample_count: 0, estimated_corpus_count: 0 },
      doctrine_search: { sample_count: 0, estimated_corpus_count: 0 },
      doctrine_clusters: { sample_count: 0, estimated_corpus_count: 0 },
      query_match_reason: { sample_count: 0, estimated_corpus_count: 0 },
      key_dictamenes: { sample_count: 0, estimated_corpus_count: 0 },
      demo_titles: { sample_count: 0, estimated_corpus_count: 0 },
      cluster_label: { sample_count: 0, estimated_corpus_count: 0 },
      dominantTheme: { sample_count: 0, estimated_corpus_count: 0 },
      materiaEvaluated: { sample_count: 0, estimated_corpus_count: 0 }
    }
  };

  if (targetEnvironment === 'local') {
    addFinding(findings, {
      type: 'local_snapshot_unavailable',
      severity: 'medium',
      evidence: {
        targetEnvironment,
        reason: 'No existe snapshot local aislado del corpus doctrinal conectado al runtime de agents.'
      },
      likely_cause: 'La auditoría diagnóstica se diseñó para operar sobre staging read-only y evitar tocar recursos productivos.',
      impact_area: ['doctrine_search'],
      affected_examples: [],
      recommendation: 'Ejecutar esta skill contra staging o preparar un snapshot local explícito antes de habilitar targetEnvironment=local.',
      auto_fix_candidate: false
    });
  }

  if (wrangler.parseError) {
    addFinding(findings, {
      type: 'wrangler_config_unavailable',
      severity: 'high',
      evidence: { configPath: wrangler.configPath, parseError: wrangler.parseError },
      likely_cause: 'No se pudieron resolver bindings ni variables del entorno de auditoría.',
      impact_area: ['doctrine_search'],
      affected_examples: [],
      recommendation: 'Corregir wrangler.jsonc antes de confiar en esta skill.',
      auto_fix_candidate: false
    });
  }

  if (devVars.parseError) {
    addFinding(findings, {
      type: 'dev_vars_unavailable',
      severity: 'high',
      evidence: { filePath: devVars.filePath, parseError: devVars.parseError },
      likely_cause: 'No fue posible leer credenciales locales para usar la API oficial de Cloudflare D1.',
      impact_area: ['doctrine_search'],
      affected_examples: [],
      recommendation: 'Restaurar .dev.vars o inyectar CLOUDFLARE_API_TOKEN para habilitar la auditoría read-only.',
      auto_fix_candidate: false
    });
  }

  let inspections: RowInspection[] = [];
  let exampleInspections: RowInspection[] = [];

  if (targetEnvironment === 'staging' && databaseId && cloudflareApiToken && cloudflareAccountId) {
    stats.d1.available = true;

    const aggregateQuery = await queryD1<D1AggregateRow>({
      accountId: cloudflareAccountId,
      apiToken: cloudflareApiToken,
      databaseId,
      queryName: 'metadata_quality_aggregate',
      sql: `
        SELECT
          COUNT(*) AS audited_count,
          SUM(CASE WHEN d.estado = 'enriched' THEN 1 ELSE 0 END) AS enriched_count,
          SUM(CASE WHEN d.estado = 'vectorized' THEN 1 ELSE 0 END) AS vectorized_count,
          SUM(CASE WHEN TRIM(COALESCE(e.titulo, '')) = ''
                    OR TRIM(COALESCE(e.resumen, '')) = ''
                    OR TRIM(COALESCE(e.analisis, '')) = ''
                    OR TRIM(COALESCE(e.etiquetas_json, '')) IN ('', '[]', 'null')
               THEN 1 ELSE 0 END) AS blocking_record_count,
          SUM(CASE WHEN TRIM(COALESCE(d.materia, '')) = '' THEN 1 ELSE 0 END) AS empty_materia,
          SUM(CASE WHEN LENGTH(TRIM(COALESCE(d.materia, ''))) > 90 THEN 1 ELSE 0 END) AS long_materia,
          SUM(CASE WHEN LOWER(TRIM(COALESCE(d.materia, ''))) LIKE 'acoge%'
                    OR LOWER(TRIM(COALESCE(d.materia, ''))) LIKE 'rechaza%'
                    OR LOWER(TRIM(COALESCE(d.materia, ''))) LIKE 'representa%'
                    OR LOWER(TRIM(COALESCE(d.materia, ''))) LIKE 'desestima%'
                    OR LOWER(TRIM(COALESCE(d.materia, ''))) LIKE 'cursa%'
                    OR LOWER(TRIM(COALESCE(d.materia, ''))) LIKE 'se abstiene%'
                    OR LOWER(TRIM(COALESCE(d.materia, ''))) LIKE 'devuelve%'
                    OR LOWER(TRIM(COALESCE(d.materia, ''))) LIKE 'aprueba%'
                    OR LOWER(TRIM(COALESCE(d.materia, ''))) LIKE 'instruye%'
                    OR LOWER(TRIM(COALESCE(d.materia, ''))) LIKE 'ordena%'
               THEN 1 ELSE 0 END) AS resolution_verb_materia,
          SUM(CASE WHEN TRIM(COALESCE(e.titulo, '')) = '' THEN 1 ELSE 0 END) AS empty_titulo,
          SUM(CASE WHEN TRIM(COALESCE(e.resumen, '')) = '' THEN 1 ELSE 0 END) AS empty_resumen,
          SUM(CASE WHEN LENGTH(TRIM(COALESCE(e.resumen, ''))) BETWEEN 1 AND 139 THEN 1 ELSE 0 END) AS short_resumen,
          SUM(CASE WHEN TRIM(COALESCE(e.analisis, '')) = '' THEN 1 ELSE 0 END) AS empty_analisis,
          SUM(CASE WHEN LENGTH(TRIM(COALESCE(e.analisis, ''))) BETWEEN 1 AND 319 THEN 1 ELSE 0 END) AS short_analisis,
          SUM(CASE WHEN TRIM(COALESCE(e.etiquetas_json, '')) IN ('', '[]', 'null') THEN 1 ELSE 0 END) AS empty_labels
        FROM dictamenes d
        LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
        WHERE d.estado IN ('enriched', 'vectorized')
      `
    });

    const sampleQuery = await queryD1<D1SampleRow>({
      accountId: cloudflareAccountId,
      apiToken: cloudflareApiToken,
      databaseId,
      queryName: 'metadata_quality_sample',
      sql: `
        SELECT
          d.id,
          COALESCE(TRIM(d.materia), '') AS materia,
          COALESCE(TRIM(e.titulo), '') AS titulo,
          COALESCE(TRIM(e.resumen), '') AS resumen,
          COALESCE(TRIM(e.analisis), '') AS analisis,
          COALESCE(TRIM(e.etiquetas_json), '[]') AS etiquetas_json
        FROM dictamenes d
        LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
        WHERE d.estado IN ('enriched', 'vectorized')
        ORDER BY RANDOM()
        LIMIT ?
      `,
      queryParams: [sampleSize]
    });

    const blockerExamplesQuery = await queryD1<D1SampleRow>({
      accountId: cloudflareAccountId,
      apiToken: cloudflareApiToken,
      databaseId,
      queryName: 'metadata_quality_blocker_examples',
      sql: `
        SELECT
          d.id,
          COALESCE(TRIM(d.materia), '') AS materia,
          COALESCE(TRIM(e.titulo), '') AS titulo,
          COALESCE(TRIM(e.resumen), '') AS resumen,
          COALESCE(TRIM(e.analisis), '') AS analisis,
          COALESCE(TRIM(e.etiquetas_json), '[]') AS etiquetas_json
        FROM dictamenes d
        LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
        WHERE d.estado IN ('enriched', 'vectorized')
          AND (
            TRIM(COALESCE(d.materia, '')) = ''
            OR TRIM(COALESCE(e.titulo, '')) = ''
            OR TRIM(COALESCE(e.resumen, '')) = ''
            OR TRIM(COALESCE(e.analisis, '')) = ''
            OR TRIM(COALESCE(e.etiquetas_json, '')) IN ('', '[]', 'null')
          )
        ORDER BY RANDOM()
        LIMIT 20
      `
    });

    const queryErrors = [aggregateQuery.error, sampleQuery.error, blockerExamplesQuery.error].filter(Boolean);
    if (queryErrors.length > 0) {
      addFinding(findings, {
        type: 'd1_audit_query_failed',
        severity: 'high',
        evidence: { errors: queryErrors },
        likely_cause: 'La API de D1 no respondió de forma usable para completar la auditoría de metadata.',
        impact_area: ['doctrine_search'],
        affected_examples: [],
        recommendation: 'Revisar conectividad a Cloudflare, permisos del token y disponibilidad del binding D1.',
        auto_fix_candidate: false
      });
    } else {
      const aggregate = aggregateQuery.rows[0];
      if (aggregate) {
        stats.d1.aggregate = {
          auditedCount: normalizeCount(aggregate.audited_count),
          enrichedCount: normalizeCount(aggregate.enriched_count),
          vectorizedCount: normalizeCount(aggregate.vectorized_count),
          blockingRecords: normalizeCount(aggregate.blocking_record_count),
          emptyMateria: normalizeCount(aggregate.empty_materia),
          longMateria: normalizeCount(aggregate.long_materia),
          resolutionVerbMateria: normalizeCount(aggregate.resolution_verb_materia),
          emptyTitulo: normalizeCount(aggregate.empty_titulo),
          emptyResumen: normalizeCount(aggregate.empty_resumen),
          shortResumen: normalizeCount(aggregate.short_resumen),
          emptyAnalisis: normalizeCount(aggregate.empty_analisis),
          shortAnalisis: normalizeCount(aggregate.short_analisis),
          emptyLabels: normalizeCount(aggregate.empty_labels)
        };
      }

      const randomInspections = sampleQuery.rows.map(inspectRow);
      const blockerInspections = blockerExamplesQuery.rows.map(inspectRow);
      inspections = randomInspections;
      exampleInspections = [...blockerInspections, ...randomInspections];
      stats.d1.sample.inspectedCount = inspections.length;
      stats.d1.sample.emptyMateria = inspections.filter((row) => row.flags.emptyMateria).length;
      stats.d1.sample.narrativeMateria = inspections.filter((row) => row.flags.narrativeMateria).length;
      stats.d1.sample.genericLabels = inspections.filter((row) => row.flags.genericLabels).length;
      stats.d1.sample.formattingOnlyLabels = inspections.filter((row) => row.flags.formattingOnlyLabels).length;
      stats.d1.sample.weakTitle = inspections.filter((row) => row.flags.weakTitle).length;
      stats.d1.sample.weakResumen = inspections.filter((row) => row.flags.weakResumen).length;
      stats.d1.sample.weakAnalisis = inspections.filter((row) => row.flags.weakAnalisis).length;
      stats.d1.sample.matterDescriptorMismatch = inspections.filter((row) => row.flags.matterDescriptorMismatch).length;
      stats.d1.sample.productBlocking = inspections.filter((row) => row.flags.productBlocking).length;

      if (includeProductImpact) {
        stats.productImpact = buildImpactStats(inspections, stats.d1.aggregate.auditedCount);
      }

      const sampleTotal = inspections.length;
      const population = stats.d1.aggregate.auditedCount;

      const narrativeExamples = uniqueExamples(exampleInspections
        .filter((row) => row.flags.narrativeMateria || row.flags.emptyMateria)
        .map((row) => row.example));
      const labelsExamples = uniqueExamples(exampleInspections
        .filter((row) => row.flags.genericLabels)
        .map((row) => row.example));
      const formattingExamples = uniqueExamples(exampleInspections
        .filter((row) => row.flags.formattingOnlyLabels)
        .map((row) => row.example));
      const fieldExamples = uniqueExamples(exampleInspections
        .filter((row) => row.flags.productBlocking || row.flags.weakTitle || row.flags.weakResumen || row.flags.weakAnalisis)
        .map((row) => row.example));
      const mismatchExamples = uniqueExamples(exampleInspections
        .filter((row) => row.flags.matterDescriptorMismatch)
        .map((row) => row.example));

      const narrativeRate = ratio(stats.d1.sample.narrativeMateria, sampleTotal);
      if (stats.d1.aggregate.longMateria > 0 || stats.d1.aggregate.resolutionVerbMateria > 0 || stats.d1.sample.narrativeMateria > 0) {
        addFinding(findings, {
          type: 'materia_narrativa_o_pseudo_resumen',
          severity: stats.d1.aggregate.longMateria > 2000 || narrativeRate >= 0.3 ? 'high' : 'medium',
          evidence: {
            aggregate: {
              longMateria: stats.d1.aggregate.longMateria,
              resolutionVerbMateria: stats.d1.aggregate.resolutionVerbMateria
            },
            sample: {
              inspected: sampleTotal,
              narrativeMateria: stats.d1.sample.narrativeMateria,
              estimatedCorpusCount: estimateCount(stats.d1.sample.narrativeMateria, sampleTotal, population)
            }
          },
          likely_cause: 'Parte del corpus usa materia como frase narrativa o pseudo-resumen, no como categoría doctrinal estable.',
          impact_area: ['doctrine_lines', 'doctrine_clusters', 'cluster_label', 'dominantTheme', 'materiaEvaluated'],
          affected_examples: includeExamples ? narrativeExamples : [],
          recommendation: 'Priorizar saneamiento semántico de materia antes de recalcular labels de líneas doctrinales.',
          auto_fix_candidate: false
        });
      }

      const genericLabelRate = ratio(stats.d1.sample.genericLabels, sampleTotal);
      if (stats.d1.aggregate.emptyLabels > 0 || stats.d1.sample.genericLabels > 0) {
        addFinding(findings, {
          type: 'labels_vacios_o_genericos',
          severity: stats.d1.aggregate.emptyLabels > 0 || genericLabelRate >= 0.2 ? 'high' : 'medium',
          evidence: {
            aggregate: {
              emptyLabels: stats.d1.aggregate.emptyLabels
            },
            sample: {
              inspected: sampleTotal,
              genericOrEmptyLabels: stats.d1.sample.genericLabels,
              estimatedCorpusCount: estimateCount(stats.d1.sample.genericLabels, sampleTotal, population)
            }
          },
          likely_cause: 'Los descriptores AI no siempre representan doctrina utilizable o no se generaron con suficiente granularidad.',
          impact_area: ['doctrine_search', 'query_match_reason', 'doctrine_lines'],
          affected_examples: includeExamples ? labelsExamples : [],
          recommendation: 'Separar labels vacíos/generales de labels solo formateados y tratarlos como deuda semántica prioritaria.',
          auto_fix_candidate: false
        });
      }

      if (stats.d1.sample.formattingOnlyLabels > 0) {
        addFinding(findings, {
          type: 'labels_formato_normalizable',
          severity: ratio(stats.d1.sample.formattingOnlyLabels, sampleTotal) >= 0.1 ? 'medium' : 'low',
          evidence: {
            sample: {
              inspected: sampleTotal,
              formattingOnlyLabels: stats.d1.sample.formattingOnlyLabels,
              estimatedCorpusCount: estimateCount(stats.d1.sample.formattingOnlyLabels, sampleTotal, population)
            }
          },
          likely_cause: 'Parte del corpus conserva labels con snake_case, duplicados o variantes cosméticas heredadas de enriquecimientos históricos.',
          impact_area: ['doctrine_search', 'query_match_reason'],
          affected_examples: includeExamples ? formattingExamples : [],
          recommendation: 'Crear una pasada determinística de normalización de labels antes de cualquier remediación con revisión humana.',
          auto_fix_candidate: true
        });
      }

      if (stats.d1.aggregate.emptyTitulo > 0 || stats.d1.aggregate.emptyResumen > 0 || stats.d1.aggregate.emptyAnalisis > 0
        || stats.d1.sample.weakTitle > 0 || stats.d1.sample.weakResumen > 0 || stats.d1.sample.weakAnalisis > 0) {
        addFinding(findings, {
          type: 'campos_doctrinales_bloqueantes',
          severity: stats.d1.aggregate.emptyTitulo > 0 || stats.d1.aggregate.emptyResumen > 0 || stats.d1.aggregate.emptyAnalisis > 0
            ? 'critical'
            : 'high',
          evidence: {
            aggregate: {
              emptyTitulo: stats.d1.aggregate.emptyTitulo,
              emptyResumen: stats.d1.aggregate.emptyResumen,
              emptyAnalisis: stats.d1.aggregate.emptyAnalisis,
              shortResumen: stats.d1.aggregate.shortResumen,
              shortAnalisis: stats.d1.aggregate.shortAnalisis
            },
            sample: {
              inspected: sampleTotal,
              weakTitle: stats.d1.sample.weakTitle,
              weakResumen: stats.d1.sample.weakResumen,
              weakAnalisis: stats.d1.sample.weakAnalisis,
              productBlocking: stats.d1.sample.productBlocking
            }
          },
          likely_cause: 'La ruta histórica de enriquecimiento dejó campos vacíos o demasiado pobres para sostener key_dictamenes y títulos visibles.',
          impact_area: ['key_dictamenes', 'demo_titles', 'doctrine_search'],
          affected_examples: includeExamples ? fieldExamples : [],
          recommendation: 'Tratar como bucket bloqueante: completar primero título/resumen/análisis antes de ajustar naming fino o clustering.',
          auto_fix_candidate: false
        });
      }

      if (stats.d1.sample.matterDescriptorMismatch > 0) {
        addFinding(findings, {
          type: 'materia_descriptores_desalineados',
          severity: ratio(stats.d1.sample.matterDescriptorMismatch, sampleTotal) >= 0.12 ? 'high' : 'medium',
          evidence: {
            sample: {
              inspected: sampleTotal,
              mismatchCount: stats.d1.sample.matterDescriptorMismatch,
              estimatedCorpusCount: estimateCount(stats.d1.sample.matterDescriptorMismatch, sampleTotal, population)
            }
          },
          likely_cause: 'La materia y los top_descriptores_AI no siempre describen el mismo eje doctrinal, lo que degrada explicaciones y naming de líneas.',
          impact_area: ['doctrine_lines', 'doctrine_search', 'query_match_reason'],
          affected_examples: includeExamples ? mismatchExamples : [],
          recommendation: 'Diseñar una skill posterior de remediation_planner para separar auto-fixes de revisiones semánticas por lote.',
          auto_fix_candidate: false
        });
      }
    }
  }

  findings.sort((left, right) => (
    severityRank(right.severity) - severityRank(left.severity)
    || left.type.localeCompare(right.type)
  ));

  const remediationBuckets = buildRemediationBuckets(inspections, stats.d1.aggregate.auditedCount, exampleInspections);
  if (!remediationBuckets.some((bucket) => bucket.bucket === 'product_blocking_noise') && stats.d1.aggregate.blockingRecords > 0) {
    remediationBuckets.unshift({
      bucket: 'product_blocking_noise',
      severity: stats.d1.aggregate.blockingRecords >= 20 ? 'critical' : 'high',
      sample_count: 0,
      estimated_corpus_count: stats.d1.aggregate.blockingRecords,
      rationale: 'Vacíos exactos detectados en campos visibles o labels, aunque la muestra aleatoria no los haya capturado.',
      recommended_strategy: 'Tratar este bucket como remediación prioritaria y operarlo por lista exacta de IDs, no por estimación.',
      examples: uniqueExamples(exampleInspections.filter((row) => row.flags.productBlocking).map((row) => row.example))
    });
  }
  const recommendedActions = uniqueStrings([
    ...findings.map((finding) => finding.recommendation),
    remediationBuckets.some((bucket) => bucket.bucket === 'product_blocking_noise')
      ? 'Atacar primero product_blocking_noise antes de recalcular líneas doctrinales o UX visible.'
      : '',
    remediationBuckets.some((bucket) => bucket.bucket === 'auto_normalizable')
      ? 'Preparar una skill de remediación que normalice labels por reglas determinísticas y deje trazabilidad por registro.'
      : ''
  ]);
  const severity = maxSeverity(findings.map((finding) => finding.severity));

  const data: MetadataQualityAuditData = {
    summary: {
      checkedAt: new Date().toISOString(),
      mode,
      targetEnvironment,
      severity,
      headline: buildHeadline(findings)
    },
    findings,
    stats,
    severity,
    recommended_actions: recommendedActions,
    remediation_buckets: remediationBuckets
  };

  return {
    status: 'success',
    data,
    metadata: createSkillMetadata(
      'skill_metadata_quality_audit',
      context.sessionId,
      'agents-native',
      Date.now() - startedAt
    )
  };
}
