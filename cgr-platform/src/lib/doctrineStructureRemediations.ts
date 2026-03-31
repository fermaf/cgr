import type { Env } from '../types';

type InsightLevel = 'low' | 'medium' | 'high';
type DoctrinalState = 'consolidado' | 'en_evolucion' | 'bajo_tension';
type CoherenceStatus = 'cohesiva' | 'mixta' | 'fragmentada';
type RelationBucket = 'consolida' | 'desarrolla' | 'ajusta';
type KeyDictamenRole = 'representativo' | 'núcleo doctrinal' | 'pivote de cambio' | 'apoyo relevante';

export interface DoctrineLineStructureAdjustment {
  action: 'merge_clusters';
  merged_cluster_count: number;
  merged_representative_ids: string[];
  confidence: number;
  rationale: string;
  note: string;
}

export interface DoctrineLineLike {
  title: string;
  importance_level: InsightLevel;
  change_risk_level: InsightLevel;
  summary: string;
  query_match_reason?: string;
  doctrinal_state: DoctrinalState;
  doctrinal_state_reason: string;
  reading_priority_reason?: string;
  pivot_dictamen?: {
    id: string;
    titulo: string;
    fecha: string | null;
    signal: 'pivote_de_cambio' | 'hito_de_evolucion';
    reason: string;
  } | null;
  semantic_anchor_dictamen?: {
    id: string;
    titulo: string;
    fecha: string | null;
    score: number;
    reason: string;
  } | null;
  relation_dynamics: {
    consolida: number;
    desarrolla: number;
    ajusta: number;
    dominant_bucket: RelationBucket | null;
    summary: string;
  };
  coherence_signals: {
    cluster_cohesion_score: number;
    semantic_dispersion: number;
    outlier_probability: number;
    descriptor_noise_score: number;
    fragmentation_risk: number;
    coherence_status: CoherenceStatus;
    summary: string;
  };
  representative_dictamen_id: string;
  core_dictamen_ids: string[];
  key_dictamenes: Array<{
    id: string;
    titulo: string;
    fecha: string | null;
    rol_en_linea: KeyDictamenRole;
  }>;
  top_fuentes_legales: Array<{ tipo_norma: string; numero: string | null; count: number }>;
  top_descriptores_AI: string[];
  time_span: {
    from: string | null;
    to: string | null;
  };
  technical?: {
    representative_score?: number;
    cluster_density_score?: number;
    doctrinal_importance_score?: number;
    doctrinal_change_risk_score?: number;
    temporal_spread_years?: number;
    influential_dictamen_ids?: string[];
    query_match_signals?: string[];
  };
  structure_adjustments?: DoctrineLineStructureAdjustment;
}

