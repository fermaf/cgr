import type { SkillContext, SkillExecutionResult } from '../../../types/skill';
import { createSkillMetadata } from '../../../types/skill';
import { readWranglerConfig, type WranglerBindingConfig, type WranglerConfig } from '../../../utils/wranglerConfig';
import { readDevVars } from '../../../utils/devVars';

type CheckMode = 'quick' | 'standard';
type Severity = 'low' | 'medium' | 'high' | 'critical';
type TargetEnvironment = 'staging' | 'local';

interface EmbeddingConsistencyCheckInput {
  namespace?: string;
  sampleSize?: number;
  mode?: CheckMode;
  includeMetadataAudit?: boolean;
  targetEnvironment?: TargetEnvironment;
  searchProbe?: string;
}

interface Finding {
  type: string;
  severity: Severity;
  evidence: Record<string, unknown>;
  likely_cause: string;
  affected_ids: string[];
  recommendation: string;
}

interface CheckStats {
  targetEnvironment: TargetEnvironment;
  namespace: string | null;
  activeModel: string | null;
  sampleSize: number;
  includeMetadataAudit: boolean;
  d1: {
    available: boolean;
    databaseName: string | null;
    totalDictamenes: number;
    enrichedCount: number;
    vectorizedCount: number;
    enrichedWithoutEnrichment: number;
    vectorizedWithoutEnrichment: number;
    activeModelCount: number;
    legacy2411Count: number;
    missingModelCount: number;
    metadataAudit: {
      emptyMateria: number;
      noisyMateria: number;
      emptyTitulo: number;
      emptyResumen: number;
      emptyAnalisis: number;
      poorLabels: number;
    };
  };
  pinecone: {
    available: boolean;
    reachable: boolean;
    namespaceVectorCount: number | null;
    totalVectorCount: number | null;
    sampleFetchedCount: number;
    sampleMissingCount: number;
    sampleModelMismatches: number;
    sampleMetadataGapCount: number;
    retrievalProbeHits: number | null;
    retrievalProbeError: string | null;
  };
}

interface EmbeddingConsistencyCheckData {
  summary: {
    checkedAt: string;
    mode: CheckMode;
    targetEnvironment: TargetEnvironment;
    namespace: string | null;
    severity: Severity;
    headline: string;
  };
  findings: Finding[];
  stats: CheckStats;
  severity: Severity;
  recommended_actions: string[];
}

interface D1SampleRow {
  id: string;
  estado: string;
  fecha: string | null;
  materia: string;
  titulo: string;
  resumen: string;
  analisis: string;
  etiquetas_json: string;
  modelo_llm: string;
}

interface PineconeFetchVector {
  id: string;
  metadata?: Record<string, unknown>;
}

interface PineconeFetchResponse {
  vectors?: Record<string, PineconeFetchVector>;
  namespace?: string;
}

interface PineconeIndexStatsResponse {
  namespaces?: Record<string, { vector_count?: number }>;
  total_vector_count?: number;
  totalVectorCount?: number;
  dimension?: number;
  indexFullness?: number;
  index_fullness?: number;
}

interface PineconeNamespaceResponse {
  name?: string;
  record_count?: number | string;
  recordCount?: number | string;
}

function normalizeMode(mode: unknown): CheckMode {
  return mode === 'standard' ? 'standard' : 'quick';
}

function normalizeTargetEnvironment(value: unknown): TargetEnvironment {
  return value === 'local' ? 'local' : 'staging';
}

