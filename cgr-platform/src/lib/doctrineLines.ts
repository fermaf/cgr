import { fetchRecords } from '../clients/pinecone';
import { buildDoctrineClusters } from './doctrineClusters';
import { loadDoctrinalMetadataByIds, type DictamenMetadataLean } from './doctrinalMetadata';
import { applyDoctrineStructureRemediations } from './doctrineStructureRemediations';
import { formatCanonicalLegalSourceLabel } from './legalSourcesCanonical';
import { buildIntentBoost, buildSubtopicBoost, detectQueryIntent, detectQuerySubtopic } from './queryUnderstanding/queryIntent';
import { retrieveDoctrineMatchesWithQueryUnderstanding } from './queryUnderstanding/queryRewrite';
import type { DictamenMetadataDoctrinalRow, Env } from '../types';

type DoctrinalMetadataMap = Record<string, DictamenMetadataDoctrinalRow | DictamenMetadataLean>;

type InsightLevel = 'low' | 'medium' | 'high';
type KeyDictamenRole = 'representativo' | 'núcleo doctrinal' | 'pivote de cambio' | 'apoyo relevante';
type SearchMatch = { id: string; score?: number; metadata?: Record<string, unknown> };
type SearchMatchInfo = {
  rawScore: number;
  normalizedScore: number;
  rank: number;
  metadata?: Record<string, unknown>;
};

type LexicalDoctrineSearchMatch = {
  id: string;
  materia: string;
  score: number;
};

type SearchMetadataLike = {
  materia?: unknown;
  titulo?: unknown;
  Resumen?: unknown;
  resumen?: unknown;
  analisis?: unknown;
  fecha?: unknown;
  relevante?: unknown;
  descriptores_AI?: unknown;
};

