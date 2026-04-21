import { buildDoctrineSearch } from './doctrineLines';
import { classifyRelationEffect, relationEffectLabel, type GraphDoctrinalStatus, type RelationEffectCategory } from './doctrinalGraph';
import { loadDoctrinalMetadataByIds } from './doctrinalMetadata';
import type { QueryIntentDetection } from './queryUnderstanding/queryIntent';
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
  querySubtopic: any | null;
}): SearchLine[] {
  const queryTokens = filterSpecificTokens(tokenizeSearchText(params.query));

  const scored = params.lines.map((line) => {
    const semanticText = normalizeSearchText(buildFamilySemanticText(line));
    const semanticTokens = new Set(tokenizeSearchText(buildFamilySemanticText(line)));
    const semanticSegments = buildFamilySemanticSegments(line);
    const matchedQueryTokens = queryTokens.filter((token) => semanticTokens.has(token));
    const anchorCount = matchedQueryTokens.length;
    const cohesiveQuerySegments = semanticSegments.filter((segment) => (
      queryTokens.filter((token) => segment.includes(token)).length >= 2
    )).length;
    const cohesiveAnchorSegments = cohesiveQuerySegments;
    const titleTokens = filterSpecificTokens(tokenizeSearchText(line.title));
    const titleAnchorCount = titleTokens.filter((token) => (
      matchedQueryTokens.includes(token)
    )).length;
    const descriptorAnchorCount = line.top_descriptores_AI
      .flatMap((descriptor) => filterSpecificTokens(tokenizeSearchText(descriptor)))
      .filter((token, index, collection) => collection.indexOf(token) === index)
      .filter((token) => matchedQueryTokens.includes(token))
      .length;
    const queryCoverage = queryTokens.length > 0 ? matchedQueryTokens.length / queryTokens.length : 0;
    const score = Number((
      (queryCoverage * 1.55)
      + (Math.min(2, cohesiveQuerySegments) * 0.32)
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
      matchedSubtopicTokens: []
    };
  }).sort((left, right) => (
    right.score - left.score
    || right.anchorCount - left.anchorCount
    || right.matchedQueryTokens.length - left.matchedQueryTokens.length
    || left.line.title.localeCompare(right.line.title)
  ));

  const constrained = scored.filter((entry) => {
    return (
      (
        entry.matchedQueryTokens.length >= 2
        && entry.cohesiveQuerySegments >= 1
      )
      || entry.score >= 1.05
    );
  });

  const selected = constrained.length > 0
    ? constrained
    : scored.filter((entry) => (
      entry.score >= 0.8
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

export function splitGuidedSearch(search: SearchResponse, query: string, querySubtopic: any | null) {
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

export async function fetchDictamenFocusContext(env: Env, dictamenId: string) {
  const meta = await env.DB.prepare(
    `SELECT id, fecha_documento, materia, criterio, numero
     FROM dictamenes
     WHERE id = ?`
  ).bind(dictamenId).first<DictamenMetaRow>();

  const enrichment = await env.DB.prepare(
    `SELECT titulo, resumen
     FROM enriquecimiento
     WHERE dictamen_id = ?`
  ).bind(dictamenId).first<DictamenEnrichmentRow>();

  const attrs = await env.DB.prepare(
    `SELECT
       es_nuevo,
       es_relevante,
       en_boletin,
       recurso_proteccion,
       aclarado,
       alterado,
       aplicado,
       complementado,
       confirmado,
       reactivado,
       reconsiderado,
       reconsiderado_parcialmente,
       caracter
     FROM atributos_juridicos
     WHERE dictamen_id = ?`
  ).bind(dictamenId).first<DictamenAttrRow>();

  const incoming = await env.DB.prepare(
    `SELECT
       r.dictamen_origen_id AS related_id,
       r.tipo_accion,
       COALESCE(d.fecha_documento, d.created_at) AS fecha_documento,
       e.titulo
     FROM dictamen_relaciones_juridicas r
     LEFT JOIN dictamenes d ON d.id = r.dictamen_origen_id
     LEFT JOIN enriquecimiento e ON e.dictamen_id = r.dictamen_origen_id
     WHERE r.dictamen_destino_id = ?
     ORDER BY COALESCE(d.fecha_documento, d.created_at) DESC, r.rowid DESC
     LIMIT 20`
  ).bind(dictamenId).all<RelationRow>();

  const outgoing = await env.DB.prepare(
    `SELECT
       r.dictamen_destino_id AS related_id,
       r.tipo_accion,
       COALESCE(d.fecha_documento, d.created_at) AS fecha_documento,
       e.titulo
     FROM dictamen_relaciones_juridicas r
     LEFT JOIN dictamenes d ON d.id = r.dictamen_destino_id
     LEFT JOIN enriquecimiento e ON e.dictamen_id = r.dictamen_destino_id
     WHERE r.dictamen_origen_id = ?
     ORDER BY COALESCE(d.fecha_documento, d.created_at) DESC, r.rowid DESC
     LIMIT 20`
  ).bind(dictamenId).all<RelationRow>();

  const doctrinalMetadataMap = await loadDoctrinalMetadataByIds(env, [dictamenId]);
  const doctrinalMetadata = doctrinalMetadataMap[dictamenId] ?? null;

  return {
    meta: meta ?? null,
    enrichment: enrichment ?? null,
    attrs: attrs ?? null,
    doctrinalMetadata,
    incoming: incoming.results ?? [],
    outgoing: outgoing.results ?? []
  };
}

export function buildTemporalRoute(params: {
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

export function buildFocusAttributes(attrs: DictamenAttrRow | null) {
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

export async function fetchMatterStatusSnapshot(params: {
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
       e.analisis,
       a.en_boletin,
      a.reactivado,
      a.aplicado,
      a.complementado,
      a.confirmado,
      md.rol_principal,
      md.estado_intervencion_cgr,
      md.estado_vigencia,
      md.reading_role,
      md.reading_weight,
      md.currentness_score,
      md.doctrinal_centrality_score,
      md.confidence_global,
      md.supports_state_current,
      md.signals_litigious_matter,
      md.signals_abstention,
      md.signals_competence_closure
     FROM dictamenes d
     LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
     LEFT JOIN atributos_juridicos a ON a.dictamen_id = d.id
     LEFT JOIN dictamen_metadata_doctrinal md
       ON md.dictamen_id = d.id
      AND md.pipeline_version = 'doctrinal_metadata_v1'
     WHERE ${likeClauses}
     ORDER BY (${statusSql}) DESC, COALESCE(d.fecha_documento, d.created_at) DESC
     LIMIT 200`
  ).bind(...bindings, ...statusBindings).all<MatterStatusRow>();

  const nowTs = Date.now();
  const candidates = (rows.results ?? [])
    .map((row) => {
      const semanticText = buildMatterStatusText(row);
      const segments = buildMatterStatusSegments(row);
      const matchedTerms = queryTokens.filter((token) => semanticText.includes(token));
      const phraseMatches = queryPhrases.filter((phrase) => semanticText.includes(phrase));
      const cohesiveSegments = segments.filter((segment) => (
        queryTokens.filter((token) => segment.includes(token)).length >= 2
      )).length;
      const coverage = queryTokens.length > 0 ? matchedTerms.length / queryTokens.length : 0;
      const statusSignal = detectMatterStatusSignals(semanticText);
      const dateTs = parseDateToTs(row.fecha_documento);
      const yearsOld = dateTs ? Math.max(0, (nowTs - dateTs) / (365.25 * 24 * 3600 * 1000)) : 8;
      const recencyBoost = Math.max(0, 1.2 - Math.min(1.2, yearsOld * 0.18));
      const supportBoost = (
        (row.en_boletin ? 0.18 : 0)
        + (row.reactivado ? 0.14 : 0)
        + (row.aplicado ? 0.08 : 0)
        + (row.complementado ? 0.05 : 0)
        + (row.confirmado ? 0.06 : 0)
      );
      const doctrinalBoost = (
        (Number(row.currentness_score ?? 0) * 1.4)
        + (Number(row.reading_weight ?? 0) * 0.95)
        + (Number(row.doctrinal_centrality_score ?? 0) * 0.45)
        + (Number(row.supports_state_current ?? 0) > 0 ? 0.24 : 0)
      );
      const doctrinalPenalty = (
        (Number(row.signals_abstention ?? 0) > 0 && !statusSignal ? 0.2 : 0)
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
        + (row.id === params.focusId ? -0.2 : 0)
      ).toFixed(3));

      return {
        row,
        score,
        matchedTerms,
        statusSignal
      };
    })
    .sort((left, right) => right.score - left.score || left.row.id.localeCompare(right.row.id));

  const best = candidates[0];
  if (!best || best.score < 0.9) return null;

  return {
    dictamen_id: best.row.id,
    title: best.row.titulo ?? best.row.materia ?? 'Sin título',
    date: best.row.fecha_documento,
    numero: best.row.numero,
    materia: best.row.materia,
    criterio: best.row.criterio,
    status_category: best.statusSignal?.category ?? 'criterio_operativo_actual',
    status_label: best.statusSignal?.label ?? 'criterio operativo visible',
    summary: best.row.resumen ?? '',
    why_this_status: best.row.analisis ?? '',
    confidence: Math.min(0.99, best.score / 6),
    matched_terms: best.matchedTerms
  };
}

export async function buildGuidedFlow(params: {
  env: Env;
  query: string;
}) {
  const search = await buildDoctrineSearch(params.env, { q: params.query, limit: 12 });
  const families = splitGuidedSearch(search, params.query, null);
  const steps = buildGuidedSteps(families.families.length > 0);

  return {
    families,
    steps
  };
}