function normalizeSampleSize(mode: CheckMode, sampleSize: unknown): number {
  const fallback = mode === 'standard' ? 100 : 25;
  const parsed = Number.parseInt(String(sampleSize ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(5, Math.min(mode === 'standard' ? 200 : 50, parsed));
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function looksNoisyMateria(value: string): boolean {
  const compact = compactText(value);
  if (!compact) return true;
  if (compact.length > 90) return true;
  if (/[.:;]/.test(compact) && compact.split(' ').length > 8) return true;
  return /^(Acoge|Desestima|Representa|Cursa|Se abstiene|Devuelve|Rechaza|Aprueba|Instruye)\b/i.test(compact);
}

function extractModelGenerationTag(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/(2411|2512)/);
  return match?.[1] ?? null;
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

function buildHeadline(findings: Finding[], namespace: string | null): string {
  if (findings.length === 0) {
    return `No se detectaron inconsistencias relevantes en la revisión actual del namespace ${namespace ?? 'desconocido'}.`;
  }

  const topFinding = findings[0];
  return `Se detectaron ${findings.length} hallazgos; el principal es ${topFinding.type} con severidad ${topFinding.severity}.`;
}

function addFinding(findings: Finding[], finding: Finding): void {
  findings.push(finding);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function parseJsonArrayLength(value: string): number | null {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length : null;
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

async function fetchPineconeJson<T>(url: URL, init: RequestInit & {
  apiKey: string;
}): Promise<{
  data: T | null;
  error: string | null;
}> {
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      ...init,
      headers: {
        'Api-Key': init.apiKey,
        'Content-Type': 'application/json',
        'X-Pinecone-Api-Version': '2025-10',
        ...(init.headers ?? {})
      }
    });
  } catch (error) {
    return {
      data: null,
      error: `network_error ${error instanceof Error ? error.message : String(error)}`
    };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      data: null,
      error: `HTTP ${response.status} ${body.slice(0, 240)}`
    };
  }

  return {
    data: await response.json() as T,
    error: null
  };
}

function isMetadataInsufficient(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) return true;
  const titulo = typeof metadata.titulo === 'string' ? metadata.titulo.trim() : '';
  const resumenRaw = metadata.Resumen ?? metadata.resumen;
  const resumen = typeof resumenRaw === 'string' ? resumenRaw.trim() : '';
  const analisis = typeof metadata.analisis === 'string' ? metadata.analisis.trim() : '';
  const materia = typeof metadata.materia === 'string' ? metadata.materia.trim() : '';
  const fecha = typeof metadata.fecha === 'string' ? metadata.fecha.trim() : '';
  const descriptores = Array.isArray(metadata.descriptores_AI)
    ? metadata.descriptores_AI.map((value) => String(value).trim()).filter(Boolean)
    : [];

  return !titulo || !resumen || !analisis || !materia || !fecha || descriptores.length < 2;
}

