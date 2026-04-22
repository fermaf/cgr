import { buildDoctrineSearch } from './doctrineLines';
import { classifyRelationEffect, relationEffectLabel, type GraphDoctrinalStatus, type RelationEffectCategory } from './doctrinalGraph';
import { loadDoctrinalMetadataByIds } from './doctrinalMetadata';
import type { QueryIntentDetection, QuerySubtopicDetection } from './queryUnderstanding/queryIntent';
import type { Env } from '../types';

type GuidedFlowOptions = {
  q: string;
  limit?: number;
};

type GuidedFamilyExploreOptions = {
  q: string;
  familyId: string;
  limit?: number;
};

type SearchResponse = Awaited<ReturnType<typeof buildDoctrineSearch>>;
type SearchLine = SearchResponse['lines'][number];

type DictamenMetaRow = {
  id: string;
  fecha_documento: string | null;
  materia: string | null;
  criterio: string | null;
  numero: string | null;
};

type DictamenEnrichmentRow = {
  titulo: string | null;
  resumen: string | null;
};

type DictamenAttrRow = {
  es_nuevo: number;
  es_relevante: number;
  en_boletin: number;
  recurso_proteccion: number;
  aclarado: number;
  alterado: number;
  aplicado: number;
  complementado: number;
  confirmado: number;
  reactivado: number;
  reconsiderado: number;
  reconsiderado_parcialmente: number;
  caracter: string | null;
};

type DictamenDoctrinalMetadataRow = {
  rol_principal: string;
  estado_intervencion_cgr: string;
  estado_vigencia: string;
  reading_role: string;
  reading_weight: number;
  currentness_score: number;
  doctrinal_centrality_score: number;
  confidence_global: number;
  supports_state_current: number;
  signals_litigious_matter: number;
  signals_abstention: number;
  signals_competence_closure: number;
};

type RelationRow = {
  related_id: string;
  tipo_accion: string;
  fecha_documento: string | null;
  titulo: string | null;
};

type FamilyRelationEdgeRow = {
  source_id: string;
  target_id: string;
  tipo_accion: string;
  source_date: string | null;
  source_title: string | null;
  target_title: string | null;
};

type GuidedFamily = {
  family_id: string;
  label: string;
  representative_dictamen_id: string;
  representative_title: string;
  representative_date: string | null;
  doctrinal_status: GraphDoctrinalStatus;
  doctrinal_status_summary: string;
  relation_summary: string;
  visible_time_span: { from: string | null; to: string | null };
  key_dictamenes_count: number;
  why_this_family: string;
  next_step: string;
};

type MatterStatusRow = {
  id: string;
  fecha_documento: string | null;
  materia: string | null;
  criterio: string | null;
  numero: string | null;
  titulo: string | null;
  resumen: string | null;
  analisis: string | null;
  en_boletin: number | null;
  reactivado: number | null;
  aplicado: number | null;
  complementado: number | null;
  confirmado: number | null;
  rol_principal: string | null;
  estado_intervencion_cgr: string | null;
  estado_vigencia: string | null;
  reading_role: string | null;
  reading_weight: number | null;
  currentness_score: number | null;
  doctrinal_centrality_score: number | null;
  confidence_global: number | null;
  supports_state_current: number | null;
  signals_litigious_matter: number | null;
  signals_abstention: number | null;
  signals_competence_closure: number | null;
};

type MatterStatusCategory =
  | 'materia_litigiosa'
  | 'abstencion_competencial'
  | 'cambio_de_regimen'
  | 'criterio_operativo_actual';

type MatterStatusSnapshot = {
  dictamen_id: string;
  title: string;
  date: string | null;
  numero: string | null;
  materia: string | null;
  criterio: string | null;
  status_category: MatterStatusCategory;
  status_label: string;
  summary: string;
  why_this_status: string;
  confidence: number;
  matched_terms: string[];
};

function pickText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSearchText(value: string): string[] {
  return [...new Set(
    normalizeSearchText(value)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  )];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function buildOrderedQueryTokens(value: string): string[] {
  return normalizeSearchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !GUIDED_GENERIC_TOKENS.has(token));
}

