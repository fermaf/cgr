import { fetchRecords, queryRecords } from '../clients/pinecone';
import { classifyRelationEffect, type GraphDoctrinalStatus, type RelationEffectCategory } from './doctrinalGraph';
import { normalizeLegalSourceForStorage } from './legalSourcesCanonical';
import type { Env } from '../types';

type CandidateRow = {
  id: string;
  materia: string | null;
  fecha_documento: string | null;
};

type CandidateMetadata = {
  id: string;
  materia: string;
  fecha: string;
  titulo: string;
  resumen: string;
  analisis: string;
  descriptoresAI: string[];
  booleans: string[];
};

type DoctrinalState = 'consolidado' | 'en_evolucion' | 'bajo_tension';

type PivotDictamen = {
  id: string;
  fecha: string;
  titulo: string;
  signal: 'pivote_de_cambio' | 'hito_de_evolucion';
  reason: string;
};

type RelationDynamics = {
  consolida: number;
  desarrolla: number;
  ajusta: number;
  dominant_bucket: 'consolida' | 'desarrolla' | 'ajusta' | null;
  summary: string;
};

type CoherenceSignals = {
  cluster_cohesion_score: number;
  semantic_dispersion: number;
  outlier_probability: number;
  descriptor_noise_score: number;
  fragmentation_risk: number;
  coherence_status: 'cohesiva' | 'mixta' | 'fragmentada';
  summary: string;
};

type GraphRelationInventory = {
  fortalece: number;
  desarrolla: number;
  ajusta: number;
  limita: number;
  desplaza: number;
};

type GraphDoctrinalStatusSignal = {
  status: GraphDoctrinalStatus;
  summary: string;
  relation_inventory: GraphRelationInventory;
  recent_destabilizing_count: number;
};

