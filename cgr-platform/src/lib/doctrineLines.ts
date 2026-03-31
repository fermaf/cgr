import { fetchRecords } from '../clients/pinecone';
import { buildDoctrineClusters } from './doctrineClusters';
import { applyDoctrineStructureRemediations } from './doctrineStructureRemediations';
import { buildIntentBoost, detectQueryIntent } from './queryUnderstanding/queryIntent';
import { retrieveDoctrineMatchesWithQueryUnderstanding } from './queryUnderstanding/queryRewrite';
import type { Env } from '../types';

type InsightLevel = 'low' | 'medium' | 'high';
type KeyDictamenRole = 'representativo' | 'núcleo doctrinal' | 'pivote de cambio' | 'apoyo relevante';
type SearchMatch = { id: string; score?: number; metadata?: Record<string, unknown> };
type SearchMatchInfo = {
  rawScore: number;
  normalizedScore: number;
  rank: number;
  metadata?: Record<string, unknown>;
};

function toLevel(score: number): InsightLevel {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

function formatFuenteLegal(fuente: { tipo_norma: string; numero: string | null }): string {
  return fuente.numero ? `${fuente.tipo_norma} ${fuente.numero}` : fuente.tipo_norma;
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

function buildKeyDictamenes(
  cluster: Awaited<ReturnType<typeof buildDoctrineClusters>>['clusters'][number],
  metadataById: Record<string, Record<string, unknown>>
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

  return [...keyed.entries()].slice(0, 5).map(([id, rol_en_linea]) => {
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

  let reason: string;
  if (matchedDescriptors.length > 0) {
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
  return metadataById;
}

function buildDoctrineLinesResponse(
  clusterResponse: Awaited<ReturnType<typeof buildDoctrineClusters>>,
  metadataById: Record<string, Record<string, unknown>>
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
      key_dictamenes: buildKeyDictamenes(cluster, metadataById),
      top_fuentes_legales: cluster.top_fuentes_legales,
      top_descriptores_AI: cluster.top_descriptores_AI,
      time_span: cluster.time_span,
      technical: {
        representative_score: cluster.representative_score,
        cluster_density_score: cluster.cluster_density_score,
        doctrinal_importance_score: cluster.doctrinal_importance_score,
        doctrinal_change_risk_score: cluster.doctrinal_change_risk_score,
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

function buildSearchSemanticAnchor(params: {
  line: ReturnType<typeof buildDoctrineLinesResponse>['lines'][number];
  cluster: Awaited<ReturnType<typeof buildDoctrineClusters>>['clusters'][number];
  metadataById: Record<string, Record<string, unknown>>;
  matchInfoById: Map<string, SearchMatchInfo>;
}) {
  const candidateIds = [
    params.cluster.representative_dictamen.id,
    ...params.cluster.core_doctrine_candidates.map((candidate) => candidate.id),
    ...params.cluster.supporting_dictamen_ids
  ];
  const uniqueIds = [...new Set(candidateIds)];
  const ranked = uniqueIds
    .map((id) => ({ id, info: params.matchInfoById.get(id) }))
    .filter((entry): entry is { id: string; info: SearchMatchInfo } => Boolean(entry.info))
    .sort((left, right) => (
      right.info.rawScore - left.info.rawScore
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
  matchInfoById: Map<string, SearchMatchInfo>;
  topHitId: string | null;
  intentBoost: number;
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
  const topHitBoost = params.topHitId && matchedIds.includes(params.topHitId) ? 2.4 : 0;

  return (
    (semanticPeak * 4.2)
    + (representativeSemantic * 1.6)
    + (semanticCoverage * 1.25)
    + topHitBoost
    + params.intentBoost
    + (params.cluster.doctrinal_importance_score * 0.25)
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
  const shouldPromote = params.anchor.id !== params.line.representative_dictamen_id
    && params.matchInfoById.get(params.anchor.id)?.normalizedScore !== undefined
    && (
      (params.matchInfoById.get(params.anchor.id)?.normalizedScore ?? 0) >= 0.9
      || ((params.matchInfoById.get(params.anchor.id)?.normalizedScore ?? 0) - representativeSemantic) >= 0.18
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
  const metadataById = await buildMetadataById(env, clusterResponse.clusters);
  return applyDoctrineStructureRemediations(env, buildDoctrineLinesResponse(clusterResponse, metadataById));
}

type BuildDoctrineSearchOptions = {
  q: string;
  limit?: number;
};

type LexicalDoctrineSearchRow = {
  id: string;
  materia: string;
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
       d.criterio,
       e.titulo,
       e.resumen,
       e.analisis
     FROM dictamenes d
     LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
     WHERE d.estado IN ('enriched', 'vectorized')
     ORDER BY COALESCE(d.fecha_documento, d.created_at) DESC
     LIMIT ?`
  ).bind(Math.min(limit * 20, 120)).all<LexicalDoctrineSearchRow>();

  const shortlisted = (rows.results ?? [])
    .map((row) => {
      const haystack = normalizeSearchText([
        row.materia,
        row.criterio ?? '',
        row.titulo ?? '',
        row.resumen ?? '',
        row.analisis ?? ''
      ].join(' '));
      const score = tokens.reduce((acc, token) => acc + (haystack.includes(token) ? 1 : 0), 0);
      return {
        id: row.id,
        materia: row.materia,
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

async function buildDoctrineSearchFromMatches(
  env: Env,
  matches: SearchMatch[],
  limit: number
) {
  const queryCentricResponse = await buildDoctrineClusters(env, {
    candidateIds: matches.map((match) => match.id),
    limit,
    topK: Math.min(Math.max(matches.length, 5), 12)
  });
  if (queryCentricResponse.clusters.length > 0) {
    return {
      hitIds: new Set(matches.map((match) => match.id)),
      selectedClusterResponse: queryCentricResponse
    };
  }

  const hitIds = [...new Set(matches.map((match) => match.id))];
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
  for (const match of matches) {
    const materia = materiaById.get(match.id) || pickText(match.metadata?.materia) || 'Sin materia';
    materiaScores.set(materia, (materiaScores.get(materia) ?? 0) + Number(match.score ?? 0));
  }

  const topMaterias = [...materiaScores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([materia]) => materia);

  const hitIdsSet = new Set(hitIds);
  const clusterResponses = await Promise.all(
    topMaterias.map((materia) => buildDoctrineClusters(env, {
      materia,
      limit,
      topK: 8
    }))
  );

  const allClusters = clusterResponses.flatMap((response) => response.clusters.map((cluster) => ({
    materia: response.materia,
    cluster
  })));

  const scoredClusters = allClusters.map(({ materia, cluster }) => {
    const overlapCount = cluster.supporting_dictamen_ids.filter((id) => hitIdsSet.has(id)).length;
    const coreOverlap = cluster.core_doctrine_candidates.filter((candidate) => hitIdsSet.has(candidate.id)).length;
    const representativeOverlap = hitIdsSet.has(cluster.representative_dictamen.id) ? 1 : 0;
    const semanticMatchScore = overlapCount + (coreOverlap * 2) + (representativeOverlap * 2);
    const totalScore = semanticMatchScore + cluster.doctrinal_importance_score;
    return {
      materia,
      cluster,
      totalScore
    };
  }).sort((a, b) => (
    b.totalScore - a.totalScore
    || b.cluster.doctrinal_importance_score - a.cluster.doctrinal_importance_score
    || a.cluster.cluster_label.localeCompare(b.cluster.cluster_label)
  )).slice(0, limit);

  return {
    hitIds: hitIdsSet,
    selectedClusterResponse: {
      materia: scoredClusters[0]?.materia ?? topMaterias[0] ?? null,
      clusters: scoredClusters.map((entry) => entry.cluster),
      stats: {
        total_dictamenes_considerados: matches.length,
        total_clusters_generados: scoredClusters.length
      }
    }
  };
}

async function buildDoctrineSearch(env: Env, options: BuildDoctrineSearchOptions) {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);
  const q = options.q.trim();
  const searchLimit = Math.min(Math.max(limit * 8, 12), 30);
  let matches: SearchMatch[] = [];
  let searchMode: "semantic" | "lexical_fallback" = "semantic";
  let rewrittenQuery: string | null = null;
  let rewriteAccepted = false;

  try {
    const search = await retrieveDoctrineMatchesWithQueryUnderstanding(env, q, searchLimit);
    matches = search.matches;
    rewrittenQuery = search.rewrite.rewrittenQuery;
    rewriteAccepted = search.rewrite.accepted;
  } catch (error) {
    if (!isPineconeQuotaError(error)) throw error;

    const lexicalMatches = await searchDoctrineLexically(env, q, limit);
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
  const topHitId = matches[0]?.id ?? null;
  let { hitIds, selectedClusterResponse } = await buildDoctrineSearchFromMatches(env, matches, limit);
  if (selectedClusterResponse.clusters.length === 0 && searchMode === "semantic") {
    const lexicalMatches = await searchDoctrineLexically(env, q, limit);
    matches = lexicalMatches.map((row) => ({
      id: row.id,
      score: row.score,
      metadata: {
        materia: row.materia
      }
    }));
    searchMode = "lexical_fallback";
    ({ hitIds, selectedClusterResponse } = await buildDoctrineSearchFromMatches(env, matches, limit));
  }
  const metadataById = await buildMetadataById(env, selectedClusterResponse.clusters);
  const queryIntent = detectQueryIntent({
    query: q,
    rewrittenQuery: rewriteAccepted ? rewrittenQuery : null,
    matches,
    clusters: selectedClusterResponse.clusters.map((cluster) => ({
      cluster_label: cluster.cluster_label,
      top_descriptores_AI: cluster.top_descriptores_AI
    }))
  });
  const baseResponse = buildDoctrineLinesResponse(selectedClusterResponse, metadataById);

  const enrichedLines = baseResponse.lines.map((line, index) => {
    const cluster = selectedClusterResponse.clusters[index];
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
      supportOverlapCount
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
      matchInfoById
    });

    const promoted = semanticAnchor
      ? promoteSemanticAnchor({
          line: withQueryMatch,
          anchor: semanticAnchor,
          metadataById,
          matchInfoById
        })
      : withQueryMatch;

    return {
      line: promoted,
      hybridScore: buildHybridSearchScore({
        cluster,
        matchInfoById,
        topHitId,
        intentBoost: buildIntentBoost({
          intent: queryIntent,
          clusterLabel: cluster.cluster_label,
          materia: selectedClusterResponse.materia,
          topDescriptors: cluster.top_descriptores_AI
        })
      })
    };
  }).sort((left, right) => right.hybridScore - left.hybridScore);

  const response = await applyDoctrineStructureRemediations(env, {
    ...baseResponse,
    lines: enrichedLines.map((entry) => entry.line)
  });

  return {
    overview: {
      ...response.overview,
      query: q,
      query_interpreted: rewriteAccepted && rewrittenQuery ? rewrittenQuery : null,
      query_intent: queryIntent,
      searchMode
    },
    lines: response.lines
  };
}

export { buildDoctrineLines, buildDoctrineSearch };