function buildQueryPhrases(value: string): string[] {
  const tokens = buildOrderedQueryTokens(value);
  const phrases: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    phrases.push(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return uniqueStrings(phrases);
}

function parseDateToTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeGuidedIntent(intent: QueryIntentDetection | null | undefined): QueryIntentDetection | null {
  if (!intent) return null;
  return intent.confidence >= 0.6 ? intent : null;
}

function sanitizeGuidedSubtopic(subtopic: QuerySubtopicDetection | null | undefined): QuerySubtopicDetection | null {
  if (!subtopic) return null;
  return subtopic.confidence >= 0.72 ? subtopic : null;
}

const GUIDED_GENERIC_TOKENS = new Set([
  'administrativa',
  'administrativo',
  'criterio',
  'consulta',
  'doctrina',
  'dictamen',
  'familia',
  'juridico',
  'juridica',
  'linea',
  'publica',
  'publico',
  'servicio',
  'visible'
]);

function filterSpecificTokens(tokens: string[]): string[] {
  return tokens.filter((token) => !GUIDED_GENERIC_TOKENS.has(token));
}

function buildFamilySemanticText(line: SearchLine): string {
  return [
    line.title,
    line.summary,
    line.query_match_reason ?? '',
    line.reading_priority_reason ?? '',
    ...line.top_descriptores_AI,
    ...line.top_fuentes_legales.map((fuente) => [fuente.tipo_norma, fuente.numero ?? ''].join(' ')),
    ...line.key_dictamenes.flatMap((item) => [item.titulo, item.rol_en_linea])
  ].join(' ');
}

function buildFamilySemanticSegments(line: SearchLine): string[] {
  return [
    line.title,
    line.summary,
    line.query_match_reason ?? '',
    line.reading_priority_reason ?? '',
    ...line.top_descriptores_AI,
    ...line.key_dictamenes.flatMap((item) => [item.titulo])
  ].map((value) => normalizeSearchText(value)).filter(Boolean);
}

function buildQueryConstrainedFamilyLines(params: {
  lines: SearchLine[];
  query: string;
  querySubtopic: QuerySubtopicDetection | null;
}): SearchLine[] {
  const queryTokens = filterSpecificTokens(tokenizeSearchText(params.query));
  const subtopicTokens = filterSpecificTokens(uniqueStrings([
    ...(params.querySubtopic?.matched_terms ?? []).flatMap((term) => tokenizeSearchText(term)),
    ...(params.querySubtopic?.subtopic_terms ?? []).flatMap((term) => tokenizeSearchText(term)),
    ...(params.querySubtopic?.subtopic_label ? tokenizeSearchText(params.querySubtopic.subtopic_label) : [])
  ]));
  const highConfidenceSubtopic = (params.querySubtopic?.confidence ?? 0) >= 0.75;

  const scored = params.lines.map((line) => {
    const semanticText = normalizeSearchText(buildFamilySemanticText(line));
    const semanticTokens = new Set(tokenizeSearchText(buildFamilySemanticText(line)));
    const semanticSegments = buildFamilySemanticSegments(line);
    const matchedQueryTokens = queryTokens.filter((token) => semanticTokens.has(token));
    const matchedSubtopicTokens = subtopicTokens.filter((token) => semanticTokens.has(token));
    const anchorCount = uniqueStrings([...matchedQueryTokens, ...matchedSubtopicTokens]).length;
    const cohesiveQuerySegments = semanticSegments.filter((segment) => (
      queryTokens.filter((token) => segment.includes(token)).length >= 2
    )).length;
    const cohesiveAnchorSegments = semanticSegments.filter((segment) => (
      uniqueStrings([
        ...queryTokens.filter((token) => segment.includes(token)),
        ...subtopicTokens.filter((token) => segment.includes(token))
      ]).length >= 2
    )).length;
    const titleTokens = filterSpecificTokens(tokenizeSearchText(line.title));
    const titleAnchorCount = titleTokens.filter((token) => (
      matchedQueryTokens.includes(token) || matchedSubtopicTokens.includes(token)
    )).length;
    const descriptorAnchorCount = line.top_descriptores_AI
      .flatMap((descriptor) => filterSpecificTokens(tokenizeSearchText(descriptor)))
      .filter((token, index, collection) => collection.indexOf(token) === index)
      .filter((token) => matchedQueryTokens.includes(token) || matchedSubtopicTokens.includes(token))
      .length;
    const queryCoverage = queryTokens.length > 0 ? matchedQueryTokens.length / queryTokens.length : 0;
    const subtopicCoverage = subtopicTokens.length > 0 ? matchedSubtopicTokens.length / subtopicTokens.length : 0;
    const score = Number((
      (queryCoverage * 1.55)
      + (subtopicCoverage * 1.25)
      + (Math.min(2, cohesiveQuerySegments) * 0.32)
      + (Math.min(2, cohesiveAnchorSegments) * 0.28)
      + (Math.min(2, titleAnchorCount) * 0.3)
      + (Math.min(2, descriptorAnchorCount) * 0.22)
      + (Math.min(3, anchorCount) * 0.18)
    ).toFixed(3));

    return {
      line,
      score,
      anchorCount,
      semanticText,
      cohesiveQuerySegments,
      cohesiveAnchorSegments,
      matchedQueryTokens,
      matchedSubtopicTokens
    };
  }).sort((left, right) => (
    right.score - left.score
    || right.anchorCount - left.anchorCount
    || right.matchedQueryTokens.length - left.matchedQueryTokens.length
    || right.matchedSubtopicTokens.length - left.matchedSubtopicTokens.length
    || left.line.title.localeCompare(right.line.title)
  ));

  const constrained = scored.filter((entry) => {
    if (highConfidenceSubtopic) {
      return (
        entry.anchorCount >= 2
        && (
          entry.cohesiveAnchorSegments >= 1
          && (
          entry.matchedQueryTokens.length >= 2
          || entry.matchedSubtopicTokens.length >= 2
          || (
            entry.matchedQueryTokens.length >= 1
            && entry.matchedSubtopicTokens.length >= 1
          )
          || entry.score >= 1.15
          )
        )
      );
    }

    return (
      (
        entry.matchedQueryTokens.length >= 2
        && entry.cohesiveQuerySegments >= 1
      )
      || (
        entry.anchorCount >= 2
        && entry.cohesiveAnchorSegments >= 1
        && !(
          entry.matchedQueryTokens.length === 0
          && /\b(decreto|presidencia|presidenciales|acto|actos)\b/.test(entry.semanticText)
        )
      )
      || entry.score >= 1.05
    );
  });

  const selected = constrained.length > 0
    ? constrained
    : scored.filter((entry) => (
      entry.score >= (highConfidenceSubtopic ? 0.95 : 0.8)
      && entry.anchorCount >= 1
      && entry.cohesiveAnchorSegments >= 1
    ));

  return selected.map((entry) => entry.line);
}

function buildFamilyId(line: SearchLine): string {
  return `${line.representative_dictamen_id}:${line.title}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-');
}

function isDirectFocusLine(line: SearchLine | undefined): boolean {
  if (!line) return false;
  return line.key_dictamenes.length === 1 && line.core_dictamen_ids.length === 1;
}

function buildRelationSummary(line: SearchLine): string {
  const dynamics = line.relation_dynamics;
  const strongest = [
    ['consolidan', dynamics.consolida],
    ['desarrollan', dynamics.desarrolla],
    ['ajustan', dynamics.ajusta]
  ].sort((a, b) => Number(b[1]) - Number(a[1]))[0];

  if (Number(strongest?.[1] ?? 0) <= 0) {
    return 'La familia todavía tiene pocas relaciones jurídicas explícitas; conviene validar su secuencia temporal antes de consolidarla.';
  }

  return `Dentro de esta familia predominan dictámenes que ${strongest?.[0] ?? 'se conectan'} el criterio visible.`;
}

function buildNextStep(line: SearchLine): string {
  if (line.graph_doctrinal_status.status === 'criterio_en_revision') {
    return 'Revise primero el pivote de cambio y luego contraste los dictámenes posteriores que desplazan o limitan criterio.';
  }
  if (line.graph_doctrinal_status.status === 'criterio_tensionado') {
    return 'Empiece por el dictamen representativo y luego siga los ajustes recientes para verificar si el criterio sigue operativo.';
  }
  if (line.graph_doctrinal_status.status === 'criterio_en_evolucion') {
    return 'Recorra el dictamen representativo y después los hitos recientes que desarrollan la familia doctrinal.';
  }
  return 'Empiece por el dictamen representativo y luego recorra los apoyos relevantes para confirmar la estabilidad del criterio.';
}

function buildGuidedFamilies(lines: SearchLine[]): GuidedFamily[] {
  return lines.map((line) => ({
    family_id: buildFamilyId(line),
    label: line.title,
    representative_dictamen_id: line.representative_dictamen_id,
    representative_title: line.key_dictamenes.find((item) => item.id === line.representative_dictamen_id)?.titulo ?? line.title,
    representative_date: line.key_dictamenes.find((item) => item.id === line.representative_dictamen_id)?.fecha ?? null,
    doctrinal_status: line.graph_doctrinal_status.status,
    doctrinal_status_summary: line.graph_doctrinal_status.summary,
    relation_summary: buildRelationSummary(line),
    visible_time_span: line.time_span,
    key_dictamenes_count: line.key_dictamenes.length,
    why_this_family: line.query_match_reason ?? line.summary,
    next_step: buildNextStep(line)
  }));
}

function splitGuidedSearch(search: SearchResponse, query: string, querySubtopic: QuerySubtopicDetection | null) {
  const firstLine = search.lines[0];
  const hasDirectFocus = isDirectFocusLine(firstLine);
  const focusLine = firstLine ?? null;
  const baseFamilyLines = hasDirectFocus ? search.lines.slice(1) : search.lines;
  const familySourceLines = buildQueryConstrainedFamilyLines({
    lines: baseFamilyLines,
    query,
    querySubtopic
  });
  const families = buildGuidedFamilies(familySourceLines);
  return {
    focusLine,
    familySourceLines,
    families
  };
}

function buildGuidedSteps(hasFamilies: boolean) {
  return hasFamilies
    ? [
        'Leer primero el foco directo y su resumen.',
        'Elegir una familia doctrinal candidata para profundizar.',
        'Revisar la ruta temporal para distinguir criterio vigente, ajustes y desplazamientos.',
        'Retroceder y explorar otra familia si la primera no representa bien el problema jurídico buscado.'
      ]
    : [
        'Leer primero el foco directo y su resumen.',
        'Revisar las relaciones visibles del dictamen para confirmar si existe continuidad doctrinal.',
        'Si no aparece una familia corroborada, mantenga la investigación en lectura directa en vez de forzar una línea.'
      ];
}

function buildCurrentnessLabel(params: {
  focusDate: string | null;
  incomingEffects: Record<RelationEffectCategory, number>;
}) {
  const destabilizing = params.incomingEffects.desplaza + params.incomingEffects.limita + params.incomingEffects.ajusta;
  if (params.incomingEffects.desplaza > 0) {
    return 'criterio desplazado o revisado por dictámenes posteriores';
  }
  if (params.incomingEffects.limita > 0 || destabilizing >= 2) {
    return 'criterio vigente pero tensionado por dictámenes posteriores';
  }
  if (params.focusDate) {
    return 'criterio operativo visible sin desplazamiento fuerte posterior';
  }
  return 'criterio visible con información temporal parcial';
}

async function fetchDictamenContextsBatch(env: Env, dictamenIds: string[]) {
  if (dictamenIds.length === 0) return {};

  const placeholders = dictamenIds.map(() => '?').join(',');

  // 1. Meta y Atributos (Tablas core)
  const metasPromise = env.DB.prepare(
    `SELECT id, fecha_documento, materia, criterio, numero
     FROM dictamenes
     WHERE id IN (${placeholders})`
  ).bind(...dictamenIds).all<DictamenMetaRow>();

  const attrsPromise = env.DB.prepare(
    `SELECT
       dictamen_id as id,
       es_nuevo, es_relevante, en_boletin, recurso_proteccion, aclarado,
       alterado, aplicado, complementado, confirmado, reactivado,
       reconsiderado, reconsiderado_parcialmente, caracter
     FROM atributos_juridicos
     WHERE dictamen_id IN (${placeholders})`
  ).bind(...dictamenIds).all<DictamenAttrRow & { id: string }>();

  const enrichmentPromise = env.DB.prepare(
    `SELECT dictamen_id as id, titulo, resumen
     FROM enriquecimiento
     WHERE dictamen_id IN (${placeholders})`
  ).bind(...dictamenIds).all<DictamenEnrichmentRow & { id: string }>();

  // 2. Relaciones (con Lean Joins)
  const incomingPromise = env.DB.prepare(
    `SELECT
       r.dictamen_destino_id AS focus_id,
       r.dictamen_origen_id AS related_id,
       r.tipo_accion,
       COALESCE(d.fecha_documento, d.created_at) AS fecha_documento,
       e.titulo
     FROM dictamen_relaciones_juridicas r
     LEFT JOIN dictamenes d ON d.id = r.dictamen_origen_id
     LEFT JOIN enriquecimiento e ON e.dictamen_id = r.dictamen_origen_id
     WHERE r.dictamen_destino_id IN (${placeholders})
     ORDER BY COALESCE(d.fecha_documento, d.created_at) DESC`
  ).bind(...dictamenIds).all<RelationRow & { focus_id: string }>();

  const outgoingPromise = env.DB.prepare(
    `SELECT
       r.dictamen_origen_id AS focus_id,
       r.dictamen_destino_id AS related_id,
       r.tipo_accion,
       COALESCE(d.fecha_documento, d.created_at) AS fecha_documento,
       e.titulo
     FROM dictamen_relaciones_juridicas r
     LEFT JOIN dictamenes d ON d.id = r.dictamen_destino_id
     LEFT JOIN enriquecimiento e ON e.dictamen_id = r.dictamen_destino_id
     WHERE r.dictamen_origen_id IN (${placeholders})
     ORDER BY COALESCE(d.fecha_documento, d.created_at) DESC`
  ).bind(...dictamenIds).all<RelationRow & { focus_id: string }>();

  const doctrinalMetadataMapPromise = loadDoctrinalMetadataByIds(env, dictamenIds);

  const [metas, attrs, enrichment, incoming, outgoing, doctrinalMetadataMap] = await Promise.all([
    metasPromise,
    attrsPromise,
    enrichmentPromise,
    incomingPromise,
    outgoingPromise,
    doctrinalMetadataMapPromise
  ]);

  const results: Record<string, any> = {};
  for (const id of dictamenIds) {
    results[id] = {
      meta: metas.results.find(m => m.id === id) || null,
      attrs: attrs.results.find(a => a.id === id) || null,
      enrichment: enrichment.results.find(e => e.id === id) || null,
      doctrinalMetadata: doctrinalMetadataMap[id] || null,
      incoming: (incoming.results || []).filter(r => r.focus_id === id).slice(0, 20),
      outgoing: (outgoing.results || []).filter(r => r.focus_id === id).slice(0, 20)
    };
  }

  return results;
}

function buildTemporalRoute(params: {
  focusId: string;
  focusDate: string | null;
  incoming: RelationRow[];
  outgoing: RelationRow[];
}) {
  const incomingEffects = {
    fortalece: 0,
    desarrolla: 0,
    ajusta: 0,
    limita: 0,
    desplaza: 0
  } as Record<RelationEffectCategory, number>;

  const events = [
    ...params.outgoing.map((relation) => ({
      related_id: relation.related_id,
      related_title: relation.titulo ?? relation.related_id,
      related_date: relation.fecha_documento,
      relation_type: relation.tipo_accion,
      relation_effect: classifyRelationEffect(relation.tipo_accion),
      relation_label: relationEffectLabel(classifyRelationEffect(relation.tipo_accion)),
      direction: 'antecedente' as const,
      chronology_hint: 'El dictamen foco actúa sobre un criterio anterior o paralelo.'
    })),
    ...params.incoming.map((relation) => {
      const effect = classifyRelationEffect(relation.tipo_accion);
      incomingEffects[effect] += 1;
      return {
        related_id: relation.related_id,
        related_title: relation.titulo ?? relation.related_id,
        related_date: relation.fecha_documento,
        relation_type: relation.tipo_accion,
        relation_effect: effect,
        relation_label: relationEffectLabel(effect),
        direction: 'posterior' as const,
        chronology_hint: 'Un dictamen posterior retoma, desarrolla o modifica el dictamen foco.'
      };
    })
  ].sort((left, right) => String(left.related_date ?? '').localeCompare(String(right.related_date ?? '')));

  return {
    root_dictamen_id: params.focusId,
    currentness_label: buildCurrentnessLabel({
      focusDate: params.focusDate,
      incomingEffects
    }),
    relation_inventory: incomingEffects,
    events
  };
}

function buildFocusAttributes(attrs: DictamenAttrRow | null) {
  if (!attrs) return [];
  const flags = [
    attrs.es_relevante ? 'relevante' : '',
    attrs.en_boletin ? 'en boletín' : '',
    attrs.recurso_proteccion ? 'recurso de protección' : '',
    attrs.reconsiderado ? 'reconsiderado' : '',
    attrs.reconsiderado_parcialmente ? 'reconsiderado parcialmente' : '',
    attrs.alterado ? 'alterado' : '',
    attrs.reactivado ? 'reactivado' : '',
    attrs.confirmado ? 'confirmado' : '',
    attrs.complementado ? 'complementado' : '',
    attrs.aclarado ? 'aclarado' : '',
    attrs.aplicado ? 'aplicado' : '',
    attrs.es_nuevo ? 'nuevo' : '',
    attrs.caracter ? `carácter: ${attrs.caracter}` : ''
  ].filter(Boolean);
  return flags;
}

function buildMatterStatusText(row: MatterStatusRow) {
  return normalizeSearchText([
    row.materia ?? '',
    row.titulo ?? '',
    row.resumen ?? ''
  ].join(' '));
}

function buildMatterStatusSegments(row: MatterStatusRow): string[] {
  return [
    row.materia ?? '',
    row.titulo ?? '',
    row.resumen ?? ''
  ].map((value) => normalizeSearchText(value)).filter(Boolean);
}

function detectMatterStatusSignals(text: string) {
  const signalDefinitions: Array<{
    category: MatterStatusCategory;
    label: string;
    phrases: string[];
    score: number;
  }> = [
    {
      category: 'abstencion_competencial',
      label: 'abstención competencial visible',
      phrases: [
        'se abstenga de resolver',
        'no intervendra ni informara',
        'no intervendra',
        'no informara',
        'corresponde abstenerse',
        'se abstendra de resolver',
        'no corresponde emitir pronunciamiento'
      ],
      score: 1.5
    },
    {
      category: 'materia_litigiosa',
      label: 'materia litigiosa',
      phrases: [
        'materia devino en litigiosa',
        'ha devenido en litigiosa',
        'asunto de naturaleza litigiosa',
        'caracter litigioso',
        'controversia cuya resolucion compete a los tribunales',
        'tribunales de justicia'
      ],
      score: 1.45
    },
    {
      category: 'cambio_de_regimen',
      label: 'cambio de régimen visible',
      phrases: [
        'criterio unificador',
        'giro jurisprudencial',
        'cambio de criterio',
        'en lo sucesivo',
        'nuevo criterio',
        'de ahora en adelante'
      ],
      score: 1.05
    }
  ];

  const matches = signalDefinitions
    .map((definition) => ({
      ...definition,
      matched: definition.phrases.filter((phrase) => text.includes(normalizeSearchText(phrase)))
    }))
    .filter((entry) => entry.matched.length > 0)
    .sort((left, right) => (
      (right.score * right.matched.length) - (left.score * left.matched.length)
    ));

  if (matches.length === 0) return null;
  const best = matches[0];
  return {
    category: best.category,
    label: best.label,
    matched_terms: best.matched,
    score: Number((best.score + (best.matched.length - 1) * 0.25).toFixed(2))
  };
}

async function fetchMatterStatusSnapshot(params: {
  env: Env;
  query: string;
  focusId: string | null;
}): Promise<MatterStatusSnapshot | null> {
  const queryTokens = filterSpecificTokens(tokenizeSearchText(params.query));
  const queryPhrases = buildQueryPhrases(params.query);
  if (queryTokens.length === 0) return null;

  const broadNeedles = uniqueStrings(queryTokens.slice(0, 5));
  const likeClauses = broadNeedles.map(() => (
    `(LOWER(COALESCE(d.materia, '')) LIKE ? OR LOWER(COALESCE(e.titulo, '')) LIKE ? OR LOWER(COALESCE(e.resumen, '')) LIKE ?)`
  )).join(' OR ');
  const bindings = broadNeedles.flatMap((token) => {
    const needle = `%${token.toLowerCase()}%`;
    return [needle, needle, needle];
  });
  const statusNeedles = ['%litigios%', '%absten%', '%tribunal%', '%pronunciam%', '%en lo sucesivo%'];
  const statusSql = statusNeedles
    .map(() => `CASE WHEN LOWER(COALESCE(d.materia, '')) LIKE ? OR LOWER(COALESCE(e.titulo, '')) LIKE ? OR LOWER(COALESCE(e.resumen, '')) LIKE ? THEN 1 ELSE 0 END`)
    .join(' + ');
  const statusBindings = statusNeedles.flatMap((needle) => [needle, needle, needle]);

  const rows = await params.env.DB.prepare(
    `SELECT
       d.id,
       d.fecha_documento,
       d.materia,
       d.criterio,
       d.numero,
       e.titulo,
       e.resumen,
       e.analisis
     FROM dictamenes d
     LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
     WHERE ${likeClauses}
     ORDER BY (${statusSql}) DESC, COALESCE(d.fecha_documento, d.created_at) DESC
     LIMIT 200`
  ).bind(...bindings, ...statusBindings).all<MatterStatusRow>();

  if (!rows.results || rows.results.length === 0) return null;

  // Etapa 2: Recuperación de candidatos con ranking inicial
  const candidates = (rows.results ?? [])
    .map((row) => {
      const semanticText = buildMatterStatusText(row);
      const matchedTerms = queryTokens.filter((token) => semanticText.includes(token));
      const coverage = queryTokens.length > 0 ? matchedTerms.length / queryTokens.length : 0;
      return { row, coverage, matchedTerms };
    })
    .filter((entry) => entry.coverage >= 0.45)
    .slice(0, 40);

  if (candidates.length === 0) return null;

  // Etapa 3: Hidratación de Atributos y Metadatos para finalistas
  const candidateIds = candidates.map((c) => c.row.id);
  const placeholders = candidateIds.map(() => '?').join(',');

  const [attrsRows, mdRows] = await Promise.all([
    params.env.DB.prepare(
      `SELECT * FROM atributos_juridicos WHERE dictamen_id IN (${placeholders})`
    ).bind(...candidateIds).all<DictamenAttrRow & { dictamen_id: string }>(),
    params.env.DB.prepare(
      `SELECT * FROM dictamen_metadata_doctrinal
       WHERE dictamen_id IN (${placeholders}) AND pipeline_version = 'doctrinal_metadata_v1'`
    ).bind(...candidateIds).all<DictamenDoctrinalMetadataRow & { dictamen_id: string }>()
  ]);

  const attrsMap = new Map((attrsRows.results ?? []).map(r => [r.dictamen_id, r]));
  const mdMap = new Map((mdRows.results ?? []).map(r => [r.dictamen_id, r]));

  const completeCandidates = candidates
    .map(({ row, coverage, matchedTerms }) => {
      const attrs = attrsMap.get(row.id);
      const md = mdMap.get(row.id);
      const fullRow: MatterStatusRow = {
        ...row,
        en_boletin: attrs?.en_boletin ?? null,
        reactivado: attrs?.reactivado ?? null,
        aplicado: attrs?.aplicado ?? null,
        complementado: attrs?.complementado ?? null,
        confirmado: attrs?.confirmado ?? null,
        rol_principal: md?.rol_principal ?? null,
        estado_intervencion_cgr: md?.estado_intervencion_cgr ?? null,
        estado_vigencia: md?.estado_vigencia ?? null,
        reading_role: md?.reading_role ?? null,
        reading_weight: md?.reading_weight ?? null,
        currentness_score: md?.currentness_score ?? null,
        doctrinal_centrality_score: md?.doctrinal_centrality_score ?? null,
        confidence_global: md?.confidence_global ?? null,
        supports_state_current: md?.supports_state_current ?? null,
        signals_litigious_matter: md?.signals_litigious_matter ?? null,
        signals_abstention: md?.signals_abstention ?? null,
        signals_competence_closure: md?.signals_competence_closure ?? null,
      };

      const semanticText = buildMatterStatusText(fullRow);
      const segments = buildMatterStatusSegments(fullRow);
      const phraseMatches = queryPhrases.filter((phrase) => semanticText.includes(phrase));
      const cohesiveSegments = segments.filter((segment) => (
        queryTokens.filter((token) => segment.includes(token)).length >= 2
      )).length;
      const statusSignal = detectMatterStatusSignals(semanticText);
      const dateTs = parseDateToTs(fullRow.fecha_documento);
      const yearsOld = dateTs ? Math.max(0, (Date.now() - dateTs) / (365.25 * 24 * 3600 * 1000)) : 8;
      const recencyBoost = Math.max(0, 1.2 - Math.min(1.2, yearsOld * 0.18));
      const supportBoost = (
        (fullRow.en_boletin ? 0.18 : 0)
        + (fullRow.reactivado ? 0.14 : 0)
        + (fullRow.aplicado ? 0.08 : 0)
        + (fullRow.complementado ? 0.05 : 0)
        + (fullRow.confirmado ? 0.06 : 0)
      );
      const doctrinalBoost = (
        (Number(fullRow.currentness_score ?? 0) * 1.4)
        + (Number(fullRow.reading_weight ?? 0) * 0.95)
        + (Number(fullRow.doctrinal_centrality_score ?? 0) * 0.45)
        + (Number(fullRow.supports_state_current ?? 0) > 0 ? 0.24 : 0)
      );
      const doctrinalPenalty = (
        (Number(fullRow.signals_abstention ?? 0) > 0 && !statusSignal ? 0.2 : 0)
      );
      const score = Number((
        (coverage * 1.75)
        + (Math.min(2, phraseMatches.length) * 0.8)
        + (Math.min(2, cohesiveSegments) * 0.55)
        + (statusSignal?.score ?? 0)
        + recencyBoost
        + supportBoost
        + doctrinalBoost
        - doctrinalPenalty
        + (fullRow.id === params.focusId ? -0.2 : 0)
      ).toFixed(3));

      return {
        row: fullRow,
        matchedTerms,
        phraseMatches,
        cohesiveSegments,
        coverage,
        statusSignal,
        score
      };
    })
    .filter((entry) => (
      entry.matchedTerms.length >= Math.min(2, queryTokens.length)
      && entry.coverage >= 0.45
      && (entry.phraseMatches.length >= 1 || entry.cohesiveSegments >= 1)
      && (
        entry.statusSignal
        || Number(entry.row.currentness_score ?? 0) >= 0.62
        || Number(entry.row.supports_state_current ?? 0) > 0
      )
    ))
    .sort((left, right) => (
      right.score - left.score
      || (parseDateToTs(right.row.fecha_documento) ?? 0) - (parseDateToTs(left.row.fecha_documento) ?? 0)
      || left.row.id.localeCompare(right.row.id)
    ));

  const best = completeCandidates[0];
  if (!best || best.score < 2.45) return null;

  const summary = pickText(best.row.resumen) || pickText(best.row.analisis) || pickText(best.row.materia);
  const statusCategory = (() => {
    if (best.statusSignal?.category) return best.statusSignal.category;
    if (Number(best.row.signals_abstention ?? 0) > 0) return 'abstencion_competencial' as const;
    if (Number(best.row.signals_litigious_matter ?? 0) > 0) return 'materia_litigiosa' as const;
    if (Number(best.row.signals_competence_closure ?? 0) > 0) return 'cambio_de_regimen' as const;
    return 'criterio_operativo_actual' as const;
  })();
  const statusLabel = best.statusSignal?.label
    ?? (best.row.estado_intervencion_cgr === 'abstencion_visible'
      ? 'abstención competencial visible'
      : best.row.estado_intervencion_cgr === 'materia_litigiosa'
        ? 'materia litigiosa'
        : best.row.reading_role === 'estado_actual'
          ? 'estado actual de la materia'
          : 'criterio operativo actual');
  return {
    dictamen_id: best.row.id,
    title: pickText(best.row.titulo) || best.row.id,
    date: best.row.fecha_documento,
    numero: best.row.numero,
    materia: best.row.materia,
    criterio: best.row.criterio,
    status_category: statusCategory,
    status_label: statusLabel,
    summary,
    why_this_status: `Se prioriza como estado actual porque mantiene coincidencia suficiente con la consulta y además proyecta ${statusLabel.toLowerCase()}.`,
    confidence: Math.max(0.55, Math.min(0.98, Number(((best.score + Number(best.row.confidence_global ?? 0)) / 5.1).toFixed(2)))),
    matched_terms: uniqueStrings([
      ...best.matchedTerms,
      ...(best.statusSignal?.matched_terms ?? []),
      ...(best.row.rol_principal ? [best.row.rol_principal] : []),
      ...(best.row.reading_role ? [best.row.reading_role] : [])
    ]).slice(0, 6)
  };
}

async function buildGuidedDoctrineFlow(env: Env, options: GuidedFlowOptions) {
  const search = await buildDoctrineSearch(env, {
    q: options.q,
    limit: options.limit ?? 4
  });
  const queryIntent = sanitizeGuidedIntent('query_intent' in search.overview ? search.overview.query_intent ?? null : null);
  const querySubtopic = sanitizeGuidedSubtopic('query_subtopic' in search.overview ? search.overview.query_subtopic ?? null : null);
  const { focusLine, families } = splitGuidedSearch(search, options.q, querySubtopic);

  if (!focusLine) {
    return {
      overview: {
        query: options.q,
        query_interpreted: search.overview.query_interpreted ?? null,
        query_intent: queryIntent,
        query_subtopic: querySubtopic,
        searchMode: search.overview.searchMode,
        navigation_mode: 'guided',
        recommended_entry: 'focus_directo',
        ambiguity_visible: false,
        total_families: 0
      },
      focus_directo: null,
      estado_actual_materia: null,
      familias_candidatas: [],
      ruta_temporal_inicial: null,
      suggested_steps: []
    };
  }

  const focusId = focusLine.representative_dictamen_id;
  const contextById = await fetchDictamenContextsBatch(env, [focusId]);
  const focusContext = contextById[focusId];
  const focusTitle = focusLine.key_dictamenes.find((item) => item.id === focusId)?.titulo
    ?? ('semantic_anchor_dictamen' in focusLine ? focusLine.semantic_anchor_dictamen?.titulo : null)
    ?? focusLine.title;
  const matterStatus = await fetchMatterStatusSnapshot({
    env,
    query: options.q,
    focusId
  });
  const temporalRoute = buildTemporalRoute({
    focusId,
    focusDate: focusContext?.meta?.fecha_documento ?? null,
    incoming: focusContext?.incoming ?? [],
    outgoing: focusContext?.outgoing ?? []
  });

  return {
    overview: {
      query: options.q,
      query_interpreted: search.overview.query_interpreted ?? null,
      query_intent: queryIntent,
      query_subtopic: querySubtopic,
      searchMode: search.overview.searchMode,
      navigation_mode: 'guided',
      recommended_entry: matterStatus ? 'estado_actual_materia' : 'focus_directo',
      ambiguity_visible: families.length > 1,
      total_families: families.length
    },
    focus_directo: {
      dictamen_id: focusId,
      title: focusTitle,
      date: focusContext.meta?.fecha_documento ?? focusLine.time_span.from ?? null,
      materia: focusContext.meta?.materia ?? search.overview.materiaEvaluated ?? null,
      criterio: focusContext.meta?.criterio ?? null,
      numero: focusContext.meta?.numero ?? null,
      summary: focusContext.enrichment?.resumen ?? focusLine.summary,
      why_this_focus: focusLine.query_match_reason ?? focusLine.summary,
      doctrinal_state: focusContext.doctrinalMetadata?.estado_vigencia ?? temporalRoute.currentness_label,
      doctrinal_metadata: focusContext.doctrinalMetadata
        ? {
            rol_principal: focusContext.doctrinalMetadata.rol_principal,
            estado_intervencion_cgr: focusContext.doctrinalMetadata.estado_intervencion_cgr,
            estado_vigencia: focusContext.doctrinalMetadata.estado_vigencia,
            reading_role: focusContext.doctrinalMetadata.reading_role,
            reading_weight: focusContext.doctrinalMetadata.reading_weight,
            confidence_global: focusContext.doctrinalMetadata.confidence_global
          }
        : null,
      juridical_attributes: buildFocusAttributes(focusContext.attrs),
      incoming_relations_count: focusContext.incoming.length,
      outgoing_relations_count: focusContext.outgoing.length
    },
    estado_actual_materia: matterStatus,
    familias_candidatas: families,
    ruta_temporal_inicial: temporalRoute,
    suggested_steps: buildGuidedSteps(families.length > 0)
  };
}

async function fetchFamilyRelationEdges(env: Env, dictamenIds: string[]) {
  if (dictamenIds.length === 0) return [];
  const placeholders = dictamenIds.map(() => '?').join(',');

  // Etapa 1: Recuperación de relaciones de forma LEAN
  const result = await env.DB.prepare(
    `SELECT
       r.dictamen_origen_id AS source_id,
       r.dictamen_destino_id AS target_id,
       r.tipo_accion,
       COALESCE(d.fecha_documento, d.created_at) AS source_date
     FROM dictamen_relaciones_juridicas r
     LEFT JOIN dictamenes d ON d.id = r.dictamen_origen_id
     WHERE r.dictamen_origen_id IN (${placeholders})
        OR r.dictamen_destino_id IN (${placeholders})
     ORDER BY COALESCE(d.fecha_documento, d.created_at) ASC, r.rowid ASC
     LIMIT 120`
  ).bind(...dictamenIds, ...dictamenIds).all<Omit<FamilyRelationEdgeRow, 'source_title' | 'target_title'>>();

  const edges = result.results ?? [];
  if (edges.length === 0) return [];

  // Etapa 2: Hidratación de Títulos (Batch)
  const uniqueIds = Array.from(new Set([
    ...edges.map(e => e.source_id),
    ...edges.map(e => e.target_id)
  ]));

  const titlePlaceholders = uniqueIds.map(() => '?').join(',');
  const titlesResult = await env.DB.prepare(
    `SELECT dictamen_id, titulo
     FROM enriquecimiento
     WHERE dictamen_id IN (${titlePlaceholders})`
  ).bind(...uniqueIds).all<{ dictamen_id: string, titulo: string }>();

  const titleMap = new Map((titlesResult.results ?? []).map((r) => [r.dictamen_id, r.titulo]));

  // Reconstrucción final con semántica preservada
  return edges.map((e) => ({
    ...e,
    source_title: titleMap.get(e.source_id) ?? null,
    target_title: titleMap.get(e.target_id) ?? null
  })) as FamilyRelationEdgeRow[];
}

async function buildGuidedDoctrineFamily(env: Env, options: GuidedFamilyExploreOptions) {
  const search = await buildDoctrineSearch(env, {
    q: options.q,
    limit: options.limit ?? 4
  });
  const queryIntent = sanitizeGuidedIntent('query_intent' in search.overview ? search.overview.query_intent ?? null : null);
  const querySubtopic = sanitizeGuidedSubtopic('query_subtopic' in search.overview ? search.overview.query_subtopic ?? null : null);
  const { focusLine, families, familySourceLines } = splitGuidedSearch(search, options.q, querySubtopic);
  const selectedLine = familySourceLines.find((line) => buildFamilyId(line) === options.familyId) ?? null;

  if (!selectedLine) {
    return {
      overview: {
        query: options.q,
        query_interpreted: search.overview.query_interpreted ?? null,
        query_intent: queryIntent,
        query_subtopic: querySubtopic,
        navigation_mode: 'guided_family',
        family_found: false
      },
      breadcrumb: [],
      family: null,
      timeline: {
        dictamenes: [],
        relation_edges: []
      },
      sibling_families: families
    };
  }

  const keyIds = [...new Set(selectedLine.key_dictamenes.map((item) => item.id))];
  const contextById = await fetchDictamenContextsBatch(env, keyIds);
  const timelineNodes = selectedLine.key_dictamenes.map((item) => {
    const context = contextById[item.id];
    const temporalRoute = buildTemporalRoute({
      focusId: item.id,
      focusDate: context?.meta?.fecha_documento ?? item.fecha ?? null,
      incoming: context?.incoming ?? [],
      outgoing: context?.outgoing ?? []
    });
    return {
      dictamen_id: item.id,
      title: item.titulo,
      date: item.fecha,
      rol_en_linea: item.rol_en_linea,
      summary: context?.enrichment?.resumen ?? null,
      juridical_attributes: buildFocusAttributes(context?.attrs ?? null),
      doctrinal_state: context?.doctrinalMetadata?.estado_vigencia ?? temporalRoute.currentness_label,
      doctrinal_metadata: context?.doctrinalMetadata
        ? {
            rol_principal: context.doctrinalMetadata.rol_principal,
            estado_vigencia: context.doctrinalMetadata.estado_vigencia,
            reading_role: context.doctrinalMetadata.reading_role,
            reading_weight: context.doctrinalMetadata.reading_weight
          }
        : null,
      incoming_relations_count: context?.incoming.length ?? 0,
      outgoing_relations_count: context?.outgoing.length ?? 0
    };
  }).sort((left, right) => String(left.date ?? '').localeCompare(String(right.date ?? '')));

  const familyEdgesRaw = await fetchFamilyRelationEdges(env, keyIds);
  const familyIdSet = new Set(keyIds);
  const relationEdges = familyEdgesRaw.map((edge) => ({
    source_id: edge.source_id,
    source_title: edge.source_title ?? edge.source_id,
    target_id: edge.target_id,
    target_title: edge.target_title ?? edge.target_id,
    relation_type: edge.tipo_accion,
    relation_effect: classifyRelationEffect(edge.tipo_accion),
    relation_label: relationEffectLabel(classifyRelationEffect(edge.tipo_accion)),
    source_date: edge.source_date,
    inside_family: familyIdSet.has(edge.source_id) && familyIdSet.has(edge.target_id)
  }));

  return {
    overview: {
      query: options.q,
      query_interpreted: search.overview.query_interpreted ?? null,
      query_intent: queryIntent,
      query_subtopic: querySubtopic,
      navigation_mode: 'guided_family',
      family_found: true
    },
    breadcrumb: [
      {
        step: 'consulta',
        label: options.q
      },
      ...(focusLine ? [{
        step: 'foco_directo',
        label: focusLine.title,
        dictamen_id: focusLine.representative_dictamen_id
      }] : []),
      {
        step: 'familia',
        label: selectedLine.title,
        family_id: options.familyId
      }
    ],
    family: {
      family_id: options.familyId,
      label: selectedLine.title,
      representative_dictamen_id: selectedLine.representative_dictamen_id,
      representative_title: selectedLine.key_dictamenes.find((item) => item.id === selectedLine.representative_dictamen_id)?.titulo ?? selectedLine.title,
      doctrinal_status: selectedLine.graph_doctrinal_status.status,
      doctrinal_status_summary: selectedLine.graph_doctrinal_status.summary,
      visible_time_span: selectedLine.time_span,
      why_this_family: selectedLine.query_match_reason ?? selectedLine.summary,
      reading_priority_reason: selectedLine.reading_priority_reason,
      pivot_dictamen: selectedLine.pivot_dictamen ?? null
    },
    timeline: {
      dictamenes: timelineNodes,
      relation_edges: relationEdges
    },
    sibling_families: families.filter((family) => family.family_id !== options.familyId)
  };
}

export { buildGuidedDoctrineFlow, buildGuidedDoctrineFamily };