function extractMetadataModel(metadata: Record<string, unknown> | undefined): string | null {
  const value = metadata?.model;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function executeEmbeddingConsistencyCheck(
  context: SkillContext,
  rawInput: EmbeddingConsistencyCheckInput = {}
): Promise<SkillExecutionResult<EmbeddingConsistencyCheckData>> {
  const startedAt = Date.now();
  const mode = normalizeMode(rawInput.mode);
  const targetEnvironment = normalizeTargetEnvironment(rawInput.targetEnvironment);
  const sampleSize = normalizeSampleSize(mode, rawInput.sampleSize);
  const includeMetadataAudit = rawInput.includeMetadataAudit !== false;
  const searchProbe = typeof rawInput.searchProbe === 'string' && rawInput.searchProbe.trim().length > 0
    ? rawInput.searchProbe.trim()
    : 'contrata confianza legítima';

  const findings: Finding[] = [];
  const wrangler = await readWranglerConfig(context.repoRoot);
  const devVars = await readDevVars(context.repoRoot);
  const envConfig = getWranglerEnvironmentConfig(wrangler.config, targetEnvironment);
  const activeModel = typeof envConfig.vars.MISTRAL_MODEL === 'string' ? envConfig.vars.MISTRAL_MODEL : null;
  const resolvedNamespace = typeof rawInput.namespace === 'string' && rawInput.namespace.trim().length > 0
    ? rawInput.namespace.trim()
    : typeof envConfig.vars.PINECONE_NAMESPACE === 'string'
      ? envConfig.vars.PINECONE_NAMESPACE
      : null;
  const pineconeHost = typeof envConfig.vars.PINECONE_INDEX_HOST === 'string' ? envConfig.vars.PINECONE_INDEX_HOST : null;
  const cloudflareAccountId = inferCloudflareAccountId(
    typeof envConfig.vars.MISTRAL_API_URL === 'string' ? envConfig.vars.MISTRAL_API_URL : null
  );
  const databaseId = typeof envConfig.d1Binding?.database_id === 'string' ? envConfig.d1Binding.database_id : null;
  const databaseName = typeof envConfig.d1Binding?.database_name === 'string' ? envConfig.d1Binding.database_name : null;
  const cloudflareApiToken = devVars.values.CLOUDFLARE_API_TOKEN ?? '';
  const pineconeApiKey = devVars.values.PINECONE_API_KEY ?? '';

  const stats: CheckStats = {
    targetEnvironment,
    namespace: resolvedNamespace,
    activeModel,
    sampleSize,
    includeMetadataAudit,
    d1: {
      available: false,
      databaseName,
      totalDictamenes: 0,
      enrichedCount: 0,
      vectorizedCount: 0,
      enrichedWithoutEnrichment: 0,
      vectorizedWithoutEnrichment: 0,
      activeModelCount: 0,
      legacy2411Count: 0,
      missingModelCount: 0,
      metadataAudit: {
        emptyMateria: 0,
        noisyMateria: 0,
        emptyTitulo: 0,
        emptyResumen: 0,
        emptyAnalisis: 0,
        poorLabels: 0
      }
    },
    pinecone: {
      available: false,
      reachable: false,
      namespaceVectorCount: null,
      totalVectorCount: null,
      sampleFetchedCount: 0,
      sampleMissingCount: 0,
      sampleModelMismatches: 0,
      sampleMetadataGapCount: 0,
      retrievalProbeHits: null,
      retrievalProbeError: null
    }
  };

  if (wrangler.parseError) {
    addFinding(findings, {
      type: 'wrangler_config_unavailable',
      severity: 'high',
      evidence: { configPath: wrangler.configPath, parseError: wrangler.parseError },
      likely_cause: 'No fue posible cargar wrangler.jsonc y por tanto no se pudieron resolver bindings ni namespace activo.',
      affected_ids: [],
      recommendation: 'Corregir wrangler.jsonc antes de confiar en cualquier auditoría diagnóstica.'
    });
  }

  if (devVars.parseError) {
    addFinding(findings, {
      type: 'dev_vars_unavailable',
      severity: 'high',
      evidence: { filePath: devVars.filePath, parseError: devVars.parseError },
      likely_cause: 'La skill no puede leer credenciales locales para Cloudflare o Pinecone.',
      affected_ids: [],
      recommendation: 'Restaurar .dev.vars o inyectar CLOUDFLARE_API_TOKEN y PINECONE_API_KEY para habilitar auditoría remota read-only.'
    });
  }

  if (targetEnvironment === 'staging' && databaseId && cloudflareAccountId && cloudflareApiToken) {
    stats.d1.available = true;

    const summaryQuery = await queryD1<{
      total_dictamenes: number;
      enriched_count: number;
      vectorized_count: number;
      enriched_without_enrichment: number;
      vectorized_without_enrichment: number;
    }>({
      accountId: cloudflareAccountId,
      apiToken: cloudflareApiToken,
      databaseId,
      queryName: 'summary',
      sql: `
        SELECT
          COUNT(*) AS total_dictamenes,
          SUM(CASE WHEN estado = 'enriched' THEN 1 ELSE 0 END) AS enriched_count,
          SUM(CASE WHEN estado = 'vectorized' THEN 1 ELSE 0 END) AS vectorized_count,
          SUM(CASE WHEN estado = 'enriched' AND id NOT IN (SELECT dictamen_id FROM enriquecimiento) THEN 1 ELSE 0 END) AS enriched_without_enrichment,
          SUM(CASE WHEN estado = 'vectorized' AND id NOT IN (SELECT dictamen_id FROM enriquecimiento) THEN 1 ELSE 0 END) AS vectorized_without_enrichment
        FROM dictamenes
      `
    });

    const modelQuery = await queryD1<{
      active_model_count: number;
      legacy_2411_count: number;
      missing_model_count: number;
    }>({
      accountId: cloudflareAccountId,
      apiToken: cloudflareApiToken,
      databaseId,
      queryName: 'model_distribution',
      sql: `
        SELECT
          SUM(CASE WHEN e.modelo_llm = ? THEN 1 ELSE 0 END) AS active_model_count,
          SUM(CASE WHEN e.modelo_llm IN ('mistral-large-2411', 'mistralLarge2411') THEN 1 ELSE 0 END) AS legacy_2411_count,
          SUM(CASE WHEN e.modelo_llm IS NULL OR TRIM(COALESCE(e.modelo_llm, '')) = '' THEN 1 ELSE 0 END) AS missing_model_count
        FROM dictamenes d
        LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
        WHERE d.estado IN ('enriched', 'vectorized')
      `,
      queryParams: [activeModel ?? '']
    });

    const metadataQuery = includeMetadataAudit
      ? await queryD1<{
          empty_materia: number;
          noisy_materia: number;
          empty_titulo: number;
          empty_resumen: number;
          empty_analisis: number;
          poor_labels: number;
        }>({
          accountId: cloudflareAccountId,
          apiToken: cloudflareApiToken,
          databaseId,
          queryName: 'metadata_quality',
          sql: `
            SELECT
              SUM(CASE WHEN TRIM(COALESCE(d.materia, '')) = '' THEN 1 ELSE 0 END) AS empty_materia,
              SUM(CASE WHEN TRIM(COALESCE(d.materia, '')) != '' AND LENGTH(TRIM(COALESCE(d.materia, ''))) > 90 THEN 1 ELSE 0 END) AS noisy_materia,
              SUM(CASE WHEN TRIM(COALESCE(e.titulo, '')) = '' THEN 1 ELSE 0 END) AS empty_titulo,
              SUM(CASE WHEN TRIM(COALESCE(e.resumen, '')) = '' THEN 1 ELSE 0 END) AS empty_resumen,
              SUM(CASE WHEN TRIM(COALESCE(e.analisis, '')) = '' THEN 1 ELSE 0 END) AS empty_analisis,
              SUM(CASE WHEN TRIM(COALESCE(e.etiquetas_json, '')) IN ('', '[]', 'null') THEN 1 ELSE 0 END) AS poor_labels
            FROM dictamenes d
            LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
            WHERE d.estado IN ('enriched', 'vectorized')
          `
        })
      : { rows: [], error: null };

    const sampleQuery = await queryD1<D1SampleRow>({
      accountId: cloudflareAccountId,
      apiToken: cloudflareApiToken,
      databaseId,
      queryName: 'sample_rows',
      sql: `
        SELECT
          d.id AS id,
          d.estado AS estado,
          COALESCE(d.fecha_documento, d.created_at) AS fecha,
          COALESCE(TRIM(d.materia), '') AS materia,
          COALESCE(TRIM(e.titulo), '') AS titulo,
          COALESCE(TRIM(e.resumen), '') AS resumen,
          COALESCE(TRIM(e.analisis), '') AS analisis,
          COALESCE(TRIM(e.etiquetas_json), '') AS etiquetas_json,
          COALESCE(TRIM(e.modelo_llm), '') AS modelo_llm
        FROM dictamenes d
        LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
        WHERE d.estado IN ('enriched', 'vectorized')
        ORDER BY COALESCE(d.updated_at, d.created_at) DESC
        LIMIT ?
      `,
      queryParams: [sampleSize]
    });

    for (const queryError of [summaryQuery.error, modelQuery.error, metadataQuery.error, sampleQuery.error].filter(Boolean)) {
      addFinding(findings, {
        type: 'd1_query_failed',
        severity: 'high',
        evidence: { error: queryError },
        likely_cause: 'La consulta read-only a D1 vía API oficial de Cloudflare falló o devolvió estructura inesperada.',
        affected_ids: [],
        recommendation: 'Verificar CLOUDFLARE_API_TOKEN, account ID derivado y database_id antes de continuar con la auditoría.'
      });
    }

    const summaryRow = summaryQuery.rows[0];
    if (summaryRow) {
      stats.d1.totalDictamenes = Number(summaryRow.total_dictamenes ?? 0);
      stats.d1.enrichedCount = Number(summaryRow.enriched_count ?? 0);
      stats.d1.vectorizedCount = Number(summaryRow.vectorized_count ?? 0);
      stats.d1.enrichedWithoutEnrichment = Number(summaryRow.enriched_without_enrichment ?? 0);
      stats.d1.vectorizedWithoutEnrichment = Number(summaryRow.vectorized_without_enrichment ?? 0);
    }

    const modelRow = modelQuery.rows[0];
    if (modelRow) {
      stats.d1.activeModelCount = Number(modelRow.active_model_count ?? 0);
      stats.d1.legacy2411Count = Number(modelRow.legacy_2411_count ?? 0);
      stats.d1.missingModelCount = Number(modelRow.missing_model_count ?? 0);
    }

    const metadataRow = metadataQuery.rows[0];
    if (metadataRow) {
      stats.d1.metadataAudit = {
        emptyMateria: Number(metadataRow.empty_materia ?? 0),
        noisyMateria: Number(metadataRow.noisy_materia ?? 0),
        emptyTitulo: Number(metadataRow.empty_titulo ?? 0),
        emptyResumen: Number(metadataRow.empty_resumen ?? 0),
        emptyAnalisis: Number(metadataRow.empty_analisis ?? 0),
        poorLabels: Number(metadataRow.poor_labels ?? 0)
      };
    }

    if (stats.d1.vectorizedWithoutEnrichment > 0) {
      addFinding(findings, {
        type: 'vectorized_without_enrichment',
        severity: 'high',
        evidence: {
          vectorizedWithoutEnrichment: stats.d1.vectorizedWithoutEnrichment,
          vectorizedCount: stats.d1.vectorizedCount
        },
        likely_cause: 'Existen dictámenes marcados como vectorized sin fila consistente en enriquecimiento.',
        affected_ids: [],
        recommendation: 'Revisar la secuencia D1/KV/Pinecone del backfill y reconstruir enrichments faltantes antes de confiar en doctrine-lines.'
      });
    }

    if (stats.d1.legacy2411Count > 0) {
      addFinding(findings, {
        type: 'legacy_2411_corpus_drift',
        severity: stats.d1.legacy2411Count > 100 ? 'high' : 'medium',
        evidence: {
          legacy2411Count: stats.d1.legacy2411Count,
          activeModel,
          activeNamespace: resolvedNamespace
        },
        likely_cause: 'El corpus en D1 todavía contiene enriquecimiento legado 2411 mientras el namespace activo apunta a 2512.',
        affected_ids: [],
        recommendation: 'Priorizar un barrido diagnóstica D1 ↔ Pinecone para distinguir entre migración incompleta, metadata estancada y vectores reescritos.'
      });
    }

    if (includeMetadataAudit) {
      const metadataDebt = stats.d1.metadataAudit.emptyMateria +
        stats.d1.metadataAudit.noisyMateria +
        stats.d1.metadataAudit.emptyTitulo +
        stats.d1.metadataAudit.emptyResumen +
        stats.d1.metadataAudit.emptyAnalisis +
        stats.d1.metadataAudit.poorLabels;

      if (metadataDebt > 0) {
        addFinding(findings, {
          type: 'doctrinal_metadata_debt',
          severity: metadataDebt > sampleSize ? 'high' : 'medium',
          evidence: {
            metadataAudit: stats.d1.metadataAudit
          },
          likely_cause: 'La metadata doctrinal en D1 no es homogénea y parte del corpus puede degradar clustering y doctrine-search.',
          affected_ids: [],
          recommendation: 'Implementar una skill hermana de metadata_quality_audit para atacar materia ruidosa, labels vacíos y enrichments débiles.'
        });
      }
    }

    const sampleRows = sampleQuery.rows;
    const noisySampleIds = sampleRows
      .filter((row) => !row.materia || looksNoisyMateria(row.materia))
      .map((row) => row.id);

    if (noisySampleIds.length > 0 && includeMetadataAudit) {
      addFinding(findings, {
        type: 'sample_noisy_materia',
        severity: 'medium',
        evidence: {
          noisySampleCount: noisySampleIds.length,
          sampleSize,
          sampleIdsPreview: noisySampleIds.slice(0, 10)
        },
        likely_cause: 'La materia visible en D1 contiene textos resolutivos o demasiado largos para naming doctrinal útil.',
        affected_ids: noisySampleIds.slice(0, 20),
        recommendation: 'Normalizar naming doctrinal antes de seguir afinando doctrine-lines.'
      });
    }

    if (pineconeHost && resolvedNamespace && pineconeApiKey) {
      stats.pinecone.available = true;

      const describeNamespace = await fetchPineconeJson<PineconeNamespaceResponse>(
        new URL(`/namespaces/${resolvedNamespace}`, pineconeHost),
        {
          method: 'GET',
          apiKey: pineconeApiKey
        }
      );

      const describeStats = await fetchPineconeJson<PineconeIndexStatsResponse>(
        new URL('/describe_index_stats', pineconeHost),
        {
          method: 'POST',
          body: JSON.stringify({}),
          apiKey: pineconeApiKey
        }
      );

      if (describeNamespace.error && describeStats.error) {
        addFinding(findings, {
          type: 'pinecone_stats_unavailable',
          severity: 'high',
          evidence: {
            namespace: resolvedNamespace,
            namespaceError: describeNamespace.error,
            indexStatsError: describeStats.error
          },
          likely_cause: 'No fue posible consultar el estado del namespace activo en Pinecone.',
          affected_ids: [],
          recommendation: 'Verificar host/API key y confirmar que el índice sigue disponible antes de ejecutar diagnósticos de corpus.'
        });
      } else {
        stats.pinecone.reachable = true;
        stats.pinecone.namespaceVectorCount = Number(
          describeNamespace.data?.recordCount ??
          describeNamespace.data?.record_count ??
          describeStats.data?.namespaces?.[resolvedNamespace]?.vector_count ??
          0
        );
        stats.pinecone.totalVectorCount = Number(
          describeStats.data?.totalVectorCount ??
          describeStats.data?.total_vector_count ??
          0
        );

        const delta = Math.abs((stats.pinecone.namespaceVectorCount ?? 0) - stats.d1.vectorizedCount);
        const baseline = Math.max(1, stats.d1.vectorizedCount);
        const driftRatio = delta / baseline;

        if (driftRatio >= 0.1) {
          addFinding(findings, {
            type: 'namespace_vector_count_mismatch',
            severity: driftRatio >= 0.25 ? 'high' : 'medium',
            evidence: {
              namespace: resolvedNamespace,
              namespaceVectorCount: stats.pinecone.namespaceVectorCount,
              d1VectorizedCount: stats.d1.vectorizedCount,
              delta,
              driftRatio: Number(driftRatio.toFixed(4))
            },
            likely_cause: 'Hay desalineación entre el corpus marcado como vectorized en D1 y el total realmente visible en Pinecone.',
            affected_ids: [],
            recommendation: 'Usar esta skill en modo standard y luego ejecutar una skill específica de sincronización o reparación solo sobre la cohorte afectada.'
          });
        }
      }

      const sampleIds = sampleRows.map((row) => row.id).filter(Boolean);
      if (sampleIds.length > 0) {
        const fetchUrl = new URL('/vectors/fetch', pineconeHost);
        for (const id of sampleIds) {
          fetchUrl.searchParams.append('ids', id);
        }
        fetchUrl.searchParams.append('namespace', resolvedNamespace);

        const fetchResult = await fetchPineconeJson<PineconeFetchResponse>(fetchUrl, {
          method: 'GET',
          apiKey: pineconeApiKey
        });

        if (fetchResult.error) {
          addFinding(findings, {
            type: 'pinecone_sample_fetch_failed',
            severity: 'high',
            evidence: {
              namespace: resolvedNamespace,
              sampleSize,
              error: fetchResult.error
            },
            likely_cause: 'La skill no pudo verificar correspondencia por ID entre D1 y Pinecone.',
            affected_ids: sampleIds.slice(0, 20),
            recommendation: 'Verificar permisos y endpoint de fetch antes de confiar en el estado vectorial del corpus.'
          });
        } else {
          const fetchedVectors = fetchResult.data?.vectors ?? {};
          const missingIds = sampleIds.filter((id) => !fetchedVectors[id]);
          stats.pinecone.sampleFetchedCount = Object.keys(fetchedVectors).length;
          stats.pinecone.sampleMissingCount = missingIds.length;

          const metadataGapIds: string[] = [];
          const modelMismatchIds: string[] = [];

          for (const row of sampleRows) {
            const vector = fetchedVectors[row.id];
            const vectorMetadata = vector?.metadata;
            if (!vector) continue;

            if (isMetadataInsufficient(vectorMetadata)) {
              metadataGapIds.push(row.id);
            }

            const vectorModel = extractMetadataModel(vectorMetadata);
            if (vectorModel && row.modelo_llm && vectorModel !== row.modelo_llm) {
              modelMismatchIds.push(row.id);
            }
          }

          stats.pinecone.sampleMetadataGapCount = metadataGapIds.length;
          stats.pinecone.sampleModelMismatches = modelMismatchIds.length;

          if (missingIds.length > 0) {
            addFinding(findings, {
              type: 'sample_vector_missing_in_active_namespace',
              severity: missingIds.length >= Math.ceil(sampleIds.length * 0.2) ? 'high' : 'medium',
              evidence: {
                namespace: resolvedNamespace,
                sampledIds: sampleIds.length,
                missingIds: missingIds.slice(0, 20),
                missingCount: missingIds.length
              },
              likely_cause: 'Parte del corpus marcado como enriched/vectorized no tiene correspondencia usable en el namespace activo.',
              affected_ids: missingIds.slice(0, 20),
              recommendation: 'Revisar si la cohorte quedó sin upsert, fue enviada a otro namespace o conserva drift 2411/2512.'
            });
          }

          if (metadataGapIds.length > 0) {
            addFinding(findings, {
              type: 'sample_vector_metadata_insufficient',
              severity: metadataGapIds.length >= Math.ceil(sampleIds.length * 0.2) ? 'high' : 'medium',
              evidence: {
                namespace: resolvedNamespace,
                metadataGapCount: metadataGapIds.length,
                affectedIdsPreview: metadataGapIds.slice(0, 20),
                requiredFields: ['materia', 'titulo', 'Resumen/resumen', 'analisis', 'fecha', 'descriptores_AI']
              },
              likely_cause: 'La metadata vectorial visible en Pinecone no alcanza para soportar clustering y doctrine-search con buena calidad.',
              affected_ids: metadataGapIds.slice(0, 20),
              recommendation: 'Reprocesar solo la cohorte con metadata insuficiente antes de tocar la lógica de retrieval.'
            });
          }

          if (modelMismatchIds.length > 0) {
            addFinding(findings, {
              type: 'sample_model_mismatch_d1_vs_pinecone',
              severity: 'medium',
              evidence: {
                mismatchCount: modelMismatchIds.length,
                affectedIdsPreview: modelMismatchIds.slice(0, 20),
                activeModel
              },
              likely_cause: 'El modelo registrado en D1 no coincide con la metadata vectorial del namespace activo para una parte del sample.',
              affected_ids: modelMismatchIds.slice(0, 20),
              recommendation: 'Separar claramente cohorte migrada vs cohorte legacy antes de automatizar más mejoras doctrinales.'
            });
          }
        }
      }

      const searchUrl = new URL(`/records/namespaces/${resolvedNamespace}/search`, pineconeHost);
      const searchResult = await fetchPineconeJson<{
        result?: { hits?: Array<Record<string, unknown>> };
      }>(searchUrl, {
        method: 'POST',
        body: JSON.stringify({
          query: {
            inputs: { text: searchProbe },
            top_k: mode === 'standard' ? 5 : 3
          }
        }),
        apiKey: pineconeApiKey
      });

      if (searchResult.error) {
        stats.pinecone.retrievalProbeError = searchResult.error;
        addFinding(findings, {
          type: 'retrieval_probe_failed',
          severity: 'high',
          evidence: {
            namespace: resolvedNamespace,
            searchProbe,
            error: searchResult.error
          },
          likely_cause: 'La búsqueda textual del namespace activo no está sana o el índice dejó de responder como espera doctrine-search.',
          affected_ids: [],
          recommendation: 'Verificar inmediatamente host, namespace y estado del índice antes de atribuir el problema a la capa doctrinal.'
        });
      } else {
        const hits = searchResult.data?.result?.hits?.length ?? 0;
        stats.pinecone.retrievalProbeHits = hits;
        if (hits === 0) {
          addFinding(findings, {
            type: 'retrieval_probe_zero_hits',
            severity: 'high',
            evidence: {
              namespace: resolvedNamespace,
              searchProbe,
              hits
            },
            likely_cause: 'El namespace activo no está soportando recuperación textual útil para consultas doctrinales básicas.',
            affected_ids: [],
            recommendation: 'Detener cualquier cambio sobre ranking semántico hasta resolver el estado del namespace.'
          });
        }
      }
    } else {
      addFinding(findings, {
        type: 'pinecone_runtime_unavailable',
        severity: 'medium',
        evidence: {
          pineconeHostPresent: Boolean(pineconeHost),
          namespacePresent: Boolean(resolvedNamespace),
          apiKeyPresent: pineconeApiKey.length > 0
        },
        likely_cause: 'La skill no pudo completar validación Pinecone por falta de host, namespace o API key.',
        affected_ids: [],
        recommendation: 'Completar configuración local antes de usar esta skill como auditoría de retrieval.'
      });
    }
  } else {
    addFinding(findings, {
      type: 'd1_runtime_unavailable',
      severity: targetEnvironment === 'local' ? 'medium' : 'high',
      evidence: {
        targetEnvironment,
        databaseIdPresent: Boolean(databaseId),
        accountIdPresent: Boolean(cloudflareAccountId),
        apiTokenPresent: cloudflareApiToken.length > 0
      },
      likely_cause: targetEnvironment === 'local'
        ? 'El modo local no expone la misma ruta read-only remota a D1 usada por esta skill.'
        : 'Faltan credenciales o metadatos para hablar con D1 por API oficial.',
      affected_ids: [],
      recommendation: targetEnvironment === 'local'
        ? 'Usar targetEnvironment=staging para auditoría real del corpus.'
        : 'Completar configuración de Cloudflare antes de ejecutar la skill.'
    });
  }

  const activeModelTag = extractModelGenerationTag(activeModel);
  const namespaceModelTag = extractModelGenerationTag(resolvedNamespace);
  if (activeModelTag && namespaceModelTag && activeModelTag !== namespaceModelTag) {
    addFinding(findings, {
      type: 'namespace_model_label_mismatch',
      severity: 'medium',
      evidence: {
        activeModel,
        activeModelTag,
        namespace: resolvedNamespace,
        namespaceModelTag
      },
      likely_cause: 'El namespace activo no parece corresponder al modelo doctrinal configurado en Wrangler.',
      affected_ids: [],
      recommendation: 'Alinear naming y bindings antes de ampliar automatización agéntica sobre retrieval.'
    });
  }

  const recommendedActions = uniqueStrings(findings.map((finding) => finding.recommendation));
  const severity = maxSeverity(findings.map((finding) => finding.severity));
  const checkedAt = new Date().toISOString();

  context.telemetry.record({
    name: 'skill_embedding_consistency_check.completed',
    timestamp: checkedAt,
    sessionId: context.sessionId,
    attributes: {
      mode,
      targetEnvironment,
      namespace: resolvedNamespace ?? 'unknown',
      severity,
      findingCount: findings.length
    }
  });

  return {
    status: 'success',
    data: {
      summary: {
        checkedAt,
        mode,
        targetEnvironment,
        namespace: resolvedNamespace,
        severity,
        headline: buildHeadline(findings, resolvedNamespace)
      },
      findings: findings.sort((left, right) => severityRank(right.severity) - severityRank(left.severity)),
      stats,
      severity,
      recommended_actions: recommendedActions
    },
    metadata: createSkillMetadata(
      'skill_embedding_consistency_check',
      context.sessionId,
      'agents-native',
      Date.now() - startedAt,
      undefined,
      {
        executionLayer: 'agents-runtime',
        capabilitySource: 'native-runtime'
      }
    )
  };
}

export type {
  EmbeddingConsistencyCheckInput,
  EmbeddingConsistencyCheckData
};