function toLevel(score: number): InsightLevel {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

function formatFuenteLegal(fuente: { tipo_norma: string; numero: string | null }): string {
  return formatCanonicalLegalSourceLabel(fuente) ?? (fuente.numero ? `${fuente.tipo_norma} ${fuente.numero}` : fuente.tipo_norma);
}

function pickText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function compactDisplayText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatSimpleDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function parseDateToTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function looksNoisyDisplayLabel(value: string): boolean {
  const compact = compactDisplayText(value);
  if (!compact) return true;
  if (compact.length > 90) return true;
  if (/[.:;]/.test(compact) && compact.split(' ').length > 8) return true;
  return /^(Acoge|Desestima|Representa|Cursa|Se abstiene|Devuelve|Rechaza|Aprueba|Instruye)\b/i.test(compact);
}

function cleanOverviewLabel(primary: string | null, fallback: string | null): string | null {
  const cleanPrimary = primary ? compactDisplayText(primary) : null;
  const cleanFallback = fallback ? compactDisplayText(fallback) : null;

  if (cleanPrimary && !looksNoisyDisplayLabel(cleanPrimary)) return cleanPrimary;
  if (cleanFallback && !looksNoisyDisplayLabel(cleanFallback)) return cleanFallback;
  return cleanPrimary || cleanFallback || null;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function tokenizeSearchText(value: string): string[] {
  return [...new Set(
    normalizeSearchText(value)
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  )];
}

function buildQueryCoverageProfile(query: string, semanticText: string) {
  const queryTokens = tokenizeSearchText(query);
  const normalizedSemanticText = normalizeSearchText(semanticText);
  const matchedTokens = queryTokens.filter((token) => normalizedSemanticText.includes(token));
  const coverage = queryTokens.length > 0 ? matchedTokens.length / queryTokens.length : 0;
  return {
    matchedTokens,
    coverage
  };
}

function buildKeyDictamenes(
  cluster: Awaited<ReturnType<typeof buildDoctrineClusters>>['clusters'][number],
  metadataById: Record<string, Record<string, unknown>>,
  doctrinalMetadataById: DoctrinalMetadataMap
) {
  const keyed = new Map<string, KeyDictamenRole>();
  keyed.set(cluster.representative_dictamen.id, 'representativo');

  for (const candidate of cluster.core_doctrine_candidates) {
    if (!keyed.has(candidate.id)) {
      keyed.set(candidate.id, 'núcleo doctrinal');
    }
  }

  if (cluster.pivot_dictamen && !keyed.has(cluster.pivot_dictamen.id)) {
    keyed.set(cluster.pivot_dictamen.id, 'pivote de cambio');
  }

  for (const id of cluster.influential_dictamen_ids) {
    if (keyed.size >= 5) break;
    if (!keyed.has(id)) {
      keyed.set(id, 'apoyo relevante');
    }
  }

  const roleOrder: Record<KeyDictamenRole, number> = {
    representativo: 0,
    'pivote de cambio': 1,
    'núcleo doctrinal': 2,
    'apoyo relevante': 3
  };

  return [...keyed.entries()]
    .sort((left, right) => {
      const leftPriority = cluster.juridical_priority_map[left[0]] ?? 0;
      const rightPriority = cluster.juridical_priority_map[right[0]] ?? 0;
      const leftReadingWeight = Number(doctrinalMetadataById[left[0]]?.reading_weight ?? 0);
      const rightReadingWeight = Number(doctrinalMetadataById[right[0]]?.reading_weight ?? 0);
      const leftDate = parseDateToTs(pickText(metadataById[left[0]]?.fecha) || (left[0] === cluster.representative_dictamen.id ? cluster.representative_dictamen.fecha : '')) ?? 0;
      const rightDate = parseDateToTs(pickText(metadataById[right[0]]?.fecha) || (right[0] === cluster.representative_dictamen.id ? cluster.representative_dictamen.fecha : '')) ?? 0;
      return (
        roleOrder[left[1]] - roleOrder[right[1]]
        || rightReadingWeight - leftReadingWeight
        || rightPriority - leftPriority
        || rightDate - leftDate
        || left[0].localeCompare(right[0])
      );
    })
    .slice(0, 5)
    .map(([id, rol_en_linea]) => {
    const metadata = metadataById[id] ?? {};
    const isRepresentative = id === cluster.representative_dictamen.id;
    return {
      id,
      titulo: isRepresentative
        ? cluster.representative_dictamen.titulo
        : pickText(metadata.titulo) || pickText(metadata.Resumen ?? metadata.resumen) || cluster.cluster_label,
      fecha: isRepresentative
        ? cluster.representative_dictamen.fecha
        : pickText(metadata.fecha),
      rol_en_linea
    };
  });
}

function buildUserFacingSummary(params: {
  materia: string;
  clusterLabel: string;
  topFuentesLegales: Array<{ tipo_norma: string; numero: string | null; count: number }>;
  topAccionesJuridicas: string[];
  from: string | null;
  to: string | null;
}): string {
  const fuente = params.topFuentesLegales[0] ? formatFuenteLegal(params.topFuentesLegales[0]) : null;
  const accion = params.topAccionesJuridicas[0] ?? null;
  const from = formatSimpleDate(params.from);
  const to = formatSimpleDate(params.to);
  const periodo = from && to ? `entre ${from} y ${to}` : 'en el período consultado';

  if (fuente && accion) {
    return `Línea doctrinal en ${params.materia} centrada en ${params.clusterLabel}, con referencias reiteradas a ${fuente} y predominio de dictámenes ${accion} ${periodo}.`;
  }

  if (fuente) {
    return `Línea doctrinal en ${params.materia} centrada en ${params.clusterLabel}, apoyada de forma reiterada en ${fuente} ${periodo}.`;
  }

  if (accion) {
    return `Línea doctrinal en ${params.materia} centrada en ${params.clusterLabel}, con énfasis en dictámenes ${accion} ${periodo}.`;
  }

  return `Línea doctrinal en ${params.materia} centrada en ${params.clusterLabel} ${periodo}.`;
}

function buildQueryMatchExplanation(params: {
  query: string;
  materia: string | null;
  clusterLabel: string;
  topDescriptoresAI: string[];
  topFuentesLegales: Array<{ tipo_norma: string; numero: string | null; count: number }>;
  representativeMatched: boolean;
  coreOverlapCount: number;
  supportOverlapCount: number;
  querySubtopicLabel?: string | null;
  subtopicBoost?: number;
}) {
  const queryTokens = tokenizeSearchText(params.query);
  const matchedDescriptors = params.topDescriptoresAI.filter((descriptor) => {
    const normalized = normalizeSearchText(descriptor);
    return queryTokens.some((token) => normalized.includes(token));
  }).slice(0, 2);

  const signals: string[] = [];
  if (matchedDescriptors.length > 0) {
    signals.push(`descriptores coincidentes: ${matchedDescriptors.join(', ')}`);
  }
  if (params.representativeMatched || params.coreOverlapCount > 0) {
    signals.push('presencia del núcleo doctrinal entre los resultados cercanos');
  } else if (params.supportOverlapCount > 0) {
    signals.push('dictámenes de apoyo relevantes entre los resultados cercanos');
  }

  const topFuente = params.topFuentesLegales[0] ? formatFuenteLegal(params.topFuentesLegales[0]) : null;
  if (topFuente) {
    signals.push(`referencias reiteradas a ${topFuente}`);
  }
  if ((params.subtopicBoost ?? 0) >= 0.35 && params.querySubtopicLabel) {
    signals.push(`subtema jurídico visible: ${params.querySubtopicLabel}`);
  }

  let reason: string;
  if ((params.subtopicBoost ?? 0) >= 0.45 && params.querySubtopicLabel) {
    reason = `Esta línea aparece porque se acerca al subtema ${params.querySubtopicLabel} dentro de ${params.materia ?? 'la materia consultada'}.`;
  } else if (matchedDescriptors.length > 0) {
    reason = `Esta línea aparece porque concentra dictámenes sobre ${matchedDescriptors.join(' y ')} dentro de ${params.materia ?? 'la materia consultada'}.`;
  } else if (params.representativeMatched || params.coreOverlapCount > 0) {
    reason = `Esta línea se prioriza porque la consulta coincide con el núcleo doctrinal del cluster en ${params.materia ?? 'la materia consultada'}.`;
  } else if (topFuente) {
    reason = `Esta línea aparece por su cercanía semántica con la consulta y por la reiteración de ${topFuente}.`;
  } else {
    reason = `Esta línea aparece por su cercanía semántica con la consulta dentro de ${params.materia ?? 'la materia consultada'}.`;
  }

  return {
    query_match_reason: reason,
    query_match_signals: signals
  };
}

function buildClusterLexicalProfileText(params: {
  cluster: Awaited<ReturnType<typeof buildDoctrineClusters>>['clusters'][number];
  metadataById: Record<string, Record<string, unknown>>;
}) {
  const candidateIds = [
    params.cluster.representative_dictamen.id,
    ...params.cluster.core_doctrine_candidates.map((candidate) => candidate.id),
    ...params.cluster.supporting_dictamen_ids.slice(0, 6)
  ];

  return compactDisplayText([
    params.cluster.cluster_label,
    ...params.cluster.top_descriptores_AI,
    ...params.cluster.top_fuentes_legales.map((fuente) => formatFuenteLegal(fuente)),
    ...[...new Set(candidateIds)].flatMap((id) => {
      const metadata = params.metadataById[id] ?? {};
      return [
        pickText(metadata.titulo),
        pickText(metadata.Resumen ?? metadata.resumen),
        pickText(metadata.analisis)
      ];
    })
  ].filter(Boolean).join(' '));
}

function buildDirectSemanticLine(params: {
  query: string;
  topHitId: string;
  topHitInfo: SearchMatchInfo;
  secondHitInfo: SearchMatchInfo | undefined;
  queryIntent: ReturnType<typeof detectQueryIntent>;
}) {
  const metadata = (params.topHitInfo.metadata ?? {}) as SearchMetadataLike;
  const title = cleanOverviewLabel(
    Array.isArray(metadata.descriptores_AI) ? String(metadata.descriptores_AI[0] ?? '') : null,
    pickText(metadata.titulo) || pickText(metadata.materia)
  ) ?? 'Lectura directa';
  const resumen = pickText(metadata.Resumen ?? metadata.resumen);
  const materia = pickText(metadata.materia);
  const fecha = pickText(metadata.fecha) || null;
  const topScore = params.topHitInfo.rawScore;
  const secondScore = params.secondHitInfo?.rawScore ?? 0;
  const queryTokens = tokenizeSearchText(params.query);
  const overlapText = normalizeSearchText([
    materia,
    pickText(metadata.titulo),
    resumen,
    pickText(metadata.analisis),
    ...(Array.isArray(metadata.descriptores_AI) ? metadata.descriptores_AI.map(String) : [])
  ].join(' '));
  const tokenOverlap = queryTokens.filter((token) => overlapText.includes(token)).length;
  const scoreGap = topScore - secondScore;
  const isStrongDirectHit = params.topHitInfo.normalizedScore >= 0.9 && (
    scoreGap >= 0.04
    || tokenOverlap >= 2
  );

  if (!isStrongDirectHit) return null;

  return {
    title,
    importance_level: metadata.relevante ? 'high' as const : 'medium' as const,
    change_risk_level: 'medium' as const,
    summary: resumen
      ? `Lectura directa priorizada por coincidencia semántica fuerte con la consulta. ${resumen}`
      : 'Lectura directa priorizada por coincidencia semántica fuerte con la consulta.',
    doctrinal_state: 'en_evolucion' as const,
    doctrinal_state_reason: 'Se prioriza este dictamen porque formula de manera directa el problema jurídico consultado, aunque todavía no organice por sí solo una línea doctrinal amplia.',
    graph_doctrinal_status: {
      status: 'criterio_estable' as const,
      summary: 'Esta entrada se muestra como foco semántico directo antes de la organización doctrinal más amplia.',
      relation_inventory: {
        fortalece: 0,
        desarrolla: 0,
        ajusta: 0,
        limita: 0,
        desplaza: 0
      },
      recent_destabilizing_count: 0
    },
    reading_priority_reason: 'Conviene leer primero este dictamen porque coincide de forma directa con los términos jurídicos centrales de su consulta.',
    pivot_dictamen: null,
    relation_dynamics: {
      consolida: 0,
      desarrolla: 0,
      ajusta: 0,
      dominant_bucket: null,
      summary: 'Esta entrada funciona como acceso directo al dictamen más cercano antes de abrir la estructura doctrinal relacionada.'
    },
    coherence_signals: {
      cluster_cohesion_score: 1,
      semantic_dispersion: 0,
      outlier_probability: 0,
      descriptor_noise_score: 0,
      fragmentation_risk: 0.05,
      coherence_status: 'cohesiva' as const,
      summary: 'La coincidencia semántica directa con la consulta justifica mostrar este dictamen como foco inicial de lectura.'
    },
    representative_dictamen_id: params.topHitId,
    core_dictamen_ids: [params.topHitId],
    key_dictamenes: [
      {
        id: params.topHitId,
        titulo: pickText(metadata.titulo) || title,
        fecha,
        rol_en_linea: 'representativo' as const
      }
    ],
    top_fuentes_legales: [],
    top_descriptores_AI: Array.isArray(metadata.descriptores_AI) ? metadata.descriptores_AI.map(String).slice(0, 5) : [],
    time_span: {
      from: fecha,
      to: fecha
    },
    technical: {
      representative_score: 1,
      cluster_density_score: 0.4,
      doctrinal_importance_score: metadata.relevante ? 0.72 : 0.58,
      doctrinal_change_risk_score: 0.45,
      active_doctrinal_signal_score: 0.18,
      temporal_spread_years: 0,
      influential_dictamen_ids: [params.topHitId],
      query_match_signals: [
        `coincidencia semántica directa con la consulta`,
        ...(params.queryIntent ? [`intent detectado: ${params.queryIntent.intent_label}`] : []),
        ...(tokenOverlap > 0 ? [`términos coincidentes visibles: ${tokenOverlap}`] : [])
      ]
    },
    query_match_reason: `Este dictamen se muestra primero porque coincide de forma directa con la consulta formulada y no quedaba bien representado en las líneas doctrinales amplias.`,
    semantic_anchor_dictamen: {
      id: params.topHitId,
      titulo: pickText(metadata.titulo) || title,
      fecha,
      score: roundMatchScore(topScore),
      reason: 'Es el dictamen con coincidencia semántica más directa para esta consulta.'
    }
  };
}

type BuildDoctrineLinesOptions = {
  materia?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  limit?: number;
};

async function buildMetadataById(
  env: Env,
  clusters: Awaited<ReturnType<typeof buildDoctrineClusters>>['clusters']
) {
  const keyIds = [...new Set(clusters.flatMap((cluster) => [
    cluster.representative_dictamen.id,
    ...cluster.core_doctrine_candidates.map((candidate) => candidate.id),
    ...cluster.influential_dictamen_ids,
    ...cluster.supporting_dictamen_ids
  ]))];
  const records = keyIds.length > 0 ? await fetchRecords(env, keyIds) : { vectors: {} as Record<string, { metadata?: Record<string, unknown> }> };
  const metadataById = Object.fromEntries(
    Object.entries(records.vectors ?? {}).map(([id, value]) => [id, (value?.metadata ?? {}) as Record<string, unknown>])
  );
  const doctrinalMetadataById = await loadDoctrinalMetadataByIds(env, keyIds);
  return {
    metadataById,
    doctrinalMetadataById
  };
}

function buildDoctrineLinesResponse(
  clusterResponse: Awaited<ReturnType<typeof buildDoctrineClusters>>,
  metadataById: Record<string, Record<string, unknown>>,
  doctrinalMetadataById: DoctrinalMetadataMap
) {
  const dominantTheme = cleanOverviewLabel(
    clusterResponse.clusters[0]?.cluster_label ?? null,
    clusterResponse.clusters[0]?.top_descriptores_AI?.[0] ?? null
  );
  const periodCovered = clusterResponse.clusters.length > 0
    ? {
        from: clusterResponse.clusters
          .map((cluster) => cluster.time_span.from)
          .filter((value): value is string => Boolean(value))
          .sort()[0] ?? null,
        to: clusterResponse.clusters
          .map((cluster) => cluster.time_span.to)
          .filter((value): value is string => Boolean(value))
          .sort()
          .slice(-1)[0] ?? null
      }
    : { from: null, to: null };

  return {
    overview: {
      totalLines: clusterResponse.clusters.length,
      dominantTheme,
      periodCovered,
      materiaEvaluated: cleanOverviewLabel(
        clusterResponse.materia,
        clusterResponse.clusters[0]?.top_descriptores_AI?.[0] ?? null
      )
    },
    lines: clusterResponse.clusters.map((cluster) => ({
      title: cluster.cluster_label,
      importance_level: toLevel(cluster.doctrinal_importance_score),
      change_risk_level: toLevel(cluster.doctrinal_change_risk_score),
      summary: buildUserFacingSummary({
        materia: clusterResponse.materia ?? 'Sin materia',
        clusterLabel: cluster.cluster_label,
        topFuentesLegales: cluster.top_fuentes_legales,
        topAccionesJuridicas: cluster.top_acciones_juridicas,
        from: cluster.time_span.from,
        to: cluster.time_span.to
      }),
      doctrinal_state: cluster.doctrinal_state,
      doctrinal_state_reason: cluster.doctrinal_state_reason,
      graph_doctrinal_status: cluster.graph_doctrinal_status,
      reading_priority_reason: cluster.reading_priority_reason,
      doctrinal_metadata: doctrinalMetadataById[cluster.representative_dictamen.id]
        ? {
            rol_principal: doctrinalMetadataById[cluster.representative_dictamen.id].rol_principal,
            estado_vigencia: doctrinalMetadataById[cluster.representative_dictamen.id].estado_vigencia,
            estado_intervencion_cgr: doctrinalMetadataById[cluster.representative_dictamen.id].estado_intervencion_cgr,
            reading_role: doctrinalMetadataById[cluster.representative_dictamen.id].reading_role,
            reading_weight: Number(doctrinalMetadataById[cluster.representative_dictamen.id].reading_weight ?? 0),
            currentness_score: Number(doctrinalMetadataById[cluster.representative_dictamen.id].currentness_score ?? 0),
            confidence_global: Number(doctrinalMetadataById[cluster.representative_dictamen.id].confidence_global ?? 0)
          }
        : null,
      pivot_dictamen: cluster.pivot_dictamen
        ? {
            id: cluster.pivot_dictamen.id,
            titulo: cluster.pivot_dictamen.titulo,
            fecha: cluster.pivot_dictamen.fecha,
            signal: cluster.pivot_dictamen.signal,
            reason: cluster.pivot_dictamen.reason
          }
        : null,
      relation_dynamics: cluster.relation_dynamics,
      coherence_signals: cluster.coherence_signals,
      representative_dictamen_id: cluster.representative_dictamen.id,
      core_dictamen_ids: cluster.core_doctrine_candidates.map((candidate) => candidate.id),
      key_dictamenes: buildKeyDictamenes(cluster, metadataById, doctrinalMetadataById),
      top_fuentes_legales: cluster.top_fuentes_legales,
      top_descriptores_AI: cluster.top_descriptores_AI,
      time_span: cluster.time_span,
      technical: {
        representative_score: cluster.representative_score,
        cluster_density_score: cluster.cluster_density_score,
        doctrinal_importance_score: cluster.doctrinal_importance_score,
        doctrinal_change_risk_score: cluster.doctrinal_change_risk_score,
        active_doctrinal_signal_score: cluster.active_doctrinal_signal_score,
        temporal_spread_years: cluster.temporal_spread_years,
        influential_dictamen_ids: cluster.influential_dictamen_ids
      }
    }))
  };
}

function buildSearchMatchInfo(matches: SearchMatch[]): Map<string, SearchMatchInfo> {
  const maxScore = Math.max(...matches.map((match) => Number(match.score ?? 0)), 0.0001);
  return new Map(matches.map((match, index) => ([
    match.id,
    {
      rawScore: Number(match.score ?? 0),
      normalizedScore: roundMatchScore(Number(match.score ?? 0) / maxScore),
      rank: index,
      metadata: match.metadata
    }
  ])));
}

function roundMatchScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildRecentnessSignal(value: string | null | undefined, windowYears = 5): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 0;
  const windowMs = windowYears * 365.25 * 24 * 60 * 60 * 1000;
  const ageMs = Math.max(Date.now() - parsed, 0);
  return roundMatchScore(Math.max(0, 1 - (ageMs / windowMs)));
}

function selectBestDirectSemanticHit(params: {
  matches: SearchMatch[];
  matchInfoById: Map<string, SearchMatchInfo>;
  query: string;
  querySubtopic: ReturnType<typeof detectQuerySubtopic>;
}) {
  const ranked = params.matches
    .map((match) => {
      const info = params.matchInfoById.get(match.id);
      if (!info) return null;
      const metadata = match.metadata ?? {};
      const semanticText = [
        pickText(metadata.materia),
        pickText(metadata.titulo),
        pickText(metadata.Resumen ?? metadata.resumen),
        pickText(metadata.analisis),
        Array.isArray(metadata.descriptores_AI) ? metadata.descriptores_AI.map(String).join(' ') : ''
      ].join(' ');
      const queryCoverage = buildQueryCoverageProfile(params.query, semanticText);
      const subtopicBoost = buildSubtopicBoost({
        subtopic: params.querySubtopic,
        semanticText
      });
      const score = (
        (info.normalizedScore * 1.45)
        + (queryCoverage.coverage * 2.2)
        + (subtopicBoost * 2.8)
      );
      return {
        id: match.id,
        score
      };
    })
    .filter((entry): entry is { id: string; score: number } => entry !== null)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return ranked[0]?.id ?? params.matches[0]?.id ?? null;
}

function normalizeLineFamilyKey(value: string): string {
  return normalizeSearchText(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function buildSearchSemanticAnchor(params: {
  line: ReturnType<typeof buildDoctrineLinesResponse>['lines'][number];
  cluster: Awaited<ReturnType<typeof buildDoctrineClusters>>['clusters'][number];
  metadataById: Record<string, Record<string, unknown>>;
  doctrinalMetadataById: DoctrinalMetadataMap;
  matchInfoById: Map<string, SearchMatchInfo>;
  querySubtopic: ReturnType<typeof detectQuerySubtopic>;
}) {
  const candidateIds = [
    params.cluster.representative_dictamen.id,
    ...params.cluster.core_doctrine_candidates.map((candidate) => candidate.id),
    ...params.cluster.supporting_dictamen_ids
  ];
  const uniqueIds = [...new Set(candidateIds)];
  const ranked = uniqueIds
    .map((id) => {
      const info = params.matchInfoById.get(id);
      const metadata = params.metadataById[id] ?? {};
      const doctrinalMetadata = params.doctrinalMetadataById[id] ?? {};
      const fecha = pickText(metadata.fecha) || (id === params.cluster.representative_dictamen.id ? params.cluster.representative_dictamen.fecha : '');
      const recentness = buildRecentnessSignal(fecha, 4);
      const pivotBoost = params.cluster.pivot_dictamen?.id === id ? 0.12 : 0;
      const activeWeight = (params.cluster.active_doctrinal_signal_score * 0.45) + (params.cluster.doctrinal_change_risk_score * 0.2);
      const subtopicBoost = buildSubtopicBoost({
        subtopic: params.querySubtopic,
        semanticText: [
          pickText(metadata.titulo),
          pickText(metadata.Resumen ?? metadata.resumen),
          pickText(metadata.analisis),
          Array.isArray(metadata.descriptores_AI) ? metadata.descriptores_AI.map(String).join(' ') : ''
        ].join(' ')
      }) * 0.45;
      const readingWeight = Number(doctrinalMetadata.reading_weight ?? 0);
      const currentnessScore = Number(doctrinalMetadata.currentness_score ?? 0);
      const stateBoost = doctrinalMetadata.reading_role === 'estado_actual' ? 0.18 : 0;
      return {
        id,
        info,
        adjustedScore: info
          ? ((info.normalizedScore * 1.15) + (recentness * activeWeight) + pivotBoost + subtopicBoost + (readingWeight * 0.55) + (currentnessScore * 0.35) + stateBoost)
          : 0
      };
    })
    .filter((entry): entry is { id: string; info: SearchMatchInfo; adjustedScore: number } => Boolean(entry.info))
    .sort((left, right) => (
      right.adjustedScore - left.adjustedScore
      || right.info.rawScore - left.info.rawScore
      || left.info.rank - right.info.rank
      || left.id.localeCompare(right.id)
    ));

  const selected = ranked[0];
  if (!selected) return null;

  const isRepresentative = selected.id === params.line.representative_dictamen_id;
  const metadata = params.metadataById[selected.id] ?? {};

  return {
    id: selected.id,
    titulo: pickText(metadata.titulo) || pickText(metadata.Resumen ?? metadata.resumen) || params.line.title,
    fecha: pickText(metadata.fecha) || null,
    score: roundMatchScore(selected.info.rawScore),
    reason: isRepresentative
      ? 'Este dictamen también es el más cercano a su consulta.'
      : 'Es el dictamen más cercano a su consulta dentro de esta línea.'
  };
}

function buildHybridSearchScore(params: {
  cluster: Awaited<ReturnType<typeof buildDoctrineClusters>>['clusters'][number];
  doctrinalMetadataById: DoctrinalMetadataMap;
  matchInfoById: Map<string, SearchMatchInfo>;
  topHitId: string | null;
  intentBoost: number;
  subtopicBoost: number;
}) {
  const matchedIds = [
    params.cluster.representative_dictamen.id,
    ...params.cluster.core_doctrine_candidates.map((candidate) => candidate.id),
    ...params.cluster.supporting_dictamen_ids
  ].filter((id, index, source) => source.indexOf(id) === index && params.matchInfoById.has(id));

  if (matchedIds.length === 0) {
    return params.cluster.doctrinal_importance_score * 0.2;
  }

  const semanticScores = matchedIds
    .map((id) => params.matchInfoById.get(id)!)
    .sort((left, right) => right.normalizedScore - left.normalizedScore || left.rank - right.rank);
  const semanticPeak = semanticScores[0]?.normalizedScore ?? 0;
  const semanticCoverage = semanticScores
    .slice(0, 3)
    .reduce((acc, item) => acc + item.normalizedScore, 0);
  const representativeSemantic = params.matchInfoById.get(params.cluster.representative_dictamen.id)?.normalizedScore ?? 0;
  const juridicalPriority = params.cluster.juridical_priority_map[params.cluster.representative_dictamen.id] ?? 0;
  const representativeDoctrinal = params.doctrinalMetadataById[params.cluster.representative_dictamen.id] ?? {};
  const topHitBoost = params.topHitId && matchedIds.includes(params.topHitId) ? 2.4 : 0;
  const currentnessBoost = (
    (params.cluster.graph_doctrinal_status.status === 'criterio_en_revision' ? 0.2 : 0)
    + (params.cluster.graph_doctrinal_status.status === 'criterio_tensionado' ? 0.12 : 0)
    + (params.cluster.active_doctrinal_signal_score * 0.4)
    + (Number(representativeDoctrinal.currentness_score ?? 0) * 0.45)
  );

  return (
    (semanticPeak * 4.2)
    + (representativeSemantic * 1.6)
    + (semanticCoverage * 1.25)
    + topHitBoost
    + params.intentBoost
    + params.subtopicBoost
    + (juridicalPriority * 0.55)
    + (params.cluster.doctrinal_importance_score * 0.25)
    + currentnessBoost
    + (params.cluster.doctrinal_change_risk_score * 0.3)
    + (Number(representativeDoctrinal.reading_weight ?? 0) * 0.7)
    + (Number(representativeDoctrinal.doctrinal_centrality_score ?? 0) * 0.55)
  );
}

function promoteSemanticAnchor(params: {
  line: ReturnType<typeof buildDoctrineLinesResponse>['lines'][number] & {
    query_match_reason?: string;
    semantic_anchor_dictamen?: {
      id: string;
      titulo: string;
      fecha: string | null;
      score: number;
      reason: string;
    } | null;
  };
  anchor: NonNullable<ReturnType<typeof buildSearchSemanticAnchor>>;
  metadataById: Record<string, Record<string, unknown>>;
  matchInfoById: Map<string, SearchMatchInfo>;
}) {
  const representativeSemantic = params.matchInfoById.get(params.line.representative_dictamen_id)?.normalizedScore ?? 0;
  const anchorSemantic = params.matchInfoById.get(params.anchor.id)?.normalizedScore ?? 0;
  const representativeItem = params.line.key_dictamenes.find((item) => item.id === params.line.representative_dictamen_id);
  const representativeRecentness = buildRecentnessSignal(representativeItem?.fecha ?? null, 4);
  const anchorRecentness = buildRecentnessSignal(params.anchor.fecha, 4);
  const activeSignal = params.line.technical?.active_doctrinal_signal_score ?? 0;
  const shouldPromote = params.anchor.id !== params.line.representative_dictamen_id
    && params.matchInfoById.get(params.anchor.id)?.normalizedScore !== undefined
    && (
      anchorSemantic >= 0.9
      || (anchorSemantic - representativeSemantic) >= 0.18
      || (
        activeSignal >= 0.55
        && (anchorRecentness - representativeRecentness) >= 0.22
        && (anchorSemantic - representativeSemantic) >= -0.04
      )
    );

  const keyDictamenMap = new Map(
    params.line.key_dictamenes.map((item) => [item.id, { ...item }])
  );

  if (shouldPromote) {
    const previousRepresentative = keyDictamenMap.get(params.line.representative_dictamen_id);
    if (previousRepresentative) {
      previousRepresentative.rol_en_linea = previousRepresentative.rol_en_linea === 'representativo'
        ? 'núcleo doctrinal'
        : previousRepresentative.rol_en_linea;
      keyDictamenMap.set(previousRepresentative.id, previousRepresentative);
    }

    keyDictamenMap.set(params.anchor.id, {
      id: params.anchor.id,
      titulo: params.anchor.titulo,
      fecha: params.anchor.fecha ?? '',
      rol_en_linea: 'representativo'
    });

    const promotedKeyDictamenes = [
      keyDictamenMap.get(params.anchor.id)!,
      ...[...keyDictamenMap.values()].filter((item) => item.id !== params.anchor.id)
    ].slice(0, 6);

    return {
      ...params.line,
      representative_dictamen_id: params.anchor.id,
      key_dictamenes: promotedKeyDictamenes,
      query_match_reason: `${params.line.query_match_reason ?? 'Esta línea se prioriza por cercanía semántica.'} El dictamen más cercano a su consulta es ${params.anchor.id}.`,
      semantic_anchor_dictamen: params.anchor
    };
  }

  return {
    ...params.line,
    semantic_anchor_dictamen: params.anchor
  };
}

async function buildDoctrineLines(env: Env, options: BuildDoctrineLinesOptions) {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);
  const clusterResponse = await buildDoctrineClusters(env, {
    materia: options.materia ?? null,
    fromDate: options.fromDate ?? null,
    toDate: options.toDate ?? null,
    limit,
    topK: 8
  });
  const { metadataById, doctrinalMetadataById } = await buildMetadataById(env, clusterResponse.clusters);
  return applyDoctrineStructureRemediations(env, buildDoctrineLinesResponse(clusterResponse, metadataById, doctrinalMetadataById));
}

type BuildDoctrineSearchOptions = {
  q: string;
  limit?: number;
};

type LexicalDoctrineSearchRow = {
  id: string;
  materia: string;
  fecha_documento: string | null;
  criterio: string | null;
  titulo: string | null;
  resumen: string | null;
  analisis: string | null;
};

function isPineconeQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Pinecone search error: 429') || message.includes('RESOURCE_EXHAUSTED');
}

async function searchDoctrineLexically(env: Env, q: string, limit: number) {
  const tokens = tokenizeSearchText(q).slice(0, 6);
  if (tokens.length === 0) return [] as Array<{ id: string; materia: string; score: number }>;

  const rows = await env.DB.prepare(
    `SELECT
       d.id,
       COALESCE(NULLIF(TRIM(d.materia), ''), 'Sin materia') AS materia,
       COALESCE(d.fecha_documento, d.created_at) AS fecha_documento,
       d.criterio,
       e.titulo
     FROM dictamenes d
     LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
     WHERE d.estado IN ('enriched_pending_vectorization', 'vectorized')
     ORDER BY COALESCE(d.fecha_documento, d.created_at) DESC
     LIMIT ?`
  ).bind(Math.min(limit * 20, 120)).all<LexicalDoctrineSearchRow>();

  const candidates = (rows.results ?? [])
    .map((row) => {
      const haystack = normalizeSearchText([
        row.materia,
        row.criterio ?? '',
        row.titulo ?? ''
      ].join(' '));
      const tokenMatches = tokens.reduce((acc, token) => acc + (haystack.includes(token) ? 1 : 0), 0);
      const recencyBoost = buildRecentnessSignal(row.fecha_documento, 4) * 0.35;
      const score = roundMatchScore(tokenMatches + recencyBoost);
      return {
        ...row,
        preliminaryScore: score
      };
    })
    .filter((entry) => entry.preliminaryScore > 0)
    .sort((a, b) => b.preliminaryScore - a.preliminaryScore)
    .slice(0, Math.min(limit * 10, 40));

  if (candidates.length === 0) return [];

  // Etapa 2: Re-scoring con hidratación de resúmenes y análisis
  const candidateIds = candidates.map((c) => c.id);
  const placeholders = candidateIds.map(() => '?').join(',');
  const enrichedRows = await env.DB.prepare(
    `SELECT dictamen_id, resumen, analisis FROM enriquecimiento WHERE dictamen_id IN (${placeholders})`
  ).bind(...candidateIds).all<{ dictamen_id: string; resumen: string | null; analisis: string | null }>();

  const enrichedMap = new Map(
    (enrichedRows.results ?? []).map((row) => [row.dictamen_id, row])
  );

  const shortlisted = candidates
    .map((candidate) => {
      const enrichment = enrichedMap.get(candidate.id);
      const haystack = normalizeSearchText([
        candidate.materia,
        candidate.criterio ?? '',
        candidate.titulo ?? '',
        enrichment?.resumen ?? '',
        enrichment?.analisis ?? ''
      ].join(' '));
      const tokenMatches = tokens.reduce((acc, token) => acc + (haystack.includes(token) ? 1 : 0), 0);
      const recencyBoost = buildRecentnessSignal(candidate.fecha_documento, 4) * 0.35;
      const score = roundMatchScore(tokenMatches + recencyBoost);
      return {
        id: candidate.id,
        materia: candidate.materia,
        score
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.materia.localeCompare(b.materia) || a.id.localeCompare(b.id))
    .slice(0, Math.min(limit * 8, 30));

  const metadataRecords = await fetchRecords(env, shortlisted.map((row) => row.id));
  return shortlisted.map((row) => ({
    ...row,
    materia: pickText(metadataRecords.vectors?.[row.id]?.metadata?.materia) || row.materia
  }));
}

function mergeSearchMatches(params: {
  semanticMatches: SearchMatch[];
  lexicalMatches: LexicalDoctrineSearchMatch[];
}) {
  const merged = new Map<string, SearchMatch>();
  const maxSemanticScore = Math.max(...params.semanticMatches.map((match) => Number(match.score ?? 0)), 0.0001);
  const maxLexicalScore = Math.max(...params.lexicalMatches.map((match) => match.score), 0.0001);

  for (const match of params.semanticMatches) {
    const semanticScore = clamp01(Number(match.score ?? 0) / maxSemanticScore);
    merged.set(match.id, {
      id: match.id,
      score: roundMatchScore((semanticScore * 1.15) + 0.25),
      metadata: match.metadata
    });
  }

  for (const lexical of params.lexicalMatches) {
    const lexicalScore = clamp01(lexical.score / maxLexicalScore);
    const existing = merged.get(lexical.id);
    if (existing) {
      merged.set(lexical.id, {
        id: lexical.id,
        score: roundMatchScore(Number(existing.score ?? 0) + (lexicalScore * 0.85)),
        metadata: {
          ...(existing.metadata ?? {}),
          materia: existing.metadata?.materia ?? lexical.materia
        }
      });
      continue;
    }

    merged.set(lexical.id, {
      id: lexical.id,
      score: roundMatchScore((lexicalScore * 0.95) + 0.08),
      metadata: {
        materia: lexical.materia
      }
    });
  }

  return [...merged.values()]
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0) || a.id.localeCompare(b.id));
}

async function buildDoctrineSearchFromMatches(
  env: Env,
  matches: SearchMatch[],
  limit: number,
  rankingSignals?: {
    query: string;
    queryIntent: ReturnType<typeof detectQueryIntent>;
    querySubtopic: ReturnType<typeof detectQuerySubtopic>;
  }
) {
  const hitIds = [...new Set(matches.map((match) => match.id))];
  const hitIdsSet = new Set(hitIds);
  const matchInfoById = buildSearchMatchInfo(matches);
  const candidateScores = Object.fromEntries(
    [...matchInfoById.entries()].map(([id, info]) => [id, info.normalizedScore])
  );
  const topHitId = matches[0]?.id ?? null;
  const queryCentricResponse = await buildDoctrineClusters(env, {
    candidateIds: matches.map((match) => match.id),
    limit,
    topK: Math.min(Math.max(matches.length, 5), 12),
    queryContext: rankingSignals ? {
      query: rankingSignals.query,
      intent: rankingSignals.queryIntent,
      subtopic: rankingSignals.querySubtopic,
      candidateScores
    } : null
  });
  const materiaById = new Map<string, string>();

  if (hitIds.length > 0) {
    const placeholders = hitIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT id, COALESCE(NULLIF(TRIM(materia), ''), 'Sin materia') AS materia
       FROM dictamenes
       WHERE id IN (${placeholders})`
    ).bind(...hitIds).all<{ id: string; materia: string }>();

    for (const row of rows.results ?? []) {
      materiaById.set(row.id, row.materia);
    }
  }

  const materiaScores = new Map<string, number>();
  for (const [index, match] of matches.entries()) {
    const materia = materiaById.get(match.id) || pickText(match.metadata?.materia) || 'Sin materia';
    const rankWeight = index === 0 ? 1.6 : Math.max(0.45, 1.15 - (index * 0.08));
    materiaScores.set(materia, (materiaScores.get(materia) ?? 0) + (Number(match.score ?? 0) * rankWeight));
  }

  const topMaterias = [...materiaScores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([materia]) => materia);

  const clusterResponses = await Promise.all(
    topMaterias.map((materia) => buildDoctrineClusters(env, {
      materia,
      limit,
      topK: 8,
      queryContext: rankingSignals ? {
        query: rankingSignals.query,
        intent: rankingSignals.queryIntent,
        subtopic: rankingSignals.querySubtopic,
        candidateScores
      } : null
    }))
  );

  const allClusters = [
    ...queryCentricResponse.clusters.map((cluster) => ({
      materia: queryCentricResponse.materia ?? cluster.representative_dictamen.materia ?? null,
      cluster,
      source: 'query' as const
    })),
    ...clusterResponses.flatMap((response) => response.clusters.map((cluster) => ({
      materia: response.materia ?? cluster.representative_dictamen.materia ?? null,
      cluster,
      source: 'materia' as const
    })))
  ];

  const uniqueClusters = new Map<string, (typeof allClusters)[number]>();
  for (const entry of allClusters) {
    const key = [
      entry.cluster.representative_dictamen.id,
      entry.cluster.cluster_label,
      entry.materia ?? ''
    ].join('::');
    if (!uniqueClusters.has(key)) {
      uniqueClusters.set(key, entry);
    }
  }

  const topHitMateria = topHitId
    ? (materiaById.get(topHitId) || pickText(matches[0]?.metadata?.materia) || null)
    : null;

  const scoredClusters = [...uniqueClusters.values()].map(({ materia, cluster, source }) => {
    const matchedIds = [
      cluster.representative_dictamen.id,
      ...cluster.core_doctrine_candidates.map((candidate) => candidate.id),
      ...cluster.supporting_dictamen_ids
    ].filter((id, index, sourceIds) => sourceIds.indexOf(id) === index && hitIdsSet.has(id));

    const semanticMatchScore = matchedIds.reduce((acc, id) => {
      const info = matchInfoById.get(id);
      if (!info) return acc;

      const roleWeight = id === cluster.representative_dictamen.id
        ? 1.9
        : cluster.core_doctrine_candidates.some((candidate) => candidate.id === id)
          ? 1.35
          : 0.8;
      return acc + (info.normalizedScore * roleWeight);
    }, 0);

    const semanticPeak = matchedIds.reduce((acc, id) => {
      const value = matchInfoById.get(id)?.normalizedScore ?? 0;
      return Math.max(acc, value);
    }, 0);
    const representativeOverlap = hitIdsSet.has(cluster.representative_dictamen.id) ? 1 : 0;
    const matterLabel = materia ?? cluster.representative_dictamen.materia ?? null;
    const matterAffinity = matterLabel ? (materiaScores.get(matterLabel) ?? 0) : 0;
    const topHitMatterBoost = topHitMateria && matterLabel === topHitMateria ? 1.3 : 0;
    const topHitBoost = topHitId && matchedIds.includes(topHitId) ? 2.6 : 0;
    const sourceBoost = source === 'materia' ? 0.25 : 0;
    const intentClusterBoost = buildIntentBoost({
      intent: rankingSignals?.queryIntent ?? null,
      clusterLabel: cluster.cluster_label,
      materia: matterLabel,
      topDescriptors: cluster.top_descriptores_AI
    });
    const subtopicClusterBoost = buildSubtopicBoost({
      subtopic: rankingSignals?.querySubtopic ?? null,
      semanticText: [
        matterLabel ?? '',
        cluster.cluster_label,
        cluster.representative_dictamen.titulo,
        cluster.representative_dictamen.resumen,
        ...cluster.top_descriptores_AI
      ].join(' ')
    });
    const queryCoverage = rankingSignals
      ? buildQueryCoverageProfile(
          rankingSignals.query,
          [
            matterLabel ?? '',
            cluster.cluster_label,
            cluster.representative_dictamen.titulo,
            cluster.representative_dictamen.resumen,
            ...cluster.top_descriptores_AI
          ].join(' ')
        )
      : { matchedTokens: [], coverage: 0 };
    const lowCoveragePenalty = rankingSignals
      && queryCoverage.matchedTokens.length <= 1
      && tokenizeSearchText(rankingSignals.query).length >= 3
      ? 2.4
      : 0;
    const lexicalMismatchPenalty = (
      (rankingSignals?.querySubtopic && subtopicClusterBoost === 0 && topHitBoost === 0 ? 1.15 : 0)
      + lowCoveragePenalty
    );
    const totalScore = (semanticMatchScore * 2.1)
      + (semanticPeak * 1.8)
      + (representativeOverlap * 0.8)
      + topHitBoost
      + topHitMatterBoost
      + (matterAffinity * 0.35)
      + sourceBoost
      + (queryCoverage.coverage * 3.4)
      + (intentClusterBoost * 3.2)
      + (subtopicClusterBoost * 4.6)
      + cluster.doctrinal_importance_score
      + (cluster.active_doctrinal_signal_score * 0.75)
      + (cluster.graph_doctrinal_status.status === 'criterio_en_revision' ? 0.35 : 0)
      + (cluster.graph_doctrinal_status.status === 'criterio_tensionado' ? 0.2 : 0)
      - lexicalMismatchPenalty;
    return {
      materia: matterLabel,
      cluster,
      totalScore,
      queryCoverage,
      subtopicClusterBoost,
      semanticPeak
    };
  }).sort((a, b) => (
    b.totalScore - a.totalScore
    || b.cluster.doctrinal_importance_score - a.cluster.doctrinal_importance_score
    || a.cluster.cluster_label.localeCompare(b.cluster.cluster_label)
  ));

  const queryTokenCount = rankingSignals ? tokenizeSearchText(rankingSignals.query).length : 0;
  const coverageQualifiedClusters = queryTokenCount >= 3
    ? scoredClusters.filter((entry) => (
        entry.queryCoverage.matchedTokens.length >= 2
        || entry.subtopicClusterBoost >= 0.3
        || entry.semanticPeak >= 0.92
      ))
    : scoredClusters;
  const visibleClusters = (coverageQualifiedClusters.length > 0 ? coverageQualifiedClusters : scoredClusters).slice(0, limit);

  return {
    hitIds: hitIdsSet,
    selectedClusterResponse: {
      materia: visibleClusters[0]?.materia ?? topHitMateria ?? topMaterias[0] ?? null,
      clusters: visibleClusters.map((entry) => entry.cluster),
      stats: {
        total_dictamenes_considerados: matches.length,
        total_clusters_generados: visibleClusters.length
      }
    }
  };
}

async function buildDoctrineSearch(env: Env, options: BuildDoctrineSearchOptions) {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);
  const q = options.q.trim();
  const searchLimit = Math.min(Math.max(limit * 8, 12), 30);
  let matches: SearchMatch[] = [];
  let documentaryMatches: SearchMatch[] = [];
  let searchMode: "semantic" | "lexical_fallback" = "semantic";
  let rewrittenQuery: string | null = null;
  let rewriteAccepted = false;
  let queryIntent = null as ReturnType<typeof detectQueryIntent>;
  let querySubtopic = null as ReturnType<typeof detectQuerySubtopic>;
  let cachedLexicalMatches: LexicalDoctrineSearchMatch[] | null = null;

  try {
    const search = await retrieveDoctrineMatchesWithQueryUnderstanding(env, q, searchLimit);
    documentaryMatches = search.matches;
    matches = search.matches;
    rewrittenQuery = search.rewrite.rewrittenQuery;
    rewriteAccepted = search.rewrite.accepted;

    const lexicalMatches = await searchDoctrineLexically(env, q, limit);
    cachedLexicalMatches = lexicalMatches;
    matches = mergeSearchMatches({
      semanticMatches: matches,
      lexicalMatches
    }).slice(0, searchLimit);
  } catch (error) {
    if (!isPineconeQuotaError(error)) throw error;

    const lexicalMatches = cachedLexicalMatches ?? await searchDoctrineLexically(env, q, limit);
    matches = lexicalMatches.map((row) => ({
      id: row.id,
      score: row.score,
      metadata: {
        materia: row.materia
      }
    }));
    searchMode = "lexical_fallback";
  }

  if (matches.length === 0) {
    return {
      overview: {
        totalLines: 0,
        dominantTheme: null,
        periodCovered: { from: null, to: null },
        materiaEvaluated: null,
        query: q,
        query_interpreted: null,
        query_intent: null,
        searchMode
      },
      lines: []
    };
  }

  const matchInfoById = buildSearchMatchInfo(matches);
  const documentaryMatchInfoById = buildSearchMatchInfo(documentaryMatches);
  const topHitId = matches[0]?.id ?? null;
  const documentaryTopIds = documentaryMatches.slice(0, 4).map((match) => match.id);
  queryIntent = detectQueryIntent({
    query: q,
    rewrittenQuery: rewriteAccepted ? rewrittenQuery : null,
    matches
  });
  querySubtopic = detectQuerySubtopic({
    query: q,
    rewrittenQuery: rewriteAccepted ? rewrittenQuery : null,
    intent: queryIntent,
    matches
  });
  const preferSemanticClustering = documentaryMatches.length > 0 && (querySubtopic?.confidence ?? 0) >= 0.72;
  const clusteringMatches = preferSemanticClustering ? documentaryMatches : matches;
  let { hitIds, selectedClusterResponse } = await buildDoctrineSearchFromMatches(env, clusteringMatches, limit, {
    query: q,
    queryIntent,
    querySubtopic
  });
  if (selectedClusterResponse.clusters.length === 0 && searchMode === "semantic") {
    const lexicalMatches = cachedLexicalMatches ?? await searchDoctrineLexically(env, q, limit);
    matches = lexicalMatches.map((row) => ({
      id: row.id,
      score: row.score,
      metadata: {
        materia: row.materia
      }
    }));
    searchMode = "lexical_fallback";
    queryIntent = detectQueryIntent({
      query: q,
      rewrittenQuery: rewriteAccepted ? rewrittenQuery : null,
      matches
    });
    querySubtopic = detectQuerySubtopic({
      query: q,
      rewrittenQuery: rewriteAccepted ? rewrittenQuery : null,
      intent: queryIntent,
      matches
    });
    ({ hitIds, selectedClusterResponse } = await buildDoctrineSearchFromMatches(env, matches, limit, {
      query: q,
      queryIntent,
      querySubtopic
    }));
  }
  const { metadataById, doctrinalMetadataById } = await buildMetadataById(env, selectedClusterResponse.clusters);
  queryIntent = detectQueryIntent({
    query: q,
    rewrittenQuery: rewriteAccepted ? rewrittenQuery : null,
    matches,
    clusters: selectedClusterResponse.clusters.map((cluster) => ({
      cluster_label: cluster.cluster_label,
      top_descriptores_AI: cluster.top_descriptores_AI
    }))
  });
  querySubtopic = detectQuerySubtopic({
    query: q,
    rewrittenQuery: rewriteAccepted ? rewrittenQuery : null,
    intent: queryIntent,
    matches,
    clusters: selectedClusterResponse.clusters.map((cluster) => ({
      cluster_label: cluster.cluster_label,
      top_descriptores_AI: cluster.top_descriptores_AI
    }))
  });
  const documentaryDirectHitId = selectBestDirectSemanticHit({
    matches: documentaryMatches,
    matchInfoById: documentaryMatchInfoById,
    query: q,
    querySubtopic
  });
  const documentaryDirectHitIndex = documentaryMatches.findIndex((match) => match.id === documentaryDirectHitId);
  const documentarySecondHitId = documentaryDirectHitIndex >= 0
    ? documentaryMatches.find((_, index) => index !== documentaryDirectHitIndex)?.id ?? null
    : documentaryMatches[1]?.id ?? null;
  const baseResponse = buildDoctrineLinesResponse(selectedClusterResponse, metadataById, doctrinalMetadataById);

  const enrichedLines = baseResponse.lines.map((line, index) => {
    const cluster = selectedClusterResponse.clusters[index];
    const clusterProfileText = buildClusterLexicalProfileText({ cluster, metadataById });
    const queryCoverage = buildQueryCoverageProfile(q, clusterProfileText);
    const subtopicBoost = buildSubtopicBoost({
      subtopic: querySubtopic,
      semanticText: clusterProfileText
    });
    const documentaryMatchedIds = [
      cluster.representative_dictamen.id,
      ...cluster.core_doctrine_candidates.map((candidate) => candidate.id),
      ...cluster.supporting_dictamen_ids
    ].filter((id, position, source) => source.indexOf(id) === position && documentaryMatchInfoById.has(id));
    const documentaryTopOverlapCount = documentaryMatchedIds.filter((id) => documentaryTopIds.includes(id)).length;
    const documentaryEvidenceScore = documentaryMatchedIds
      .map((id) => {
        const info = documentaryMatchInfoById.get(id);
        if (!info) return 0;
        const roleWeight = id === cluster.representative_dictamen.id
          ? 1.35
          : cluster.core_doctrine_candidates.some((candidate) => candidate.id === id)
            ? 1.1
            : 0.8;
        return info.normalizedScore * roleWeight;
      })
      .sort((left, right) => right - left)
      .slice(0, 3)
      .reduce((acc, value) => acc + value, 0);
    const representativeMatched = hitIds.has(cluster.representative_dictamen.id);
    const coreOverlapCount = cluster.core_doctrine_candidates.filter((candidate) => hitIds.has(candidate.id)).length;
    const supportOverlapCount = cluster.supporting_dictamen_ids.filter((id) => hitIds.has(id)).length;
    const queryMatch = buildQueryMatchExplanation({
      query: q,
      materia: selectedClusterResponse.materia,
      clusterLabel: cluster.cluster_label,
      topDescriptoresAI: cluster.top_descriptores_AI,
      topFuentesLegales: cluster.top_fuentes_legales,
      representativeMatched,
      coreOverlapCount,
      supportOverlapCount,
      querySubtopicLabel: querySubtopic?.subtopic_label ?? null,
      subtopicBoost
    });
    const withQueryMatch = {
      ...line,
      query_match_reason: queryMatch.query_match_reason,
      technical: {
        ...line.technical,
        query_match_signals: queryMatch.query_match_signals
      }
    };
    const semanticAnchor = buildSearchSemanticAnchor({
      line: withQueryMatch,
      cluster,
      metadataById,
      doctrinalMetadataById,
      matchInfoById,
      querySubtopic
    });

    const promoted = semanticAnchor
      ? promoteSemanticAnchor({
          line: withQueryMatch,
          anchor: semanticAnchor,
          metadataById,
          matchInfoById
        })
      : withQueryMatch;
    const semanticAnchorRecentness = buildRecentnessSignal(semanticAnchor?.fecha ?? null, 4);
    const presentationMomentum = (
      (cluster.graph_doctrinal_status.status === 'criterio_en_revision' ? 0.35 : 0)
      + (cluster.graph_doctrinal_status.status === 'criterio_tensionado' ? 0.18 : 0)
      + (cluster.active_doctrinal_signal_score * 0.45)
      + (semanticAnchorRecentness * 0.35)
    );
    const historicalPenalty = cluster.active_doctrinal_signal_score < 0.2 && semanticAnchorRecentness < 0.35 ? 0.45 : 0;
    const hybridScore = buildHybridSearchScore({
      cluster,
      doctrinalMetadataById,
      matchInfoById,
      topHitId,
      intentBoost: buildIntentBoost({
        intent: queryIntent,
        clusterLabel: cluster.cluster_label,
        materia: selectedClusterResponse.materia,
        topDescriptors: cluster.top_descriptores_AI
      }),
      subtopicBoost
    });

    return {
      line: promoted,
      cluster,
      hybridScore,
      presentationScore: hybridScore + presentationMomentum - historicalPenalty,
      documentaryMatchedIdsCount: documentaryMatchedIds.length,
      documentaryTopOverlapCount,
      documentaryEvidenceScore,
      subtopicBoost,
      queryCoverage
    };
  }).map((entry) => {
    const anchorDate = 'semantic_anchor_dictamen' in entry.line ? entry.line.semantic_anchor_dictamen?.fecha ?? null : null;
    const anchorRecentness = buildRecentnessSignal(anchorDate, 4);
    const familyKey = normalizeLineFamilyKey(entry.line.title);
    const representativeDoctrinal = doctrinalMetadataById[entry.cluster.representative_dictamen.id] ?? {};
    const currentnessScore = (
      (entry.cluster.graph_doctrinal_status.status === 'criterio_en_revision' ? 0.9 : 0)
      + (entry.cluster.graph_doctrinal_status.status === 'criterio_tensionado' ? 0.5 : 0)
      + (entry.cluster.active_doctrinal_signal_score * 1.35)
      + (anchorRecentness * 1.1)
      + (Number(representativeDoctrinal.currentness_score ?? 0) * 1.15)
      + (Number(representativeDoctrinal.reading_weight ?? 0) * 0.7)
    );

    return {
      ...entry,
      anchorRecentness,
      familyKey,
      currentnessScore
    };
  });

  const familyLeaders = new Map<string, number>();
  for (const entry of enrichedLines) {
    const current = familyLeaders.get(entry.familyKey);
    if (current === undefined || entry.currentnessScore > current) {
      familyLeaders.set(entry.familyKey, entry.currentnessScore);
    }
  }

  const rankedLines = enrichedLines.map((entry) => {
    const familyLeaderScore = familyLeaders.get(entry.familyKey) ?? entry.currentnessScore;
    const familyHasActiveLeader = familyLeaderScore >= 1.8;
    const isHistoricalWithinFamily = familyHasActiveLeader
      && entry.cluster.active_doctrinal_signal_score < 0.25
      && entry.anchorRecentness < 0.45;
    const familyPriorityAdjustment = familyHasActiveLeader
      ? entry.currentnessScore >= familyLeaderScore - 0.18
        ? 0.55
        : isHistoricalWithinFamily
          ? -0.95
          : -0.25
      : 0;

    return {
      ...entry,
      familyPriorityAdjustment,
      rankedScore: entry.presentationScore + familyPriorityAdjustment
    };
  }).sort((left, right) => (
    (() => {
      const leftIsActiveReview = (
        left.cluster.active_doctrinal_signal_score >= 0.5
        && left.anchorRecentness >= 0.6
        && (left.cluster.graph_doctrinal_status.status === 'criterio_en_revision' || left.cluster.graph_doctrinal_status.status === 'criterio_tensionado')
      );
      const rightIsActiveReview = (
        right.cluster.active_doctrinal_signal_score >= 0.5
        && right.anchorRecentness >= 0.6
        && (right.cluster.graph_doctrinal_status.status === 'criterio_en_revision' || right.cluster.graph_doctrinal_status.status === 'criterio_tensionado')
      );
      const leftIsHistorical = left.cluster.active_doctrinal_signal_score < 0.25 && left.anchorRecentness < 0.45;
      const rightIsHistorical = right.cluster.active_doctrinal_signal_score < 0.25 && right.anchorRecentness < 0.45;

      if (leftIsActiveReview && rightIsHistorical) return -1;
      if (rightIsActiveReview && leftIsHistorical) return 1;

      return 0;
    })()
    || right.rankedScore - left.rankedScore
    || right.presentationScore - left.presentationScore
    || right.hybridScore - left.hybridScore
  ));

  const directSemanticLine = documentaryDirectHitId
    ? buildDirectSemanticLine({
        query: q,
        topHitId: documentaryDirectHitId,
        topHitInfo: documentaryMatchInfoById.get(documentaryDirectHitId)!,
        secondHitInfo: documentarySecondHitId ? documentaryMatchInfoById.get(documentarySecondHitId) : undefined,
        queryIntent
      })
    : null;

  const requireCorroboratedDoctrine = Boolean(directSemanticLine) && (querySubtopic?.confidence ?? 0) >= 0.72;
  const visibleRankedLines = requireCorroboratedDoctrine
    ? rankedLines.filter((entry) => (
        entry.documentaryTopOverlapCount >= 1
        && (
          entry.documentaryMatchedIdsCount >= 2
          || entry.documentaryEvidenceScore >= 1.15
          || (entry.subtopicBoost ?? 0) >= 0.62
        )
      ))
    : tokenizeSearchText(q).length >= 3
      ? rankedLines.filter((entry) => (
          entry.queryCoverage.matchedTokens.length >= 2
          || (entry.subtopicBoost ?? 0) >= 0.45
          || entry.documentaryEvidenceScore >= 1.2
        ))
    : rankedLines;

  const response = await applyDoctrineStructureRemediations(env, {
    ...baseResponse,
    lines: visibleRankedLines.map((entry) => entry.line)
  });

  return {
    overview: {
      ...response.overview,
      totalLines: response.lines.length + (directSemanticLine ? 1 : 0),
      dominantTheme: directSemanticLine && requireCorroboratedDoctrine
        ? directSemanticLine.title
        : response.overview.dominantTheme,
      materiaEvaluated: directSemanticLine && requireCorroboratedDoctrine
        ? `Doctrina sobre ${directSemanticLine.title}`
        : response.overview.materiaEvaluated,
      periodCovered: directSemanticLine && requireCorroboratedDoctrine
        ? directSemanticLine.time_span
        : response.overview.periodCovered,
      query: q,
      query_interpreted: rewriteAccepted && rewrittenQuery ? rewrittenQuery : null,
      query_intent: queryIntent,
      query_subtopic: querySubtopic,
      searchMode
    },
    lines: directSemanticLine
      ? [
          directSemanticLine,
          ...response.lines.filter((line) => line.representative_dictamen_id !== directSemanticLine.representative_dictamen_id)
        ]
      : response.lines
  };
}

export { buildDoctrineLines, buildDoctrineSearch };