type DoctrineCluster = {
  cluster_label: string;
  representative_dictamen: {
    id: string;
    materia: string;
    fecha: string;
    titulo: string;
    resumen: string;
  };
  influential_dictamen_ids: string[];
  core_doctrine_candidates: Array<{ id: string; score: number }>;
  representative_score: number;
  cluster_density_score: number;
  doctrinal_importance_score: number;
  doctrinal_change_risk_score: number;
  temporal_spread_years: number;
  supporting_dictamen_ids: string[];
  top_descriptores_AI: string[];
  top_fuentes_legales: Array<{ tipo_norma: string; numero: string | null; count: number }>;
  top_acciones_juridicas: string[];
  time_span: {
    from: string | null;
    to: string | null;
  };
  cluster_summary: string;
  doctrinal_state: DoctrinalState;
  doctrinal_state_reason: string;
  pivot_dictamen: PivotDictamen | null;
  relation_dynamics: RelationDynamics;
  coherence_signals: CoherenceSignals;
  graph_doctrinal_status: GraphDoctrinalStatusSignal;
  juridical_priority_map: Record<string, number>;
  reading_priority_reason: string;
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatSimpleDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function normalizeDescriptorLabel(value: string): string {
  const compact = compactText(value).replace(/_/g, ' ');
  if (!compact) return '';
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

function looksNoisyMateria(value: string): boolean {
  const compact = compactText(value);
  if (!compact) return true;
  if (compact.length > 90) return true;
  if (/[.:;]/.test(compact) && compact.split(' ').length > 8) return true;
  const startsWithResolutionVerb = /^(Acoge|Desestima|Representa|Cursa|Se abstiene|Devuelve|Rechaza|Aprueba|Instruye)\b/i.test(compact);
  return startsWithResolutionVerb;
}

function normalizeDisplayMateria(value: string, fallbackDescriptor: string | null): string {
  const compact = compactText(value);
  if (!compact) {
    return fallbackDescriptor ? `Doctrina sobre ${normalizeDescriptorLabel(fallbackDescriptor)}` : 'Doctrina administrativa';
  }
  if (looksNoisyMateria(compact)) {
    return fallbackDescriptor ? `Doctrina sobre ${normalizeDescriptorLabel(fallbackDescriptor)}` : 'Doctrina administrativa';
  }
  return compact;
}

function ensureArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function countTopStrings(values: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

function countShared(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyGraphRelationInventory(): GraphRelationInventory {
  return {
    fortalece: 0,
    desarrolla: 0,
    ajusta: 0,
    limita: 0,
    desplaza: 0
  };
}

function parseDateToTs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPineconeQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Pinecone search error: 429') || message.includes('RESOURCE_EXHAUSTED');
}

function buildSeedQuery(candidate: CandidateMetadata): string {
  return [
    candidate.materia,
    candidate.titulo,
    candidate.resumen,
    ...candidate.descriptoresAI.slice(0, 4)
  ].filter(Boolean).join('. ');
}

function parseCandidateMetadata(id: string, metadata: Record<string, unknown>): CandidateMetadata | null {
  const fecha = asString(metadata.fecha);
  const materia = asString(metadata.materia);
  const titulo = asString(metadata.titulo);
  const resumen = asString(metadata.Resumen ?? metadata.resumen);
  const analisis = asString(metadata.analisis);
  const descriptoresAI = ensureArray(metadata.descriptores_AI);
  const booleans = [
    metadata.nuevo ? 'nuevo' : '',
    metadata.aclarado ? 'aclarado' : '',
    metadata.alterado ? 'alterado' : '',
    metadata.aplicado ? 'aplicado' : '',
    metadata.complementado ? 'complementado' : '',
    metadata.confirmado ? 'confirmado' : '',
    metadata.reactivado ? 'reactivado' : '',
    metadata.reconsiderado ? 'reconsiderado' : '',
    metadata.reconsideradoParcialmente ? 'reconsideradoParcialmente' : '',
    metadata.recursoProteccion ? 'recursoProteccion' : '',
    metadata.relevante ? 'relevante' : '',
    metadata.boletin ? 'boletin' : ''
  ].filter(Boolean);

  if (!materia && !titulo && !resumen && descriptoresAI.length === 0) {
    return null;
  }

  return {
    id,
    materia: materia || 'Sin materia',
    fecha,
    titulo,
    resumen,
    analisis,
    descriptoresAI,
    booleans
  };
}

async function resolveTargetMateria(
  env: Env,
  materia: string | null,
  fromDate: string | null,
  toDate: string | null
): Promise<string | null> {
  if (materia) return materia;
  const row = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(TRIM(materia), ''), 'Sin materia') AS materia
     FROM dictamenes
     WHERE estado IN ('enriched', 'vectorized')
       AND (? IS NULL OR fecha_documento >= ?)
       AND (? IS NULL OR fecha_documento <= ?)
     GROUP BY COALESCE(NULLIF(TRIM(materia), ''), 'Sin materia')
     ORDER BY COUNT(*) DESC, materia ASC
     LIMIT 1`
  ).bind(fromDate, fromDate, toDate, toDate).first<{ materia: string }>();
  return row?.materia ?? null;
}

async function listCandidateRows(
  env: Env,
  materia: string,
  fromDate: string | null,
  toDate: string | null,
  limit: number
): Promise<CandidateRow[]> {
  const result = await env.DB.prepare(
    `SELECT d.id, d.materia, COALESCE(d.fecha_documento, d.created_at) AS fecha_documento
     FROM dictamenes d
     WHERE d.estado IN ('enriched', 'vectorized')
       AND COALESCE(NULLIF(TRIM(d.materia), ''), 'Sin materia') = ?
       AND (? IS NULL OR COALESCE(d.fecha_documento, d.created_at) >= ?)
       AND (? IS NULL OR COALESCE(d.fecha_documento, d.created_at) <= ?)
     ORDER BY COALESCE(d.fecha_documento, d.created_at) DESC
     LIMIT ?`
  ).bind(materia, fromDate, fromDate, toDate, toDate, limit).all<CandidateRow>();
  return result.results ?? [];
}

async function aggregateClusterSignals(env: Env, ids: string[]) {
  if (ids.length === 0) {
    return {
      topFuentes: [] as Array<{ tipo_norma: string; numero: string | null; count: number }>,
      topAcciones: [] as string[],
      fuentesByDictamen: {} as Record<string, string[]>,
      relationCountByDictamen: {} as Record<string, number>,
      incomingRelationCountByDictamen: {} as Record<string, number>,
      modifyingActionCountByDictamen: {} as Record<string, number>,
      stabilizingActionCountByDictamen: {} as Record<string, number>,
      incomingModifyingActionCountByDictamen: {} as Record<string, number>,
      incomingStabilizingActionCountByDictamen: {} as Record<string, number>,
      latestIncomingRelationTsByDictamen: {} as Record<string, number>,
      relationCategoryCounts: emptyGraphRelationInventory(),
      incomingCategoryCountByDictamen: {} as Record<string, GraphRelationInventory>,
      relationBucketCounts: {
        consolida: 0,
        desarrolla: 0,
        ajusta: 0
      }
    };
  }

  const placeholders = ids.map(() => '?').join(',');

  const fuentesRows = await env.DB.prepare(
    `SELECT
       dictamen_id,
       COALESCE(NULLIF(TRIM(tipo_norma), ''), 'Desconocido') AS tipo_norma,
       NULLIF(TRIM(numero), '') AS numero
     FROM dictamen_fuentes_legales
     WHERE dictamen_id IN (${placeholders})
    `
  ).bind(...ids).all<{ dictamen_id: string; tipo_norma: string; numero: string | null }>();

  const accionesRows = await env.DB.prepare(
    `SELECT dictamen_origen_id AS dictamen_id, tipo_accion
     FROM dictamen_relaciones_juridicas
     WHERE dictamen_origen_id IN (${placeholders})
    `
  ).bind(...ids).all<{ dictamen_id: string; tipo_accion: string }>();
  const incomingRows = await env.DB.prepare(
    `SELECT
       r.dictamen_destino_id AS dictamen_id,
       r.tipo_accion,
       COALESCE(d.fecha_documento, d.created_at) AS fecha_documento
     FROM dictamen_relaciones_juridicas r
     LEFT JOIN dictamenes d ON d.id = r.dictamen_origen_id
     WHERE r.dictamen_destino_id IN (${placeholders})`
  ).bind(...ids).all<{ dictamen_id: string; tipo_accion: string; fecha_documento: string | null }>();

  const fuenteCounts = new Map<string, { tipo_norma: string; numero: string | null; count: number }>();
  const fuentesByDictamen: Record<string, string[]> = {};
  for (const row of fuentesRows.results ?? []) {
    const normalizedFuente = normalizeLegalSourceForStorage({
      tipo_norma: row.tipo_norma,
      numero: row.numero
    });
    const key = `${normalizedFuente.tipo_norma ?? row.tipo_norma}::${normalizedFuente.numero ?? ''}`;
    const existing = fuenteCounts.get(key);
    fuenteCounts.set(key, {
      tipo_norma: normalizedFuente.tipo_norma ?? row.tipo_norma,
      numero: normalizedFuente.numero ?? row.numero,
      count: (existing?.count ?? 0) + 1
    });
    if (!fuentesByDictamen[row.dictamen_id]) fuentesByDictamen[row.dictamen_id] = [];
    fuentesByDictamen[row.dictamen_id].push(key);
  }

  const actionCounts = new Map<string, number>();
  const relationCountByDictamen: Record<string, number> = {};
  const incomingRelationCountByDictamen: Record<string, number> = {};
  const modifyingActionCountByDictamen: Record<string, number> = {};
  const stabilizingActionCountByDictamen: Record<string, number> = {};
  const incomingModifyingActionCountByDictamen: Record<string, number> = {};
  const incomingStabilizingActionCountByDictamen: Record<string, number> = {};
  const latestIncomingRelationTsByDictamen: Record<string, number> = {};
  const relationCategoryCounts = emptyGraphRelationInventory();
  const incomingCategoryCountByDictamen: Record<string, GraphRelationInventory> = {};
  const relationBucketCounts = {
    consolida: 0,
    desarrolla: 0,
    ajusta: 0
  };
  for (const row of accionesRows.results ?? []) {
    actionCounts.set(row.tipo_accion, (actionCounts.get(row.tipo_accion) ?? 0) + 1);
    relationCountByDictamen[row.dictamen_id] = (relationCountByDictamen[row.dictamen_id] ?? 0) + 1;
    const effect = classifyRelationEffect(row.tipo_accion);
    relationCategoryCounts[effect] += 1;
    if (effect === 'fortalece') {
      stabilizingActionCountByDictamen[row.dictamen_id] = (stabilizingActionCountByDictamen[row.dictamen_id] ?? 0) + 1;
      relationBucketCounts.consolida += 1;
    } else if (effect === 'desarrolla') {
      relationBucketCounts.desarrolla += 1;
      modifyingActionCountByDictamen[row.dictamen_id] = (modifyingActionCountByDictamen[row.dictamen_id] ?? 0) + 1;
    } else {
      modifyingActionCountByDictamen[row.dictamen_id] = (modifyingActionCountByDictamen[row.dictamen_id] ?? 0) + 1;
      relationBucketCounts.ajusta += 1;
    }
  }
  for (const row of incomingRows.results ?? []) {
    incomingRelationCountByDictamen[row.dictamen_id] = (incomingRelationCountByDictamen[row.dictamen_id] ?? 0) + 1;
    relationCountByDictamen[row.dictamen_id] = (relationCountByDictamen[row.dictamen_id] ?? 0) + 1;
    const effect = classifyRelationEffect(row.tipo_accion);
    const incomingInventory = incomingCategoryCountByDictamen[row.dictamen_id] ?? emptyGraphRelationInventory();
    incomingInventory[effect] += 1;
    incomingCategoryCountByDictamen[row.dictamen_id] = incomingInventory;
    if (effect === 'fortalece' || effect === 'desarrolla') {
      incomingStabilizingActionCountByDictamen[row.dictamen_id] = (incomingStabilizingActionCountByDictamen[row.dictamen_id] ?? 0) + 1;
    } else {
      incomingModifyingActionCountByDictamen[row.dictamen_id] = (incomingModifyingActionCountByDictamen[row.dictamen_id] ?? 0) + 1;
    }
    const parsedTs = parseDateToTs(row.fecha_documento ?? '');
    if (parsedTs !== null) {
      latestIncomingRelationTsByDictamen[row.dictamen_id] = Math.max(
        latestIncomingRelationTsByDictamen[row.dictamen_id] ?? 0,
        parsedTs
      );
    }
  }

  const topFuentes = [...fuenteCounts.values()]
    .sort((a, b) => b.count - a.count || a.tipo_norma.localeCompare(b.tipo_norma))
    .slice(0, 5);

  const topAcciones = [...actionCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([tipoAccion]) => tipoAccion);

  return {
    topFuentes,
    topAcciones,
    fuentesByDictamen,
    relationCountByDictamen,
    incomingRelationCountByDictamen,
    modifyingActionCountByDictamen,
    stabilizingActionCountByDictamen,
    incomingModifyingActionCountByDictamen,
    incomingStabilizingActionCountByDictamen,
    latestIncomingRelationTsByDictamen,
    relationCategoryCounts,
    incomingCategoryCountByDictamen,
    relationBucketCounts
  };
}

function buildRelationDynamics(params: {
  relationBucketCounts: {
    consolida: number;
    desarrolla: number;
    ajusta: number;
  };
  pivotDictamen: PivotDictamen | null;
}) {
  const entries = [
    ['consolida', params.relationBucketCounts.consolida],
    ['desarrolla', params.relationBucketCounts.desarrolla],
    ['ajusta', params.relationBucketCounts.ajusta]
  ] as const;
  const dominant = [...entries].sort((a, b) => b[1] - a[1])[0];
  const dominant_bucket = dominant[1] > 0 ? dominant[0] : null;

  let summary = 'La línea todavía muestra pocas relaciones jurídicas materializadas dentro del corpus visible.';
  if (dominant_bucket === 'consolida') {
    summary = 'Predominan dictámenes que aplican o confirman criterio previo, lo que sugiere una línea con apoyo jurisprudencial acumulado.';
  } else if (dominant_bucket === 'desarrolla') {
    summary = 'Predominan dictámenes que complementan o aclaran criterio previo, lo que sugiere desarrollo progresivo de la línea.';
  } else if (dominant_bucket === 'ajusta') {
    summary = params.pivotDictamen
      ? `Predominan dictámenes que ajustan criterio previo y el giro más visible se concentra en ${params.pivotDictamen.id}.`
      : 'Predominan dictámenes que ajustan o reordenan criterio previo, lo que sugiere una línea doctrinal en movimiento.';
  }

  return {
    ...params.relationBucketCounts,
    dominant_bucket,
    summary
  } as RelationDynamics;
}

function buildGraphDoctrinalStatus(params: {
  relationCategoryCounts: GraphRelationInventory;
  coherenceSignals: CoherenceSignals;
  pivotDictamen: PivotDictamen | null;
  temporalSpreadYears: number;
}) {
  const recentDestabilizingCount = params.relationCategoryCounts.ajusta
    + params.relationCategoryCounts.limita
    + params.relationCategoryCounts.desplaza;

  let status: GraphDoctrinalStatus = 'criterio_estable';
  let summary = 'Predominan decisiones posteriores que mantienen o fortalecen el criterio visible.';

  if (params.coherenceSignals.coherence_status === 'fragmentada') {
    status = 'criterio_fragmentado';
    summary = 'La línea mezcla señales doctrinales distintas y conviene revisar si contiene criterios separados.';
  } else if (params.relationCategoryCounts.desplaza > 0 || params.relationCategoryCounts.limita >= 2) {
    status = 'criterio_en_revision';
    summary = params.pivotDictamen
      ? `Existen decisiones posteriores que revisan o desplazan el criterio, y el hito más visible es ${params.pivotDictamen.id}.`
      : 'Existen decisiones posteriores que revisan o desplazan el criterio visible.';
  } else if (recentDestabilizingCount >= Math.max(params.relationCategoryCounts.fortalece, 1) * 0.35) {
    status = 'criterio_tensionado';
    summary = params.pivotDictamen
      ? `El criterio sigue operativo, pero muestra ajustes recientes y uno de los más visibles es ${params.pivotDictamen.id}.`
      : 'El criterio sigue operativo, pero muestra ajustes recientes entre decisiones posteriores.';
  } else if (
    params.relationCategoryCounts.desarrolla > 0
    || params.relationCategoryCounts.ajusta > 0
    || params.temporalSpreadYears >= 3
  ) {
    status = 'criterio_en_evolucion';
    summary = 'El criterio mantiene una base reconocible, pero ha sido desarrollado o ajustado en el tiempo.';
  }

  return {
    status,
    summary,
    relation_inventory: params.relationCategoryCounts,
    recent_destabilizing_count: recentDestabilizingCount
  } as GraphDoctrinalStatusSignal;
}

function safeRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function buildCoherenceSignals(params: {
  memberCount: number;
  clusterDensityScore: number;
  allDescriptors: string[];
  topFuentes: Array<{ tipo_norma: string; numero: string | null; count: number }>;
  relationCountByDictamen: Record<string, number>;
  influenceEntries: Array<{ id: string; score: number }>;
  relationDynamics: RelationDynamics;
}) {
  const descriptorCounts = new Map<string, number>();
  for (const descriptor of params.allDescriptors) {
    descriptorCounts.set(descriptor, (descriptorCounts.get(descriptor) ?? 0) + 1);
  }

  const sortedDescriptorCounts = [...descriptorCounts.values()].sort((a, b) => b - a);
  const topDescriptorCount = sortedDescriptorCounts[0] ?? 0;
  const secondDescriptorCount = sortedDescriptorCounts[1] ?? 0;
  const descriptorDominance = safeRatio(topDescriptorCount, params.memberCount);
  const descriptorCompetition = safeRatio(secondDescriptorCount, Math.max(topDescriptorCount, 1));
  const topFuenteDominance = params.topFuentes.length > 0
    ? safeRatio(params.topFuentes[0]?.count ?? 0, params.memberCount)
    : 0;
  const docsWithRelations = Object.values(params.relationCountByDictamen).filter((count) => count > 0).length;
  const relationCoverage = safeRatio(docsWithRelations, params.memberCount);
  const outlierCount = params.influenceEntries.filter((entry) => entry.score < Math.max(params.clusterDensityScore * 0.7, 0.35)).length;
  const outlierProbability = roundScore(safeRatio(outlierCount, params.memberCount));
  const descriptorNoiseScore = roundScore(Math.min((1 - descriptorDominance) * 0.7 + descriptorCompetition * 0.3, 1));
  const cohesion = roundScore(Math.max(Math.min(
    params.clusterDensityScore * 0.55
      + descriptorDominance * 0.2
      + topFuenteDominance * 0.15
      + relationCoverage * 0.1,
    1
  ), 0));
  const semanticDispersion = roundScore(1 - cohesion);

  const fragmentationRisk = roundScore(Math.min(
    semanticDispersion * 0.45
      + outlierProbability * 0.3
      + descriptorCompetition * 0.15
      + (params.relationDynamics.dominant_bucket === 'ajusta' ? 0.1 : 0),
    1
  ));

  let coherence_status: CoherenceSignals['coherence_status'] = 'cohesiva';
  let summary = 'La línea muestra cohesión suficiente entre sus dictámenes visibles.';

  if (fragmentationRisk >= 0.62 || (semanticDispersion >= 0.5 && outlierProbability >= 0.3)) {
    coherence_status = 'fragmentada';
    summary = 'La línea parece mezclar señales doctrinales distintas o contener outliers relevantes; conviene revisar si debe separarse o depurarse.';
  } else if (semanticDispersion >= 0.34 || descriptorNoiseScore >= 0.45 || outlierProbability >= 0.22) {
    coherence_status = 'mixta';
    summary = 'La línea mantiene un eje doctrinal visible, pero algunos dictámenes tratan temas relacionados y no exactamente idénticos.';
  }

  return {
    cluster_cohesion_score: cohesion,
    semantic_dispersion: semanticDispersion,
    outlier_probability: outlierProbability,
    descriptor_noise_score: descriptorNoiseScore,
    fragmentation_risk: fragmentationRisk,
    coherence_status,
    summary
  } as CoherenceSignals;
}

function buildClusterSummary(
  materia: string,
  memberCount: number,
  topDescriptor: string | null,
  topAction: string | null,
  from: string | null,
  to: string | null
): string {
  const doctrinalAxis = normalizeDescriptorLabel(topDescriptor || topAction || 'criterio recurrente');
  const fromDate = formatSimpleDate(from);
  const toDate = formatSimpleDate(to);
  const timeNote = fromDate && toDate ? `entre ${fromDate} y ${toDate}` : 'en el corpus vigente';
  return `Grupo de ${memberCount} dictámenes en ${materia} que convergen en ${doctrinalAxis} ${timeNote}.`;
}

function buildDoctrinalImportanceScore(params: {
  clusterDensityScore: number;
  clusterSize: number;
  coreCandidateCount: number;
  topFuentes: Array<{ tipo_norma: string; numero: string | null; count: number }>;
  from: string | null;
  to: string | null;
}): number {
  const sizeScore = Math.min(Math.log2(params.clusterSize + 1) / 3, 1);
  const coreScore = Math.min(params.coreCandidateCount / 2, 1);
  const fuentesSharedScore = params.topFuentes.length > 0
    ? Math.min((params.topFuentes[0]?.count ?? 0) / Math.max(params.clusterSize, 1), 1)
    : 0;

  let temporalScore = 0.4;
  const fromTs = params.from ? parseDateToTs(params.from) : null;
  const toTs = params.to ? parseDateToTs(params.to) : null;
  if (fromTs !== null && toTs !== null && toTs >= fromTs) {
    const spanDays = (toTs - fromTs) / (1000 * 60 * 60 * 24);
    temporalScore = spanDays <= 0 ? 0.2 : Math.min(spanDays / 365, 1);
  }

  const score = (params.clusterDensityScore * 0.45)
    + (sizeScore * 0.2)
    + (coreScore * 0.15)
    + (fuentesSharedScore * 0.15)
    + (temporalScore * 0.05);

  return roundScore(score);
}

function buildDoctrinalChangeRiskScore(params: {
  clusterDensityScore: number;
  topFuentes: Array<{ tipo_norma: string; numero: string | null; count: number }>;
  clusterSize: number;
  from: string | null;
  to: string | null;
  coreDates: string[];
}): { doctrinalChangeRiskScore: number; temporalSpreadYears: number; coreTemporalDistanceYears: number } {
  const fromTs = params.from ? parseDateToTs(params.from) : null;
  const toTs = params.to ? parseDateToTs(params.to) : null;
  const spanMs = fromTs !== null && toTs !== null && toTs >= fromTs ? (toTs - fromTs) : 0;
  const temporalSpreadYears = spanMs > 0 ? spanMs / (1000 * 60 * 60 * 24 * 365.25) : 0;

  const coreTimestamps = params.coreDates
    .map((date) => parseDateToTs(date))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const coreTemporalDistanceYears = coreTimestamps.length >= 2
    ? (coreTimestamps[coreTimestamps.length - 1] - coreTimestamps[0]) / (1000 * 60 * 60 * 24 * 365.25)
    : 0;

  const temporalSpreadScore = Math.min(temporalSpreadYears / 8, 1);
  const coreDistanceScore = Math.min(coreTemporalDistanceYears / 6, 1);
  const fuentesStabilityScore = params.topFuentes.length > 0
    ? Math.min((params.topFuentes[0]?.count ?? 0) / Math.max(params.clusterSize, 1), 1)
    : 0;

  const score = (params.clusterDensityScore * 0.4)
    + (fuentesStabilityScore * 0.25)
    + (temporalSpreadScore * 0.2)
    + (coreDistanceScore * 0.15);

  return {
    doctrinalChangeRiskScore: roundScore(score),
    temporalSpreadYears: roundScore(temporalSpreadYears),
    coreTemporalDistanceYears: roundScore(coreTemporalDistanceYears)
  };
}

function buildInfluenceScores(
  members: CandidateMetadata[],
  neighborIds: Set<string>,
  fuentesByDictamen: Record<string, string[]>,
  relationCountByDictamen: Record<string, number>,
  incomingCategoryCountByDictamen: Record<string, GraphRelationInventory>,
  incomingModifyingActionCountByDictamen: Record<string, number>,
  incomingStabilizingActionCountByDictamen: Record<string, number>,
  latestIncomingRelationTsByDictamen: Record<string, number>
) {
  const timestamps = members.map((member) => parseDateToTs(member.fecha)).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const medianTs = timestamps.length > 0 ? timestamps[Math.floor(timestamps.length / 2)] : null;
  const minTs = timestamps[0] ?? null;
  const maxTs = timestamps[timestamps.length - 1] ?? null;
  const dateRange = minTs !== null && maxTs !== null ? Math.max(maxTs - minTs, 1) : null;

  const scores = members.map((member) => {
    const others = members.filter((candidate) => candidate.id !== member.id);
    const sharedDescriptors = others.reduce((acc, candidate) => acc + countShared(member.descriptoresAI, candidate.descriptoresAI), 0);
    const sharedBooleans = others.reduce((acc, candidate) => acc + countShared(member.booleans, candidate.booleans), 0);
    const sharedFuentes = others.reduce((acc, candidate) => {
      return acc + countShared(fuentesByDictamen[member.id] ?? [], fuentesByDictamen[candidate.id] ?? []);
    }, 0);

    const descriptorScore = Math.min(sharedDescriptors / Math.max(others.length * 2, 1), 1);
    const booleanScore = Math.min(sharedBooleans / Math.max(others.length * 2, 1), 1);
    const fuenteScore = Math.min(sharedFuentes / Math.max(others.length, 1), 1);
    const neighborScore = neighborIds.has(member.id) ? 1 : 0;
    const relationScore = Math.min((relationCountByDictamen[member.id] ?? 0) / 3, 1);
    const incomingInventory = incomingCategoryCountByDictamen[member.id] ?? emptyGraphRelationInventory();
    const incomingAdjustments = incomingModifyingActionCountByDictamen[member.id] ?? 0;
    const incomingStabilizations = incomingStabilizingActionCountByDictamen[member.id] ?? 0;

    let temporalScore = 0.5;
    let recencyScore = 0.5;
    if (medianTs !== null && dateRange !== null) {
      const currentTs = parseDateToTs(member.fecha);
      if (currentTs !== null) {
        temporalScore = 1 - Math.min(Math.abs(currentTs - medianTs) / dateRange, 1);
        if (minTs !== null && maxTs !== null && maxTs > minTs) {
          recencyScore = Math.min(Math.max((currentTs - minTs) / (maxTs - minTs), 0), 1);
        }
      }
    }

    const laterStabilityBonus = Math.min((incomingInventory.fortalece + incomingInventory.desarrolla * 0.65) / 3, 1);
    const obsolescencePenalty = Math.min((incomingInventory.limita * 0.8 + incomingInventory.desplaza * 1.2 + incomingInventory.ajusta * 0.45) / 2, 1);
    const latestIncomingTs = latestIncomingRelationTsByDictamen[member.id] ?? 0;
    const latestMemberTs = parseDateToTs(member.fecha) ?? 0;
    const laterActivityScore = latestIncomingTs > latestMemberTs ? 1 : 0;

    const score = (descriptorScore * 0.35)
      + (fuenteScore * 0.2)
      + (neighborScore * 0.2)
      + (booleanScore * 0.1)
      + (relationScore * 0.1)
      + (temporalScore * 0.05);

    const juridicalPriority = Math.max(Math.min(
      (score * 0.48)
      + (recencyScore * 0.18)
      + (laterStabilityBonus * 0.16)
      + (relationScore * 0.08)
      + (laterActivityScore * 0.06)
      - (obsolescencePenalty * 0.2),
      1
    ), 0);

    return {
      id: member.id,
      score,
      juridicalPriority,
      descriptorScore,
      fuenteScore,
      neighborScore,
      booleanScore,
      relationScore,
      temporalScore,
      recencyScore,
      laterStabilityBonus,
      obsolescencePenalty,
      incomingInventory,
      member
    };
  }).sort((a, b) => b.juridicalPriority - a.juridicalPriority || b.score - a.score || a.id.localeCompare(b.id));

  const representative = scores[0];
  const clusterDensityScore = scores.length > 0
    ? scores.reduce((acc, entry) => acc + entry.score, 0) / scores.length
    : 0;
  const representativeScore = representative ? roundScore(representative.juridicalPriority) : 0;
  const minCoreScore = Math.max(clusterDensityScore, representative?.juridicalPriority ? representative.juridicalPriority * 0.78 : 0);
  const coreCandidates = scores
    .filter((entry) => (
      entry.juridicalPriority >= minCoreScore
      && entry.relationScore >= 0.34
      && entry.fuenteScore >= 0.25
      && entry.temporalScore >= 0.2
      && entry.obsolescencePenalty < 0.8
    ))
    .slice(0, 2)
    .map((entry) => ({
      id: entry.id,
      score: roundScore(entry.juridicalPriority)
    }));

  const juridicalPriorityById = Object.fromEntries(
    scores.map((entry) => [entry.id, roundScore(entry.juridicalPriority)])
  );
  const readingPriorityReason = representative
    ? representative.obsolescencePenalty >= 0.5
      ? 'Se prioriza la lectura de los dictámenes menos desplazados por decisiones posteriores visibles.'
      : representative.laterStabilityBonus >= 0.34
        ? 'Se prioriza la lectura de los dictámenes que siguen siendo retomados por decisiones posteriores de la línea.'
        : representative.recencyScore >= 0.55
          ? 'Se prioriza la lectura de los dictámenes más recientes que conservan peso dentro del criterio visible.'
          : 'Se prioriza la lectura de los dictámenes que mejor concentran el criterio y su continuidad visible.'
    : 'Se prioriza la lectura de los dictámenes que mejor concentran el criterio visible.';

  return {
    entries: scores,
    representative,
    influentialIds: scores.slice(0, Math.min(3, scores.length)).map((entry) => entry.id),
    coreCandidates,
    representativeScore,
    clusterDensityScore: roundScore(clusterDensityScore),
    juridicalPriorityById,
    readingPriorityReason
  };
}

function buildPivotDictamen(params: {
  entries: Array<{
    id: string;
    relationScore: number;
    juridicalPriority: number;
    temporalScore: number;
    member: CandidateMetadata;
  }>;
  representativeId: string;
  modifyingActionCountByDictamen: Record<string, number>;
  stabilizingActionCountByDictamen: Record<string, number>;
}): PivotDictamen | null {
  const candidates = params.entries
    .filter((entry) => entry.id !== params.representativeId)
    .map((entry) => {
      const modifyingCount = params.modifyingActionCountByDictamen[entry.id] ?? 0;
      const stabilizingCount = params.stabilizingActionCountByDictamen[entry.id] ?? 0;
      const recencyTs = parseDateToTs(entry.member.fecha) ?? 0;
      return {
        entry,
        modifyingCount,
        stabilizingCount,
        recencyTs
      };
    })
    .filter((candidate) => candidate.modifyingCount > 0 || candidate.stabilizingCount > 0)
    .sort((left, right) => (
      right.modifyingCount - left.modifyingCount
      || right.stabilizingCount - left.stabilizingCount
      || right.recencyTs - left.recencyTs
      || right.entry.juridicalPriority - left.entry.juridicalPriority
      || right.entry.relationScore - left.entry.relationScore
      || left.entry.id.localeCompare(right.entry.id)
    ));

  const selected = candidates[0];
  if (!selected) return null;

  const signal = selected.modifyingCount > 0 ? 'pivote_de_cambio' : 'hito_de_evolucion';
  const reason = selected.modifyingCount > 0
    ? 'Marca un ajuste visible del criterio y aparece entre los hitos posteriores con mayor impacto.'
    : 'Aparece como hito reciente que todavía consolida o proyecta la línea visible.';

  return {
    id: selected.entry.id,
    fecha: selected.entry.member.fecha,
    titulo: selected.entry.member.titulo || selected.entry.member.resumen || 'Dictamen pivote',
    signal,
    reason
  };
}

function buildDoctrinalState(params: {
  doctrinalChangeRiskScore: number;
  clusterDensityScore: number;
  relationCategoryCounts: GraphRelationInventory;
  pivotDictamen: PivotDictamen | null;
  temporalSpreadYears: number;
  coreCandidateCount: number;
}) {
  const modifyingSignals = params.relationCategoryCounts.ajusta + params.relationCategoryCounts.limita + params.relationCategoryCounts.desplaza;
  const stabilizingSignals = params.relationCategoryCounts.fortalece;

  if (
    params.doctrinalChangeRiskScore >= 0.72
    || modifyingSignals >= 2
    || params.relationCategoryCounts.desplaza > 0
    || params.pivotDictamen?.signal === 'pivote_de_cambio'
  ) {
    return {
      doctrinal_state: 'bajo_tension' as const,
      doctrinal_state_reason: params.pivotDictamen
        ? `Existen decisiones posteriores que ajustan o revisan el criterio, y una de las más visibles es ${params.pivotDictamen.id}.`
        : 'Existen decisiones posteriores que ajustan o revisan el criterio dentro del corpus visible.'
    };
  }

  if (
    params.doctrinalChangeRiskScore >= 0.38
    || params.temporalSpreadYears >= 3
    || params.coreCandidateCount < 2
  ) {
    return {
      doctrinal_state: 'en_evolucion' as const,
      doctrinal_state_reason: params.pivotDictamen
        ? `La línea evoluciona en el tiempo y uno de sus hitos visibles es ${params.pivotDictamen.id}.`
        : 'La línea parece evolucionar en el tiempo, aunque sin una revisión doctrinal fuerte.'
    };
  }

  return {
    doctrinal_state: 'consolidado' as const,
    doctrinal_state_reason: stabilizingSignals > 0 || params.clusterDensityScore >= 0.65
      ? 'La línea muestra un núcleo estable y señales de reiteración consistentes.'
      : 'La línea se presenta estable dentro del corpus visible.'
  };
}

type BuildDoctrineClustersOptions = {
  materia?: string | null;
  candidateIds?: string[] | null;
  limit?: number;
  topK?: number;
  fromDate?: string | null;
  toDate?: string | null;
};

async function listCandidateRowsByIds(
  env: Env,
  ids: string[]
): Promise<CandidateRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const result = await env.DB.prepare(
    `SELECT d.id, d.materia, COALESCE(d.fecha_documento, d.created_at) AS fecha_documento
     FROM dictamenes d
     WHERE d.id IN (${placeholders})
       AND d.estado IN ('enriched', 'vectorized')`
  ).bind(...ids).all<CandidateRow>();
  return result.results ?? [];
}

async function buildDoctrineClusters(env: Env, options: BuildDoctrineClustersOptions) {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);
  const topK = Math.min(Math.max(options.topK ?? 8, 3), 20);
  const fromDate = options.fromDate ?? null;
  const toDate = options.toDate ?? null;
  const requestedCandidateIds = [...new Set((options.candidateIds ?? []).filter(Boolean))];
  const targetMateria = requestedCandidateIds.length > 0
    ? null
    : await resolveTargetMateria(env, options.materia ?? null, fromDate, toDate);

  if (!targetMateria && requestedCandidateIds.length === 0) {
    return {
      materia: null,
      clusters: [] as DoctrineCluster[],
      stats: {
        total_dictamenes_considerados: 0,
        total_clusters_generados: 0
      }
    };
  }

  const candidateRows = requestedCandidateIds.length > 0
    ? await listCandidateRowsByIds(env, requestedCandidateIds)
    : await listCandidateRows(env, targetMateria!, fromDate, toDate, Math.min(limit * topK * 3, 120));
  if (candidateRows.length === 0) {
    return {
      materia: targetMateria,
      clusters: [] as DoctrineCluster[],
      stats: {
        total_dictamenes_considerados: 0,
        total_clusters_generados: 0
      }
    };
  }

  const pineconeRecords = await fetchRecords(env, candidateRows.map((row) => row.id));
  const candidates = candidateRows
    .map((row) => parseCandidateMetadata(row.id, pineconeRecords.vectors?.[row.id]?.metadata ?? {}))
    .filter((row): row is CandidateMetadata => row !== null);
  const dominantCandidateMateria = countTopStrings(candidates.map((candidate) => candidate.materia).filter(Boolean), 1)[0] ?? null;
  const clusterMateria = targetMateria ?? dominantCandidateMateria ?? 'Materia relacionada';

  const remaining = new Set(candidates.map((candidate) => candidate.id));
  const clusters: DoctrineCluster[] = [];

  for (const seed of candidates) {
    if (!remaining.has(seed.id) || clusters.length >= limit) continue;

    const seedQuery = buildSeedQuery(seed);
    const pineconeFilter: Record<string, unknown> = {};
    if (targetMateria) {
      pineconeFilter.materia = { $eq: targetMateria };
    }
    if (fromDate) pineconeFilter.fecha = { ...(pineconeFilter.fecha as Record<string, string> | undefined), $gte: fromDate };
    if (toDate) pineconeFilter.fecha = { ...(pineconeFilter.fecha as Record<string, string> | undefined), $lte: toDate };

    const neighbors = requestedCandidateIds.length > 0
      ? { matches: requestedCandidateIds.map((id) => ({ id })) }
      : seedQuery
        ? await queryRecords(env, seedQuery, Math.min(topK * 3, 30), pineconeFilter).catch((error) => {
            if (isPineconeQuotaError(error)) {
              console.warn('[DOCTRINE_CLUSTERS] Pinecone quota exhausted; continuing with metadata-only clustering.');
              return { matches: [] as Array<{ id: string }> };
            }
            throw error;
          })
        : { matches: [] as Array<{ id: string }> };
    const neighborIds = new Set<string>((neighbors.matches ?? []).map((match: { id: string }) => match.id));

    const members = candidates.filter((candidate) => {
      if (!remaining.has(candidate.id)) return false;
      if (candidate.id === seed.id) return true;

      let score = 0;
      if (candidate.materia === seed.materia) score += 2;

      const sharedDescriptors = countShared(seed.descriptoresAI, candidate.descriptoresAI);
      score += Math.min(sharedDescriptors * 2, 6);

      const sharedBooleans = countShared(seed.booleans, candidate.booleans);
      score += Math.min(sharedBooleans, 3);

      if (neighborIds.has(candidate.id)) score += 3;

      return score >= 5 && (sharedDescriptors > 0 || neighborIds.has(candidate.id));
    }).slice(0, topK);

    if (members.length < 2) {
      remaining.delete(seed.id);
      continue;
    }

    for (const member of members) {
      remaining.delete(member.id);
    }

    const supportingIds = members.map((member) => member.id);
    const topDescriptors = countTopStrings(members.flatMap((member) => member.descriptoresAI), 5);
    const minDate = members.map((member) => member.fecha).filter(Boolean).sort()[0] ?? null;
    const maxDate = members.map((member) => member.fecha).filter(Boolean).sort().slice(-1)[0] ?? null;
    const aggregates = await aggregateClusterSignals(env, supportingIds);
    const influence = buildInfluenceScores(
      members,
      neighborIds,
      aggregates.fuentesByDictamen,
      aggregates.relationCountByDictamen,
      aggregates.incomingCategoryCountByDictamen,
      aggregates.incomingModifyingActionCountByDictamen,
      aggregates.incomingStabilizingActionCountByDictamen,
      aggregates.latestIncomingRelationTsByDictamen
    );
    const topDescriptor = topDescriptors[0] ?? null;
    const topAction = aggregates.topAcciones[0] ?? null;
    const displayMateria = normalizeDisplayMateria(clusterMateria, topDescriptor || topAction);
    const displayAxis = normalizeDescriptorLabel(topDescriptor || topAction || 'Criterio recurrente');
    const clusterLabel = displayMateria.startsWith('Doctrina sobre')
      ? displayAxis
      : `${displayAxis} en ${displayMateria}`;
    const doctrinalImportanceScore = buildDoctrinalImportanceScore({
      clusterDensityScore: influence.clusterDensityScore,
      clusterSize: supportingIds.length,
      coreCandidateCount: influence.coreCandidates.length,
      topFuentes: aggregates.topFuentes,
      from: minDate,
      to: maxDate
    });
    const changeRisk = buildDoctrinalChangeRiskScore({
      clusterDensityScore: influence.clusterDensityScore,
      topFuentes: aggregates.topFuentes,
      clusterSize: supportingIds.length,
      from: minDate,
      to: maxDate,
      coreDates: influence.coreCandidates
        .map((candidate) => members.find((member) => member.id === candidate.id)?.fecha ?? '')
        .filter(Boolean)
    });
    const pivotDictamen = buildPivotDictamen({
      entries: influence.entries,
      representativeId: influence.representative?.member.id ?? seed.id,
      modifyingActionCountByDictamen: aggregates.modifyingActionCountByDictamen,
      stabilizingActionCountByDictamen: aggregates.stabilizingActionCountByDictamen
    });
    const doctrinalState = buildDoctrinalState({
      doctrinalChangeRiskScore: changeRisk.doctrinalChangeRiskScore,
      clusterDensityScore: influence.clusterDensityScore,
      relationCategoryCounts: aggregates.relationCategoryCounts,
      pivotDictamen,
      temporalSpreadYears: changeRisk.temporalSpreadYears,
      coreCandidateCount: influence.coreCandidates.length
    });
    const relationDynamics = buildRelationDynamics({
      relationBucketCounts: aggregates.relationBucketCounts,
      pivotDictamen
    });
    const coherenceSignals = buildCoherenceSignals({
      memberCount: supportingIds.length,
      clusterDensityScore: influence.clusterDensityScore,
      allDescriptors: members.flatMap((member) => member.descriptoresAI),
      topFuentes: aggregates.topFuentes,
      relationCountByDictamen: aggregates.relationCountByDictamen,
      influenceEntries: influence.entries.map((entry) => ({ id: entry.id, score: entry.score })),
      relationDynamics
    });
    const graphDoctrinalStatus = buildGraphDoctrinalStatus({
      relationCategoryCounts: aggregates.relationCategoryCounts,
      coherenceSignals,
      pivotDictamen,
      temporalSpreadYears: changeRisk.temporalSpreadYears
    });

    clusters.push({
      cluster_label: clusterLabel,
      representative_dictamen: {
        id: influence.representative?.member.id ?? seed.id,
        materia: influence.representative?.member.materia ?? seed.materia,
        fecha: influence.representative?.member.fecha ?? seed.fecha,
        titulo: influence.representative?.member.titulo ?? seed.titulo,
        resumen: influence.representative?.member.resumen ?? seed.resumen
      },
      influential_dictamen_ids: influence.influentialIds,
      core_doctrine_candidates: influence.coreCandidates,
      representative_score: influence.representativeScore,
      cluster_density_score: influence.clusterDensityScore,
      doctrinal_importance_score: doctrinalImportanceScore,
      doctrinal_change_risk_score: changeRisk.doctrinalChangeRiskScore,
      temporal_spread_years: changeRisk.temporalSpreadYears,
      supporting_dictamen_ids: supportingIds,
      top_descriptores_AI: topDescriptors,
      top_fuentes_legales: aggregates.topFuentes,
      top_acciones_juridicas: aggregates.topAcciones,
      time_span: {
        from: minDate,
        to: maxDate
      },
      cluster_summary: buildClusterSummary(displayMateria, supportingIds.length, topDescriptor, topAction, minDate, maxDate),
      doctrinal_state: doctrinalState.doctrinal_state,
      doctrinal_state_reason: doctrinalState.doctrinal_state_reason,
      graph_doctrinal_status: graphDoctrinalStatus,
      pivot_dictamen: pivotDictamen,
      relation_dynamics: relationDynamics,
      coherence_signals: coherenceSignals,
      juridical_priority_map: influence.juridicalPriorityById,
      reading_priority_reason: influence.readingPriorityReason
    });
  }

  clusters.sort((a, b) => (
    b.doctrinal_importance_score - a.doctrinal_importance_score
    || b.cluster_density_score - a.cluster_density_score
    || b.supporting_dictamen_ids.length - a.supporting_dictamen_ids.length
    || a.cluster_label.localeCompare(b.cluster_label)
  ));

  return {
    materia: normalizeDisplayMateria(clusterMateria, clusters[0]?.top_descriptores_AI[0] ?? null),
    clusters,
    stats: {
      total_dictamenes_considerados: candidates.length,
      total_clusters_generados: clusters.length
    }
  };
}

export type { DoctrineCluster };
export { buildDoctrineClusters };