interface DoctrineStructureMergeOverride {
  canonical_title: string;
  normalized_title: string;
  canonical_representative_id: string;
  merged_representative_ids: string[];
  confidence_score: number;
  rationale: string;
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeDoctrineTitle(value: string): string {
  return compactText(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function levelRank(level: InsightLevel): number {
  switch (level) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
}

function pickHigherLevel(left: InsightLevel, right: InsightLevel): InsightLevel {
  return levelRank(right) > levelRank(left) ? right : left;
}

function stateRank(state: DoctrinalState): number {
  switch (state) {
    case 'bajo_tension':
      return 3;
    case 'en_evolucion':
      return 2;
    default:
      return 1;
  }
}

function pickHigherState(left: DoctrinalState, right: DoctrinalState): DoctrinalState {
  return stateRank(right) > stateRank(left) ? right : left;
}

function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function weightedAverage(values: Array<{ value: number; weight: number }>): number {
  const totalWeight = values.reduce((acc, entry) => acc + entry.weight, 0);
  if (totalWeight <= 0) return 0;
  const total = values.reduce((acc, entry) => acc + (entry.value * entry.weight), 0);
  return Math.round((total / totalWeight) * 100) / 100;
}

function mergeTopFuentes(lines: DoctrineLineLike[]): Array<{ tipo_norma: string; numero: string | null; count: number }> {
  const counts = new Map<string, { tipo_norma: string; numero: string | null; count: number }>();

  for (const line of lines) {
    for (const fuente of line.top_fuentes_legales) {
      const key = `${fuente.tipo_norma}::${fuente.numero ?? ''}`;
      const current = counts.get(key) ?? { tipo_norma: fuente.tipo_norma, numero: fuente.numero ?? null, count: 0 };
      current.count += fuente.count;
      counts.set(key, current);
    }
  }

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.tipo_norma.localeCompare(right.tipo_norma) || String(left.numero ?? '').localeCompare(String(right.numero ?? '')))
    .slice(0, 5);
}

function mergeTopDescriptores(lines: DoctrineLineLike[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();

  for (const line of lines) {
    for (const descriptor of line.top_descriptores_AI) {
      const normalized = normalizeDoctrineTitle(descriptor);
      const current = counts.get(normalized) ?? { label: descriptor, count: 0 };
      current.count += 1;
      counts.set(normalized, current);
    }
  }

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 5)
    .map((entry) => entry.label);
}

function mergeKeyDictamenes(lines: DoctrineLineLike[], canonicalRepresentativeId: string) {
  const roleRank: Record<KeyDictamenRole, number> = {
    'representativo': 4,
    'pivote de cambio': 3,
    'núcleo doctrinal': 2,
    'apoyo relevante': 1
  };
  const merged = new Map<string, {
    id: string;
    titulo: string;
    fecha: string | null;
    rol_en_linea: KeyDictamenRole;
  }>();

  for (const line of lines) {
    for (const item of line.key_dictamenes) {
      const forcedRole = item.id === canonicalRepresentativeId
        ? 'representativo'
        : item.rol_en_linea === 'representativo'
          ? 'núcleo doctrinal'
          : item.rol_en_linea;
      const current = merged.get(item.id);
      if (!current || roleRank[forcedRole] > roleRank[current.rol_en_linea]) {
        merged.set(item.id, {
          id: item.id,
          titulo: item.titulo,
          fecha: item.fecha,
          rol_en_linea: forcedRole
        });
      }
    }
  }

  return [...merged.values()]
    .sort((left, right) => roleRank[right.rol_en_linea] - roleRank[left.rol_en_linea] || (parseDate(right.fecha) ?? 0) - (parseDate(left.fecha) ?? 0))
    .slice(0, 6);
}

function buildRelationDynamicsSummary(dynamics: { consolida: number; desarrolla: number; ajusta: number; dominant_bucket: RelationBucket | null }): string {
  if (!dynamics.dominant_bucket) {
    return 'No hay una dinámica relacional dominante visible en esta línea integrada.';
  }

  if (dynamics.dominant_bucket === 'consolida') {
    return 'La línea integrada se sostiene principalmente por dictámenes que consolidan o aplican el criterio dominante.';
  }

  if (dynamics.dominant_bucket === 'desarrolla') {
    return 'La línea integrada muestra desarrollo doctrinal mediante aclaraciones y complementos sucesivos.';
  }

  return 'La línea integrada concentra dictámenes que ajustan o tensionan el criterio previo.';
}

function deriveCoherenceStatus(fragmentationRisk: number): CoherenceStatus {
  if (fragmentationRisk >= 0.55) return 'fragmentada';
  if (fragmentationRisk >= 0.32) return 'mixta';
  return 'cohesiva';
}

function mergeCoherenceSignals(lines: DoctrineLineLike[], note: string) {
  const weighted = lines.map((line) => ({
    weight: Math.max(line.core_dictamen_ids.length, line.key_dictamenes.length, 1),
    coherence: line.coherence_signals
  }));

  const clusterCohesion = weightedAverage(weighted.map((entry) => ({ value: entry.coherence.cluster_cohesion_score, weight: entry.weight })));
  const semanticDispersion = weightedAverage(weighted.map((entry) => ({ value: entry.coherence.semantic_dispersion, weight: entry.weight })));
  const outlierProbability = weightedAverage(weighted.map((entry) => ({ value: entry.coherence.outlier_probability, weight: entry.weight })));
  const descriptorNoise = weightedAverage(weighted.map((entry) => ({ value: entry.coherence.descriptor_noise_score, weight: entry.weight })));
  const fragmentationRiskBase = weightedAverage(weighted.map((entry) => ({ value: entry.coherence.fragmentation_risk, weight: entry.weight })));
  const fragmentationRisk = Math.max(0, Math.round((fragmentationRiskBase - 0.08) * 100) / 100);
  const coherenceStatus = deriveCoherenceStatus(fragmentationRisk);

  return {
    cluster_cohesion_score: clusterCohesion,
    semantic_dispersion: semanticDispersion,
    outlier_probability: outlierProbability,
    descriptor_noise_score: descriptorNoise,
    fragmentation_risk: fragmentationRisk,
    coherence_status: coherenceStatus,
    summary: `${note} ${coherenceStatus === 'cohesiva'
      ? 'La fusión reduce fragmentación artificial y deja una línea más cohesiva.'
      : coherenceStatus === 'mixta'
        ? 'La fusión reduce duplicación visible, pero la línea sigue requiriendo revisión doctrinal.'
        : 'La fusión reduce duplicación visible, pero la línea todavía parece doctrinalmente fragmentada.'}`
  };
}

function mergeDoctrineLines(
  lines: DoctrineLineLike[],
  override: DoctrineStructureMergeOverride
): DoctrineLineLike {
  const canonicalLine = lines.find((line) => line.representative_dictamen_id === override.canonical_representative_id) ?? lines[0];
  const mergedRepresentativeIds = uniqueStrings(lines.map((line) => line.representative_dictamen_id));
  const note = `Esta línea consolida ${lines.length} clusters equivalentes previamente fragmentados.`;
  const mergedTopFuentes = mergeTopFuentes(lines);
  const mergedTopDescriptores = mergeTopDescriptores(lines);
  const mergedRelationCounts = lines.reduce(
    (acc, line) => {
      acc.consolida += line.relation_dynamics.consolida;
      acc.desarrolla += line.relation_dynamics.desarrolla;
      acc.ajusta += line.relation_dynamics.ajusta;
      return acc;
    },
    { consolida: 0, desarrolla: 0, ajusta: 0 }
  );
  const dominantBucket: RelationBucket | null = (
    mergedRelationCounts.consolida === 0
      && mergedRelationCounts.desarrolla === 0
      && mergedRelationCounts.ajusta === 0
  )
    ? null
    : ([
        ['consolida', mergedRelationCounts.consolida],
        ['desarrolla', mergedRelationCounts.desarrolla],
        ['ajusta', mergedRelationCounts.ajusta]
      ] as Array<[RelationBucket, number]>)
      .sort((left, right) => right[1] - left[1])[0][0];

  const fromDates = lines.map((line) => line.time_span.from).filter((value): value is string => Boolean(value)).sort();
  const toDates = lines.map((line) => line.time_span.to).filter((value): value is string => Boolean(value)).sort();
  const mergedTimeSpan = {
    from: fromDates[0] ?? canonicalLine.time_span.from ?? null,
    to: toDates.slice(-1)[0] ?? canonicalLine.time_span.to ?? null
  };
  const temporalSpreadYears = (() => {
    const from = parseDate(mergedTimeSpan.from);
    const to = parseDate(mergedTimeSpan.to);
    if (from === null || to === null || to < from) return canonicalLine.technical?.temporal_spread_years;
    return Math.round((((to - from) / (1000 * 60 * 60 * 24 * 365.25)) * 100)) / 100;
  })();
  const mergedCoherence = mergeCoherenceSignals(lines, note);
  const doctrinalState = lines.reduce(
    (current, line) => pickHigherState(current, line.doctrinal_state),
    canonicalLine.doctrinal_state
  );
  const mergedInfluentialIds = uniqueStrings(lines.flatMap((line) => line.technical?.influential_dictamen_ids ?? []));
  const querySignals = uniqueStrings(lines.flatMap((line) => line.technical?.query_match_signals ?? []));
  const semanticAnchor = lines
    .map((line) => line.semantic_anchor_dictamen)
    .filter((value): value is NonNullable<DoctrineLineLike['semantic_anchor_dictamen']> => Boolean(value))
    .sort((left, right) => right.score - left.score || (parseDate(right.fecha) ?? 0) - (parseDate(left.fecha) ?? 0))[0]
    ?? null;

  return {
    ...canonicalLine,
    title: override.canonical_title || canonicalLine.title,
    importance_level: lines.reduce((current, line) => pickHigherLevel(current, line.importance_level), canonicalLine.importance_level),
    change_risk_level: lines.reduce((current, line) => pickHigherLevel(current, line.change_risk_level), canonicalLine.change_risk_level),
    summary: `${canonicalLine.summary} ${note}`,
    query_match_reason: lines
      .map((line) => line.query_match_reason)
      .filter((value): value is string => Boolean(value))
      .slice(0, 2)
      .join(' ')
      || canonicalLine.query_match_reason,
    doctrinal_state: doctrinalState,
    doctrinal_state_reason: `${canonicalLine.doctrinal_state_reason} ${note}`,
    reading_priority_reason: firstNonEmpty(lines.map((line) => line.reading_priority_reason)) ?? canonicalLine.reading_priority_reason,
    pivot_dictamen: canonicalLine.pivot_dictamen
      ?? lines
        .map((line) => line.pivot_dictamen)
        .filter((value): value is NonNullable<DoctrineLineLike['pivot_dictamen']> => Boolean(value))
        .sort((left, right) => (parseDate(right.fecha) ?? 0) - (parseDate(left.fecha) ?? 0))[0]
      ?? null,
    semantic_anchor_dictamen: semanticAnchor,
    relation_dynamics: {
      consolida: mergedRelationCounts.consolida,
      desarrolla: mergedRelationCounts.desarrolla,
      ajusta: mergedRelationCounts.ajusta,
      dominant_bucket: dominantBucket,
      summary: buildRelationDynamicsSummary({
        ...mergedRelationCounts,
        dominant_bucket: dominantBucket
      })
    },
    coherence_signals: mergedCoherence,
    representative_dictamen_id: canonicalLine.representative_dictamen_id,
    core_dictamen_ids: uniqueStrings(lines.flatMap((line) => line.core_dictamen_ids)),
    key_dictamenes: mergeKeyDictamenes(lines, canonicalLine.representative_dictamen_id),
    top_fuentes_legales: mergedTopFuentes,
    top_descriptores_AI: mergedTopDescriptores,
    time_span: mergedTimeSpan,
    technical: {
      representative_score: Math.max(...lines.map((line) => line.technical?.representative_score ?? 0)),
      cluster_density_score: weightedAverage(lines.map((line) => ({
        value: line.technical?.cluster_density_score ?? 0,
        weight: Math.max(line.core_dictamen_ids.length, 1)
      }))),
      doctrinal_importance_score: Math.max(...lines.map((line) => line.technical?.doctrinal_importance_score ?? 0)),
      doctrinal_change_risk_score: Math.max(...lines.map((line) => line.technical?.doctrinal_change_risk_score ?? 0)),
      temporal_spread_years: temporalSpreadYears,
      influential_dictamen_ids: mergedInfluentialIds,
      query_match_signals: querySignals.length > 0 ? querySignals : undefined
    },
    structure_adjustments: {
      action: 'merge_clusters',
      merged_cluster_count: lines.length,
      merged_representative_ids: mergedRepresentativeIds,
      confidence: override.confidence_score,
      rationale: override.rationale,
      note
    }
  };
}

async function loadMergeOverrides(env: Env, normalizedTitles: string[]): Promise<DoctrineStructureMergeOverride[]> {
  if (normalizedTitles.length === 0) return [];

  try {
    const placeholders = normalizedTitles.map(() => '?').join(',');
    const query = await env.DB.prepare(
      `SELECT canonical_title,
              normalized_title,
              canonical_representative_id,
              merged_representative_ids_json,
              confidence_score,
              rationale
       FROM doctrine_structure_remediations
       WHERE action_type = 'merge_clusters'
         AND action_status = 'applied'
         AND normalized_title IN (${placeholders})
       ORDER BY updated_at DESC, id DESC`
    ).bind(...normalizedTitles).all<{
      canonical_title: string;
      normalized_title: string;
      canonical_representative_id: string;
      merged_representative_ids_json: string;
      confidence_score: number | null;
      rationale: string | null;
    }>();

    return (query.results ?? []).flatMap((row) => {
      try {
        const parsed = JSON.parse(row.merged_representative_ids_json);
        const mergedRepresentativeIds = Array.isArray(parsed)
          ? uniqueStrings(parsed.map((value) => String(value)))
          : [];
        if (mergedRepresentativeIds.length < 2) return [];
        return [{
          canonical_title: row.canonical_title,
          normalized_title: row.normalized_title,
          canonical_representative_id: row.canonical_representative_id,
          merged_representative_ids: mergedRepresentativeIds,
          confidence_score: Math.round(Math.max(0, Math.min(1, Number(row.confidence_score ?? 0))) * 100) / 100,
          rationale: firstNonEmpty([row.rationale]) ?? 'Fusión doctrinal aplicada por equivalencia estructural.'
        }];
      } catch {
        return [];
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('no such table')) {
      return [];
    }
    throw error;
  }
}

export async function applyDoctrineStructureRemediations<TResponse extends {
  overview: { totalLines: number; dominantTheme: string | null };
  lines: DoctrineLineLike[];
}>(
  env: Env,
  response: TResponse
): Promise<TResponse> {
  if ((response.lines ?? []).length < 2) return response;

  const normalizedTitles = uniqueStrings(response.lines.map((line) => normalizeDoctrineTitle(line.title)));
  const overrides = await loadMergeOverrides(env, normalizedTitles);
  if (overrides.length === 0) return response;

  let currentLines = [...response.lines];

  for (const override of overrides) {
    const matchingIndexes = currentLines
      .map((line, index) => ({
        index,
        line,
        titleMatches: normalizeDoctrineTitle(line.title) === override.normalized_title,
        representativeMatches: override.merged_representative_ids.includes(line.representative_dictamen_id)
      }))
      .filter((entry) => entry.titleMatches && entry.representativeMatches);

    if (matchingIndexes.length < 2) continue;

    const mergedLines = matchingIndexes.map((entry) => entry.line);
    const mergedLine = mergeDoctrineLines(mergedLines, override);
    const firstIndex = Math.min(...matchingIndexes.map((entry) => entry.index));
    const indexSet = new Set(matchingIndexes.map((entry) => entry.index));

    currentLines = currentLines
      .filter((_, index) => !indexSet.has(index));
    currentLines.splice(firstIndex, 0, mergedLine);
  }

  return {
    ...response,
    overview: {
      ...response.overview,
      totalLines: currentLines.length,
      dominantTheme: currentLines[0]?.title ?? response.overview.dominantTheme
    },
    lines: currentLines
  };
}
