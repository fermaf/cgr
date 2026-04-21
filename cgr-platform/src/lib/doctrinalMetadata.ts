import { analyzeDoctrinalMetadata, DOCTRINAL_METADATA_MODEL } from '../clients/mistral';
import { classifyRelationEffect } from './doctrinalGraph';
import type { DictamenRaw, Env } from '../types';
import { logDictamenEvent } from '../storage/d1';

export const DOCTRINAL_METADATA_PIPELINE_VERSION = 'doctrinal_metadata_v1';

export type DoctrinalRole =
  | 'nucleo_doctrinal'
  | 'aplicacion'
  | 'aclaracion'
  | 'complemento'
  | 'ajuste'
  | 'limitacion'
  | 'desplazamiento'
  | 'reactivacion'
  | 'cierre_competencial'
  | 'materia_litigiosa'
  | 'abstencion'
  | 'criterio_operativo_actual'
  | 'hito_historico'
  | 'contexto_no_central';

export type CgrInterventionState =
  | 'intervencion_normal'
  | 'intervencion_condicionada'
  | 'intervencion_residual'
  | 'abstencion_visible'
  | 'materia_litigiosa'
  | 'sin_senal_clara';

export type DoctrinalValidityState =
  | 'vigente_visible'
  | 'vigente_tensionado'
  | 'vigente_en_revision'
  | 'desplazado_parcialmente'
  | 'desplazado'
  | 'valor_historico'
  | 'indeterminado';

export type ReadingRole =
  | 'entrada_semantica'
  | 'entrada_doctrinal'
  | 'estado_actual'
  | 'ancla_historica'
  | 'pivote_de_cambio'
  | 'soporte_contextual';

export interface DictamenMetadataDoctrinalRow {
  dictamen_id: string;
  pipeline_version: string;
  computed_at: string;
  materia_base: string | null;
  tema_canonico: string | null;
  subtema_canonico: string | null;
  rol_principal: DoctrinalRole;
  roles_secundarios_json: string | null;
  estado_intervencion_cgr: CgrInterventionState;
  estado_vigencia: DoctrinalValidityState;
  reading_role: ReadingRole;
  reading_weight: number;
  currentness_score: number;
  historical_significance_score: number;
  doctrinal_centrality_score: number;
  shift_intensity_score: number;
  family_eligibility_score: number;
  drift_risk_score: number;
  supports_state_current: number;
  signals_litigious_matter: number;
  signals_abstention: number;
  signals_competence_closure: number;
  signals_operational_rule: number;
  anchor_norma_principal: string | null;
  anchor_dictamen_referido: string | null;
  evidence_summary_json: string | null;
  confidence_global: number;
  manual_review_status: string;
  source_snapshot_version: string | null;
  created_at: string;
  updated_at: string;
}

const VALID_DOCTRINAL_ROLES = new Set<DoctrinalRole>([
  'nucleo_doctrinal',
  'aplicacion',
  'aclaracion',
  'complemento',
  'ajuste',
  'limitacion',
  'desplazamiento',
  'reactivacion',
  'cierre_competencial',
  'materia_litigiosa',
  'abstencion',
  'criterio_operativo_actual',
  'hito_historico',
  'contexto_no_central'
]);

const VALID_CGR_INTERVENTION_STATES = new Set<CgrInterventionState>([
  'intervencion_normal',
  'intervencion_condicionada',
  'intervencion_residual',
  'abstencion_visible',
  'materia_litigiosa',
  'sin_senal_clara'
]);

const VALID_DOCTRINAL_VALIDITY_STATES = new Set<DoctrinalValidityState>([
  'vigente_visible',
  'vigente_tensionado',
  'vigente_en_revision',
  'desplazado_parcialmente',
  'desplazado',
  'valor_historico',
  'indeterminado'
]);

const VALID_READING_ROLES = new Set<ReadingRole>([
  'entrada_semantica',
  'entrada_doctrinal',
  'estado_actual',
  'ancla_historica',
  'pivote_de_cambio',
  'soporte_contextual'
]);

type DictamenBaseRow = {
  dictamen_id: string;
  numero: string | null;
  fecha_documento: string | null;
  materia: string | null;
  criterio: string | null;
  titulo: string | null;
  resumen: string | null;
  analisis: string | null;
  etiquetas_json: string | null;
  es_relevante: number | null;
  en_boletin: number | null;
  recurso_proteccion: number | null;
  aclarado: number | null;
  alterado: number | null;
  aplicado: number | null;
  complementado: number | null;
  confirmado: number | null;
  reactivado: number | null;
  reconsiderado: number | null;
  reconsiderado_parcialmente: number | null;
  caracter: string | null;
};

type RelationAggregateRow = {
  direction: 'incoming' | 'outgoing';
  tipo_accion: string;
  total: number;
  latest_related_date: string | null;
};

type LegalSourceRow = {
  tipo_norma: string | null;
  numero: string | null;
  total: number;
};

type SecondaryRole = {
  rol: DoctrinalRole;
  confidence: number;
};

type DoctrinalEvidenceInput = {
  evidence_type: string;
  signal_type: string;
  signal_value: string;
  score: number;
  confidence: number;
  source_table: string;
  source_locator: string;
  snippet: string | null;
  detected_by: string;
};

type ReprocessOptions = {
  dictamenIds?: string[];
  limit?: number;
  offset?: number;
  sourceSnapshotVersion?: string;
};

type LoadDoctrinalMetadataOptions = {
  computeMissing?: boolean;
};

type ReprocessResult = {
  processed: number;
  dictamen_ids: string[];
  pipeline_version: string;
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Number(clamp01(value).toFixed(3));
}

function normalizeDoctrinalRole(value: unknown): DoctrinalRole | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim() as DoctrinalRole;
  return VALID_DOCTRINAL_ROLES.has(normalized) ? normalized : null;
}

function canonicalizePrimaryDoctrinalRole(params: {
  role: DoctrinalRole;
  intervention: CgrInterventionState;
  validity: DoctrinalValidityState;
  readingRole: ReadingRole;
  supportsStateCurrent: number;
}): DoctrinalRole {
  const { role, intervention, validity, readingRole, supportsStateCurrent } = params;
  if (role !== 'limitacion') return role;

  if (intervention === 'abstencion_visible') return 'abstencion';
  if (intervention === 'materia_litigiosa') return 'materia_litigiosa';
  if (readingRole === 'pivote_de_cambio' || ['desplazado', 'desplazado_parcialmente', 'vigente_en_revision'].includes(validity)) {
    return 'ajuste';
  }
  if (readingRole === 'entrada_doctrinal' || readingRole === 'estado_actual' || supportsStateCurrent > 0) {
    return 'aclaracion';
  }
  return 'aclaracion';
}

function normalizeInterventionState(value: unknown): CgrInterventionState | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim() as CgrInterventionState;
  return VALID_CGR_INTERVENTION_STATES.has(normalized) ? normalized : null;
}

function normalizeValidityState(value: unknown): DoctrinalValidityState | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim() as DoctrinalValidityState;
  return VALID_DOCTRINAL_VALIDITY_STATES.has(normalized) ? normalized : null;
}

function normalizeReadingRole(value: unknown): ReadingRole | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toLowerCase();
  const aliasMap: Record<string, ReadingRole> = {
    aclaracion: 'entrada_doctrinal',
    aclaratorio: 'entrada_doctrinal',
    aclara_doctrina: 'entrada_doctrinal',
    aclara_doctrinal: 'entrada_doctrinal',
    complemento: 'entrada_doctrinal'
  };
  const normalized = (aliasMap[raw] ?? raw) as ReadingRole;
  return VALID_READING_ROLES.has(normalized) ? normalized : null;
}

function normalizeSecondaryRoles(values: unknown[]): DoctrinalRole[] {
  const unique = new Set<DoctrinalRole>();
  for (const value of values) {
    const normalized = normalizeDoctrinalRole(value);
    if (normalized) unique.add(normalized);
  }
  return [...unique];
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function formatNormaLabel(row: LegalSourceRow | null | undefined): string | null {
  if (!row?.tipo_norma) return null;
  const numero = pickText(row.numero);
  return numero ? `${pickText(row.tipo_norma)} ${numero}` : pickText(row.tipo_norma);
}

function buildRecentnessSignal(value: string | null | undefined, windowYears = 6): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 0;
  const ageMs = Math.max(Date.now() - parsed, 0);
  const windowMs = windowYears * 365.25 * 24 * 60 * 60 * 1000;
  return roundScore(1 - Math.min(1, ageMs / windowMs));
}

function inferCanonicalTopics(base: DictamenBaseRow) {
  const materia = pickText(base.materia);
  const etiquetas = parseJsonArray(base.etiquetas_json);
  const canonicalTopic = materia || etiquetas[0] || null;
  const canonicalSubtopic = etiquetas[0] ?? null;
  const visibleTopic = etiquetas.slice(0, 4);
  return {
    materiaBase: materia || pickText(base.criterio) || null,
    temaCanonico: canonicalTopic,
    subtemaCanonico: canonicalSubtopic,
    temaOperativoVisible: visibleTopic.length > 0 ? visibleTopic : canonicalTopic ? [canonicalTopic] : []
  };
}

function detectTextualSignals(base: DictamenBaseRow) {
  const text = normalizeSearchText([
    pickText(base.materia),
    pickText(base.titulo),
    pickText(base.resumen),
    pickText(base.analisis)
  ].join(' '));

  const matches = (phrases: string[]) => phrases.filter((phrase) => text.includes(normalizeSearchText(phrase)));

  const abstentionMatches = matches([
    'se abstiene de intervenir',
    'corresponde abstenerse',
    'no corresponde emitir pronunciamiento',
    'no intervendra',
    'se abstendra de resolver',
    'abstenerse de resolver'
  ]);

  const litigiousMatches = matches([
    'materia litigiosa',
    'ha devenido en litigiosa',
    'caracter litigioso',
    'competencia de los tribunales',
    'tribunales de justicia'
  ]);

  const competenceMatches = matches([
    'cierre competencial',
    'agotada la competencia',
    'sin competencia para intervenir',
    'fuera del ambito de competencia'
  ]);

  const operationalMatches = matches([
    'en lo sucesivo',
    'nuevo criterio',
    'criterio vigente',
    'se confirma el criterio',
    'regla aplicable',
    'de ahora en adelante'
  ]);

  const clarificationMatches = matches([
    'aclara',
    'se aclara',
    'precisa',
    'se precisa',
    'determina el alcance',
    'interpreta',
    'lineamientos',
    'criterios del proceso',
    'instrucciones sobre'
  ]);

  const complementMatches = matches([
    'se complementa',
    'sin perjuicio de que se complementa',
    'complementa en los terminos',
    'complementa el dictamen',
    'agrega que',
    'complementario'
  ]);

  const instructionMatches = matches([
    'imparte instrucciones',
    'lineamientos',
    'criterios',
    'debe',
    'corresponde',
    'instrucciones sobre'
  ]);

  return {
    abstentionMatches,
    litigiousMatches,
    competenceMatches,
    operationalMatches,
    clarificationMatches,
    complementMatches,
    instructionMatches
  };
}

function buildDeterministicRoleOverrides(params: {
  base: DictamenBaseRow;
  heuristic: DictamenMetadataDoctrinalRow;
  llm: Record<string, unknown> | null;
}) {
  const materia = normalizeSearchText([
    pickText(params.base.materia),
    pickText(params.base.titulo),
    pickText(params.base.resumen),
    pickText(params.base.analisis)
  ].join(' '));
  const hasComplement = /\bse complementa\b|\bcomplementa\b|\bsin perjuicio de que se complementa\b/.test(materia);
  const hasClarification = /\baclara\b|\bse aclara\b|\bprecisa\b|\bse precisa\b|\blineamientos\b|\binstrucciones sobre\b/.test(materia);
  const hasInstructionFrame = /\bimparte instrucciones\b|\blineamientos\b|\bcriterios\b/.test(materia);
  const rejectsReconsideration = /\bno accede a la solicitud de reconsideracion\b|\bdesestima la solicitud de reconsideracion\b|\bse rechaza la reconsideracion\b/.test(materia);
  const hasGeneralRule = /\ben los terminos que se indican\b|\bcon las limitaciones que se indican\b|\bdebe\b|\bcorresponde\b/.test(materia);
  const hasAbstentionFrame = /\bse abstiene\b|\bse abstendra\b|\bno corresponde\b|\bno compete\b|\bno compete a esta contraloria\b|\bno corresponde que esta contraloria\b|\bse abstiene de tomar razon\b|\bse abstiene de dar curso\b|\brestituye sin tramitar\b/.test(materia);
  const hasExclusiveCompetenceFrame = /\bcompetencia exclusiva\b|\batribuciones exclusivas\b|\bcorresponde exclusivamente\b|\bservicio electoral\b|\bsuperintendencia de seguridad social\b|\btribunales de justicia\b/.test(materia);
  const hasLitigiousFrame = /\blitigios[ao]\b|\bdevino en litigiosa\b|\bha devenido en litigiosa\b|\bjuicios?\b|\bcausas judiciales\b|\bsede contenciosa\b/.test(materia);

  const override: {
    role?: DoctrinalRole;
    readingRole?: ReadingRole;
    validity?: DoctrinalValidityState;
    intervention?: CgrInterventionState;
    confidenceDelta?: number;
    reason?: string;
  } = {};

  const llmRole = typeof params.llm?.rol_principal === 'string' ? params.llm.rol_principal : null;

  if ((hasComplement || (rejectsReconsideration && hasComplement)) && llmRole === 'aplicacion') {
    override.role = 'complemento';
    override.readingRole = 'entrada_doctrinal';
    override.reason = 'override_complemento_textual';
    override.confidenceDelta = 0.06;
    return override;
  }

  if (hasClarification && llmRole === 'aplicacion' && !hasComplement) {
    override.role = 'aclaracion';
    override.readingRole = 'entrada_doctrinal';
    override.reason = 'override_aclaracion_textual';
    override.confidenceDelta = 0.05;
    return override;
  }

  if (
    hasInstructionFrame
    && hasGeneralRule
    && llmRole === 'aplicacion'
    && params.heuristic.currentness_score >= 0.58
    && params.heuristic.doctrinal_centrality_score >= 0.3
  ) {
    override.role = 'criterio_operativo_actual';
    override.readingRole = 'estado_actual';
    override.validity = params.heuristic.estado_vigencia === 'indeterminado'
      ? 'vigente_visible'
      : params.heuristic.estado_vigencia;
    override.reason = 'override_regla_operativa_general';
    override.confidenceDelta = 0.08;
    return override;
  }

  if (
    llmRole === 'aplicacion'
    && params.heuristic.estado_intervencion_cgr === 'abstencion_visible'
    && (
      hasAbstentionFrame
      || hasGeneralRule
      || hasExclusiveCompetenceFrame
      || params.heuristic.reading_role === 'entrada_doctrinal'
    )
  ) {
    override.role = 'abstencion';
    override.intervention = 'abstencion_visible';
    override.readingRole = (
      hasGeneralRule
      || hasExclusiveCompetenceFrame
      || params.heuristic.currentness_score >= 0.56
    )
      ? 'entrada_doctrinal'
      : 'soporte_contextual';
    override.validity = params.heuristic.estado_vigencia === 'indeterminado'
      ? (override.readingRole === 'entrada_doctrinal' ? 'vigente_visible' : 'vigente_tensionado')
      : params.heuristic.estado_vigencia;
    override.reason = 'override_abstencion_visible_textual';
    override.confidenceDelta = 0.07;
    return override;
  }

  if (
    llmRole === 'aplicacion'
    && params.heuristic.estado_intervencion_cgr === 'materia_litigiosa'
    && (
      hasLitigiousFrame
      || hasExclusiveCompetenceFrame
      || hasGeneralRule
    )
  ) {
    override.role = 'materia_litigiosa';
    override.intervention = 'materia_litigiosa';
    override.readingRole = (
      hasGeneralRule
      || params.heuristic.currentness_score >= 0.56
    )
      ? 'estado_actual'
      : 'entrada_doctrinal';
    override.validity = params.heuristic.estado_vigencia === 'indeterminado'
      ? 'vigente_tensionado'
      : params.heuristic.estado_vigencia;
    override.reason = 'override_materia_litigiosa_textual';
    override.confidenceDelta = 0.08;
    return override;
  }

  if (
    llmRole === 'aplicacion'
    && params.heuristic.signals_competence_closure > 0
    && (
      hasExclusiveCompetenceFrame
      || hasGeneralRule
    )
  ) {
    override.role = 'cierre_competencial';
    override.intervention = 'intervencion_residual';
    override.readingRole = 'entrada_doctrinal';
    override.validity = params.heuristic.estado_vigencia === 'indeterminado'
      ? 'vigente_tensionado'
      : params.heuristic.estado_vigencia;
    override.reason = 'override_cierre_competencial_textual';
    override.confidenceDelta = 0.08;
    return override;
  }

  return override;
}

function buildRelationBuckets(rows: RelationAggregateRow[]) {
  const empty = {
    fortalece: 0,
    desarrolla: 0,
    ajusta: 0,
    limita: 0,
    desplaza: 0
  };
  const incoming = { ...empty };
  const outgoing = { ...empty };
  let latestIncomingDate: string | null = null;
  let latestOutgoingDate: string | null = null;

  for (const row of rows) {
    const effect = classifyRelationEffect(row.tipo_accion);
    const target = row.direction === 'incoming' ? incoming : outgoing;
    target[effect] += Number(row.total ?? 0);
    if (row.direction === 'incoming' && row.latest_related_date && (!latestIncomingDate || row.latest_related_date > latestIncomingDate)) {
      latestIncomingDate = row.latest_related_date;
    }
    if (row.direction === 'outgoing' && row.latest_related_date && (!latestOutgoingDate || row.latest_related_date > latestOutgoingDate)) {
      latestOutgoingDate = row.latest_related_date;
    }
  }

  return {
    incoming,
    outgoing,
    incomingTotal: Object.values(incoming).reduce((acc, value) => acc + value, 0),
    outgoingTotal: Object.values(outgoing).reduce((acc, value) => acc + value, 0),
    latestIncomingDate,
    latestOutgoingDate
  };
}

function pushSecondaryRole(collection: SecondaryRole[], rol: DoctrinalRole, confidence: number) {
  if (collection.some((entry) => entry.rol === rol)) return;
  collection.push({ rol, confidence: roundScore(confidence) });
}

function buildSourceSnapshotVersion(base: string | null | undefined, llmModel: string | null | undefined) {
  const normalizedBase = typeof base === 'string' && base.trim().length > 0 ? base.trim() : null;
  const normalizedModel = typeof llmModel === 'string' && llmModel.trim().length > 0 ? llmModel.trim() : null;
  if (!normalizedBase && !normalizedModel) return null;
  if (!normalizedModel) return normalizedBase;
  if (!normalizedBase) return normalizedModel;
  if (normalizedBase.split('|').includes(normalizedModel)) return normalizedBase;
  return `${normalizedBase}|${normalizedModel}`;
}

async function getRawJsonForDictamen(env: Env, dictamenId: string): Promise<DictamenRaw | null> {
  const candidates = [`dictamen:${dictamenId}`, dictamenId];
  for (const key of candidates) {
    const value = await env.DICTAMENES_SOURCE.get(key, 'json').catch(() => null);
    if (value && typeof value === 'object') {
      return value as DictamenRaw;
    }
  }
  return null;
}

async function ensureDoctrinalMetadataSchema(env: Env) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS dictamen_metadata_doctrinal (
      dictamen_id TEXT NOT NULL REFERENCES dictamenes(id),
      pipeline_version TEXT NOT NULL,
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      materia_base TEXT,
      tema_canonico TEXT,
      subtema_canonico TEXT,
      rol_principal TEXT NOT NULL,
      roles_secundarios_json TEXT,
      estado_intervencion_cgr TEXT NOT NULL,
      estado_vigencia TEXT NOT NULL,
      reading_role TEXT NOT NULL,
      reading_weight REAL NOT NULL DEFAULT 0,
      currentness_score REAL NOT NULL DEFAULT 0,
      historical_significance_score REAL NOT NULL DEFAULT 0,
      doctrinal_centrality_score REAL NOT NULL DEFAULT 0,
      shift_intensity_score REAL NOT NULL DEFAULT 0,
      family_eligibility_score REAL NOT NULL DEFAULT 0,
      drift_risk_score REAL NOT NULL DEFAULT 0,
      supports_state_current INTEGER NOT NULL DEFAULT 0,
      signals_litigious_matter INTEGER NOT NULL DEFAULT 0,
      signals_abstention INTEGER NOT NULL DEFAULT 0,
      signals_competence_closure INTEGER NOT NULL DEFAULT 0,
      signals_operational_rule INTEGER NOT NULL DEFAULT 0,
      anchor_norma_principal TEXT,
      anchor_dictamen_referido TEXT,
      evidence_summary_json TEXT,
      confidence_global REAL NOT NULL DEFAULT 0,
      manual_review_status TEXT NOT NULL DEFAULT 'auto_pending',
      source_snapshot_version TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (dictamen_id, pipeline_version)
    )`,
    `CREATE TABLE IF NOT EXISTS dictamen_metadata_doctrinal_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dictamen_id TEXT NOT NULL REFERENCES dictamenes(id),
      pipeline_version TEXT NOT NULL,
      evidence_type TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      signal_value TEXT,
      score REAL NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0,
      source_table TEXT,
      source_locator TEXT,
      snippet TEXT,
      detected_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_metadata_doctrinal_reading ON dictamen_metadata_doctrinal (pipeline_version, reading_role, reading_weight DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_metadata_doctrinal_currentness ON dictamen_metadata_doctrinal (pipeline_version, currentness_score DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_metadata_doctrinal_validity ON dictamen_metadata_doctrinal (pipeline_version, estado_vigencia)`,
    `CREATE INDEX IF NOT EXISTS idx_metadata_doctrinal_dictamen ON dictamen_metadata_doctrinal (dictamen_id, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_metadata_doctrinal_evidence_dictamen ON dictamen_metadata_doctrinal_evidence (dictamen_id, pipeline_version, created_at DESC)`
  ];

  for (const sql of statements) {
    await env.DB.prepare(sql).run();
  }
}

async function fetchBaseRow(env: Env, dictamenId: string) {
  return env.DB.prepare(
    `SELECT
       d.id AS dictamen_id,
       d.numero,
       d.fecha_documento,
       d.materia,
       d.criterio,
       e.titulo,
       e.resumen,
       e.analisis,
       e.etiquetas_json,
       a.es_relevante,
       a.en_boletin,
       a.recurso_proteccion,
       a.aclarado,
       a.alterado,
       a.aplicado,
       a.complementado,
       a.confirmado,
       a.reactivado,
       a.reconsiderado,
       a.reconsiderado_parcialmente,
       a.caracter
     FROM dictamenes d
     LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
     LEFT JOIN atributos_juridicos a ON a.dictamen_id = d.id
     WHERE d.id = ?`
  ).bind(dictamenId).first<DictamenBaseRow>();
}

async function fetchRelationAggregateRows(env: Env, dictamenId: string) {
  const result = await env.DB.prepare(
    `SELECT
       CASE WHEN r.dictamen_destino_id = ? THEN 'incoming' ELSE 'outgoing' END AS direction,
       r.tipo_accion,
       COUNT(*) AS total,
       MAX(COALESCE(rd.fecha_documento, rd.created_at)) AS latest_related_date
     FROM dictamen_relaciones_juridicas r
     LEFT JOIN dictamenes rd
       ON rd.id = CASE WHEN r.dictamen_destino_id = ? THEN r.dictamen_origen_id ELSE r.dictamen_destino_id END
     WHERE r.dictamen_destino_id = ?
        OR r.dictamen_origen_id = ?
     GROUP BY direction, r.tipo_accion`
  ).bind(dictamenId, dictamenId, dictamenId, dictamenId).all<RelationAggregateRow>();
  return result.results ?? [];
}

async function fetchPrimaryLegalSource(env: Env, dictamenId: string) {
  const result = await env.DB.prepare(
    `SELECT
       c.tipo_norma,
       c.numero,
       COUNT(*) AS total
     FROM dictamen_fuentes f
     INNER JOIN fuentes_legales_catalogo c ON c.id = f.fuente_id
     WHERE f.dictamen_id = ?
     GROUP BY c.tipo_norma, c.numero
     ORDER BY total DESC, c.tipo_norma ASC, c.numero ASC
     LIMIT 1`
  ).bind(dictamenId).first<LegalSourceRow>();
  return result ?? null;
}

async function fetchAnchorDictamenReferido(env: Env, dictamenId: string) {
  const incoming = await env.DB.prepare(
    `SELECT dictamen_origen_id AS related_id
     FROM dictamen_relaciones_juridicas
     WHERE dictamen_destino_id = ?
     ORDER BY rowid DESC
     LIMIT 1`
  ).bind(dictamenId).first<{ related_id: string }>();

  if (incoming?.related_id) return incoming.related_id;

  const outgoing = await env.DB.prepare(
    `SELECT dictamen_destino_id AS related_id
     FROM dictamen_relaciones_juridicas
     WHERE dictamen_origen_id = ?
     ORDER BY rowid DESC
     LIMIT 1`
  ).bind(dictamenId).first<{ related_id: string }>();

  return outgoing?.related_id ?? null;
}

function buildComputation(
  base: DictamenBaseRow,
  relations: RelationAggregateRow[],
  primaryLegalSource: LegalSourceRow | null,
  anchorDictamenReferido: string | null
): { row: DictamenMetadataDoctrinalRow; evidence: DoctrinalEvidenceInput[] } {
  const topics = inferCanonicalTopics(base);
  const textualSignals = detectTextualSignals(base);
  const buckets = buildRelationBuckets(relations);
  const recentness = buildRecentnessSignal(base.fecha_documento, 6);
  const relationDensity = clamp01((buckets.incomingTotal + buckets.outgoingTotal) / 8);
  const destabilizingIncoming = buckets.incoming.desplaza + buckets.incoming.limita + buckets.incoming.ajusta;
  const structuralOutgoingShift = buckets.outgoing.desplaza + buckets.outgoing.limita + buckets.outgoing.ajusta;
  const attrs = {
    relevante: Number(base.es_relevante ?? 0) > 0,
    boletin: Number(base.en_boletin ?? 0) > 0,
    recurso: Number(base.recurso_proteccion ?? 0) > 0,
    aclarado: Number(base.aclarado ?? 0) > 0,
    alterado: Number(base.alterado ?? 0) > 0,
    aplicado: Number(base.aplicado ?? 0) > 0,
    complementado: Number(base.complementado ?? 0) > 0,
    confirmado: Number(base.confirmado ?? 0) > 0,
    reactivado: Number(base.reactivado ?? 0) > 0,
    reconsiderado: Number(base.reconsiderado ?? 0) > 0,
    reconsideradoParcialmente: Number(base.reconsiderado_parcialmente ?? 0) > 0
  };

  const signalsAbstention = textualSignals.abstentionMatches.length > 0;
  const signalsLitigious = textualSignals.litigiousMatches.length > 0;
  const signalsCompetenceClosure = textualSignals.competenceMatches.length > 0 || (signalsAbstention && !attrs.aplicado);
  const signalsOperationalRule = textualSignals.operationalMatches.length > 0 || attrs.confirmado || attrs.aplicado;

  const currentnessScore = roundScore(
    (recentness * 0.36)
    + (signalsOperationalRule ? 0.16 : 0)
    + (attrs.confirmado ? 0.08 : 0)
    + (attrs.aplicado ? 0.07 : 0)
    + (attrs.reactivado ? 0.12 : 0)
    + (attrs.complementado ? 0.04 : 0)
    - Math.min(0.26, destabilizingIncoming * 0.09)
    - (signalsAbstention ? 0.04 : 0)
  );

  const historicalSignificanceScore = roundScore(
    (relationDensity * 0.22)
    + (attrs.relevante ? 0.16 : 0)
    + (attrs.boletin ? 0.1 : 0)
    + Math.min(0.28, buckets.incomingTotal * 0.07)
    + Math.min(0.14, buckets.incoming.desplaza * 0.14)
    + Math.min(0.1, buckets.incoming.limita * 0.08)
    + ((1 - recentness) * 0.12)
  );

  const doctrinalCentralityScore = roundScore(
    (relationDensity * 0.25)
    + (attrs.relevante ? 0.18 : 0)
    + (attrs.boletin ? 0.09 : 0)
    + (primaryLegalSource ? 0.08 : 0)
    + Math.min(0.18, buckets.incomingTotal * 0.05)
    + Math.min(0.14, buckets.outgoingTotal * 0.04)
    + (attrs.recurso ? 0.04 : 0)
  );

  const shiftIntensityScore = roundScore(
    Math.min(0.34, structuralOutgoingShift * 0.12)
    + (attrs.reconsiderado ? 0.18 : 0)
    + (attrs.reconsideradoParcialmente ? 0.1 : 0)
    + (attrs.reactivado ? 0.12 : 0)
    + Math.min(0.14, buckets.outgoing.desarrolla * 0.05)
    + Math.min(0.08, buckets.incoming.desplaza * 0.08)
  );

  const driftRiskScore = roundScore(
    (topics.temaOperativoVisible.length === 0 ? 0.2 : 0)
    + (!primaryLegalSource ? 0.12 : 0)
    + (!attrs.relevante && !attrs.boletin ? 0.08 : 0)
    + (signalsAbstention || signalsLitigious ? 0.1 : 0)
    + Math.max(0, 0.18 - (relationDensity * 0.18))
  );

  const familyEligibilityScore = roundScore(
    (doctrinalCentralityScore * 0.48)
    + (currentnessScore * 0.22)
    + (historicalSignificanceScore * 0.18)
    + ((1 - driftRiskScore) * 0.12)
  );

  const supportsStateCurrent = (
    currentnessScore >= 0.58
    && !signalsAbstention
    && !signalsLitigious
    && destabilizingIncoming <= 1
  );

  let estadoIntervencion: CgrInterventionState = 'sin_senal_clara';
  if (signalsAbstention) {
    estadoIntervencion = 'abstencion_visible';
  } else if (signalsLitigious) {
    estadoIntervencion = 'materia_litigiosa';
  } else if (signalsCompetenceClosure) {
    estadoIntervencion = 'intervencion_residual';
  } else if (supportsStateCurrent && doctrinalCentralityScore >= 0.32) {
    estadoIntervencion = 'intervencion_normal';
  } else if (doctrinalCentralityScore >= 0.3 || destabilizingIncoming > 0 || shiftIntensityScore >= 0.45) {
    estadoIntervencion = 'intervencion_condicionada';
  }

  let estadoVigencia: DoctrinalValidityState = 'indeterminado';
  if (buckets.incoming.desplaza > 0) {
    estadoVigencia = 'desplazado';
  } else if (buckets.incoming.limita > 0 || buckets.incoming.ajusta > 1) {
    estadoVigencia = 'desplazado_parcialmente';
  } else if (supportsStateCurrent && currentnessScore >= 0.72) {
    estadoVigencia = 'vigente_visible';
  } else if (supportsStateCurrent) {
    estadoVigencia = 'vigente_tensionado';
  } else if (shiftIntensityScore >= 0.55) {
    estadoVigencia = 'vigente_en_revision';
  } else if (historicalSignificanceScore >= 0.62) {
    estadoVigencia = 'valor_historico';
  }

  const secondaryRoles: SecondaryRole[] = [];
  let rolPrincipal: DoctrinalRole = 'contexto_no_central';

  if (signalsAbstention) {
    rolPrincipal = 'abstencion';
  } else if (signalsLitigious) {
    rolPrincipal = 'materia_litigiosa';
  } else if (signalsCompetenceClosure) {
    rolPrincipal = 'cierre_competencial';
  } else if (attrs.reactivado || shiftIntensityScore >= 0.68) {
    rolPrincipal = attrs.reactivado ? 'reactivacion' : 'desplazamiento';
  } else if (supportsStateCurrent && currentnessScore >= 0.68) {
    rolPrincipal = 'criterio_operativo_actual';
  } else if (attrs.aplicado) {
    rolPrincipal = 'aplicacion';
  } else if (attrs.aclarado) {
    rolPrincipal = 'aclaracion';
  } else if (attrs.complementado) {
    rolPrincipal = 'complemento';
  } else if (attrs.alterado || attrs.reconsideradoParcialmente) {
    rolPrincipal = attrs.reconsideradoParcialmente ? 'aclaracion' : 'ajuste';
  } else if (doctrinalCentralityScore >= 0.64) {
    rolPrincipal = 'nucleo_doctrinal';
  } else if (historicalSignificanceScore >= 0.66 && currentnessScore < 0.52) {
    rolPrincipal = 'hito_historico';
  }

  if (supportsStateCurrent && rolPrincipal !== 'criterio_operativo_actual') {
    pushSecondaryRole(secondaryRoles, 'criterio_operativo_actual', currentnessScore);
  }
  if (doctrinalCentralityScore >= 0.58 && rolPrincipal !== 'nucleo_doctrinal') {
    pushSecondaryRole(secondaryRoles, 'nucleo_doctrinal', doctrinalCentralityScore);
  }
  if (historicalSignificanceScore >= 0.62 && rolPrincipal !== 'hito_historico') {
    pushSecondaryRole(secondaryRoles, 'hito_historico', historicalSignificanceScore);
  }
  if (attrs.aplicado && rolPrincipal !== 'aplicacion') {
    pushSecondaryRole(secondaryRoles, 'aplicacion', 0.68);
  }
  if (attrs.aclarado && rolPrincipal !== 'aclaracion') {
    pushSecondaryRole(secondaryRoles, 'aclaracion', 0.64);
  }
  if (attrs.complementado && rolPrincipal !== 'complemento') {
    pushSecondaryRole(secondaryRoles, 'complemento', 0.62);
  }
  if ((attrs.alterado || attrs.reconsideradoParcialmente) && !['ajuste', 'limitacion'].includes(rolPrincipal)) {
    pushSecondaryRole(secondaryRoles, attrs.reconsideradoParcialmente ? 'limitacion' : 'ajuste', 0.66);
  }
  if ((attrs.reactivado || shiftIntensityScore >= 0.66) && !['reactivacion', 'desplazamiento'].includes(rolPrincipal)) {
    pushSecondaryRole(secondaryRoles, attrs.reactivado ? 'reactivacion' : 'desplazamiento', shiftIntensityScore);
  }

  let readingRole: ReadingRole = 'soporte_contextual';
  if (supportsStateCurrent && currentnessScore >= 0.7) {
    readingRole = 'estado_actual';
  } else if (shiftIntensityScore >= 0.68) {
    readingRole = 'pivote_de_cambio';
  } else if (historicalSignificanceScore >= 0.72 && currentnessScore < 0.48) {
    readingRole = 'ancla_historica';
  } else if (doctrinalCentralityScore >= 0.6) {
    readingRole = 'entrada_doctrinal';
  } else if (doctrinalCentralityScore >= 0.34 || attrs.aplicado || attrs.aclarado) {
    readingRole = 'entrada_semantica';
  }

  const readingWeight = roundScore(
    (doctrinalCentralityScore * 0.34)
    + (currentnessScore * 0.26)
    + (historicalSignificanceScore * 0.18)
    + (shiftIntensityScore * 0.12)
    + ((readingRole === 'estado_actual' || readingRole === 'entrada_doctrinal') ? 0.1 : 0)
  );

  const evidenceSummary = {
    anchor_norma_principal: formatNormaLabel(primaryLegalSource),
    anchor_dictamen_referido: anchorDictamenReferido,
    recentness,
    relation_inventory: {
      incoming: buckets.incoming,
      outgoing: buckets.outgoing
    },
    textual_signal_counts: {
      abstencion: textualSignals.abstentionMatches.length,
      litigiosidad: textualSignals.litigiousMatches.length,
      cierre_competencial: textualSignals.competenceMatches.length,
      regla_operativa: textualSignals.operationalMatches.length
    },
    visible_topics: topics.temaOperativoVisible
  };

  rolPrincipal = canonicalizePrimaryDoctrinalRole({
    role: rolPrincipal,
    intervention: estadoIntervencion,
    validity: estadoVigencia,
    readingRole,
    supportsStateCurrent: supportsStateCurrent ? 1 : 0
  });

  const confidenceGlobal = roundScore(
    0.28
    + (relationDensity * 0.24)
    + (primaryLegalSource ? 0.08 : 0)
    + (topics.temaCanonico ? 0.08 : 0)
    + Math.min(0.16, secondaryRoles.length * 0.04)
    + Math.min(0.16, (
      textualSignals.abstentionMatches.length
      + textualSignals.litigiousMatches.length
      + textualSignals.operationalMatches.length
    ) * 0.04)
  );

  const evidence: DoctrinalEvidenceInput[] = [];
  if (primaryLegalSource) {
    evidence.push({
      evidence_type: 'legal_source',
      signal_type: 'anchor_norma_principal',
      signal_value: formatNormaLabel(primaryLegalSource) ?? '',
      score: 0.58,
      confidence: 0.82,
      source_table: 'dictamen_fuentes',
      source_locator: `dictamen_id=${base.dictamen_id}`,
      snippet: formatNormaLabel(primaryLegalSource),
      detected_by: DOCTRINAL_METADATA_PIPELINE_VERSION
    });
  }
  if (anchorDictamenReferido) {
    evidence.push({
      evidence_type: 'relation_graph',
      signal_type: 'anchor_dictamen_referido',
      signal_value: anchorDictamenReferido,
      score: 0.62,
      confidence: 0.84,
      source_table: 'dictamen_relaciones_juridicas',
      source_locator: `dictamen_id=${base.dictamen_id}`,
      snippet: anchorDictamenReferido,
      detected_by: DOCTRINAL_METADATA_PIPELINE_VERSION
    });
  }
  if (attrs.aplicado || attrs.aclarado || attrs.complementado || attrs.reactivado || attrs.reconsiderado || attrs.reconsideradoParcialmente) {
    const signalList = [
      attrs.aplicado ? 'aplicado' : null,
      attrs.aclarado ? 'aclarado' : null,
      attrs.complementado ? 'complementado' : null,
      attrs.reactivado ? 'reactivado' : null,
      attrs.reconsiderado ? 'reconsiderado' : null,
      attrs.reconsideradoParcialmente ? 'reconsiderado_parcialmente' : null
    ].filter((value): value is string => Boolean(value));
    evidence.push({
      evidence_type: 'atributo_juridico',
      signal_type: 'atributos_relevantes',
      signal_value: signalList.join(','),
      score: 0.56,
      confidence: 0.8,
      source_table: 'atributos_juridicos',
      source_locator: `dictamen_id=${base.dictamen_id}`,
      snippet: signalList.join(', '),
      detected_by: DOCTRINAL_METADATA_PIPELINE_VERSION
    });
  }

  for (const match of textualSignals.abstentionMatches) {
    evidence.push({
      evidence_type: 'resumen_text',
      signal_type: 'signals_abstention',
      signal_value: match,
      score: 0.72,
      confidence: 0.76,
      source_table: 'enriquecimiento',
      source_locator: `dictamen_id=${base.dictamen_id}`,
      snippet: match,
      detected_by: DOCTRINAL_METADATA_PIPELINE_VERSION
    });
  }
  for (const match of textualSignals.litigiousMatches) {
    evidence.push({
      evidence_type: 'resumen_text',
      signal_type: 'signals_litigious_matter',
      signal_value: match,
      score: 0.74,
      confidence: 0.78,
      source_table: 'enriquecimiento',
      source_locator: `dictamen_id=${base.dictamen_id}`,
      snippet: match,
      detected_by: DOCTRINAL_METADATA_PIPELINE_VERSION
    });
  }
  for (const match of textualSignals.operationalMatches.slice(0, 2)) {
    evidence.push({
      evidence_type: 'enrichment_text',
      signal_type: 'signals_operational_rule',
      signal_value: match,
      score: 0.6,
      confidence: 0.72,
      source_table: 'enriquecimiento',
      source_locator: `dictamen_id=${base.dictamen_id}`,
      snippet: match,
      detected_by: DOCTRINAL_METADATA_PIPELINE_VERSION
    });
  }

  return {
    row: {
      dictamen_id: base.dictamen_id,
      pipeline_version: DOCTRINAL_METADATA_PIPELINE_VERSION,
      computed_at: new Date().toISOString(),
      materia_base: topics.materiaBase,
      tema_canonico: topics.temaCanonico,
      subtema_canonico: topics.subtemaCanonico,
      rol_principal: rolPrincipal,
      roles_secundarios_json: JSON.stringify(secondaryRoles),
      estado_intervencion_cgr: estadoIntervencion,
      estado_vigencia: estadoVigencia,
      reading_role: readingRole,
      reading_weight: readingWeight,
      currentness_score: currentnessScore,
      historical_significance_score: historicalSignificanceScore,
      doctrinal_centrality_score: doctrinalCentralityScore,
      shift_intensity_score: shiftIntensityScore,
      family_eligibility_score: familyEligibilityScore,
      drift_risk_score: driftRiskScore,
      supports_state_current: supportsStateCurrent ? 1 : 0,
      signals_litigious_matter: signalsLitigious ? 1 : 0,
      signals_abstention: signalsAbstention ? 1 : 0,
      signals_competence_closure: signalsCompetenceClosure ? 1 : 0,
      signals_operational_rule: signalsOperationalRule ? 1 : 0,
      anchor_norma_principal: formatNormaLabel(primaryLegalSource),
      anchor_dictamen_referido: anchorDictamenReferido,
      evidence_summary_json: JSON.stringify(evidenceSummary),
      confidence_global: confidenceGlobal,
      manual_review_status: confidenceGlobal < 0.58 ? 'needs_review' : 'auto_ready',
      source_snapshot_version: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } satisfies DictamenMetadataDoctrinalRow,
    evidence
  };
}

function mergeWithLlmComputation(params: {
  base: DictamenBaseRow;
  heuristic: ReturnType<typeof buildComputation>;
  llm: Record<string, unknown> | null;
  llmModel: string | null;
}) {
  const merged: DictamenMetadataDoctrinalRow = {
    ...params.heuristic.row,
    source_snapshot_version: params.heuristic.row.source_snapshot_version
  };
  const evidence = [...params.heuristic.evidence];
  const llm = params.llm;
  if (!llm) return { row: merged, evidence };

  const role = normalizeDoctrinalRole(llm.rol_principal);
  const intervention = normalizeInterventionState(llm.estado_intervencion_cgr);
  const validity = normalizeValidityState(llm.estado_vigencia);
  const readingRole = normalizeReadingRole(llm.reading_role);
  const secondaryRoles = Array.isArray(llm.roles_secundarios) ? normalizeSecondaryRoles(llm.roles_secundarios) : [];

  if (role) merged.rol_principal = role;
  if (intervention) merged.estado_intervencion_cgr = intervention;
  if (validity) merged.estado_vigencia = validity;
  if (readingRole) merged.reading_role = readingRole;

  const numericFields = [
    'reading_weight',
    'currentness_score',
    'historical_significance_score',
    'doctrinal_centrality_score',
    'shift_intensity_score',
    'family_eligibility_score',
    'drift_risk_score',
    'confidence_global'
  ] as const;
  for (const field of numericFields) {
    const value = llm[field];
    if (typeof value === 'number' && Number.isFinite(value)) {
      merged[field] = roundScore(value) as never;
    }
  }

  const booleanFields = [
    'supports_state_current',
    'signals_litigious_matter',
    'signals_abstention',
    'signals_competence_closure',
    'signals_operational_rule'
  ] as const;
  for (const field of booleanFields) {
    const value = llm[field];
    if (typeof value === 'boolean') {
      merged[field] = (value ? 1 : 0) as never;
    }
  }

  if (typeof llm.anchor_norma_principal === 'string' && llm.anchor_norma_principal.trim()) {
    merged.anchor_norma_principal = llm.anchor_norma_principal.trim();
  }
  if (typeof llm.anchor_dictamen_referido === 'string' && llm.anchor_dictamen_referido.trim()) {
    merged.anchor_dictamen_referido = llm.anchor_dictamen_referido.trim();
  }

  const deterministicOverride = buildDeterministicRoleOverrides({
    base: params.base,
    heuristic: params.heuristic.row,
    llm
  });
  if (deterministicOverride.role) {
    merged.rol_principal = deterministicOverride.role;
  }
  if (deterministicOverride.readingRole) {
    merged.reading_role = deterministicOverride.readingRole;
  }
  if (deterministicOverride.validity) {
    merged.estado_vigencia = deterministicOverride.validity;
  }
  if (deterministicOverride.intervention) {
    merged.estado_intervencion_cgr = deterministicOverride.intervention;
  }
  if (typeof deterministicOverride.confidenceDelta === 'number') {
    merged.confidence_global = roundScore(Math.min(1, merged.confidence_global + deterministicOverride.confidenceDelta));
  }

  merged.rol_principal = canonicalizePrimaryDoctrinalRole({
    role: merged.rol_principal,
    intervention: merged.estado_intervencion_cgr,
    validity: merged.estado_vigencia,
    readingRole: merged.reading_role,
    supportsStateCurrent: merged.supports_state_current
  });

  const summary = {
    ...(merged.evidence_summary_json ? JSON.parse(merged.evidence_summary_json) : {}),
    llm_doctrinal_metadata: {
      model: params.llmModel,
      rol_principal: role,
      reading_role: readingRole,
      estado_vigencia: validity,
      estado_intervencion_cgr: intervention,
      roles_secundarios: secondaryRoles,
      evidencia_resumen: typeof llm.evidencia_resumen === 'string' ? llm.evidencia_resumen : null,
      deterministic_override: deterministicOverride.reason ?? null
    }
  };
  merged.roles_secundarios_json = JSON.stringify(secondaryRoles.map((rol) => ({ rol, confidence: merged.confidence_global })));
  merged.evidence_summary_json = JSON.stringify(summary);
  merged.manual_review_status = merged.confidence_global < 0.58 ? 'needs_review' : 'auto_ready';

  if (typeof llm.evidencia_resumen === 'string' && llm.evidencia_resumen.trim()) {
    evidence.push({
      evidence_type: 'manual_review',
      signal_type: 'llm_doctrinal_classification',
      signal_value: role ?? merged.rol_principal,
      score: merged.confidence_global,
      confidence: merged.confidence_global,
      source_table: 'mistral',
      source_locator: params.llmModel ?? DOCTRINAL_METADATA_MODEL,
      snippet: llm.evidencia_resumen.trim(),
      detected_by: params.llmModel ?? DOCTRINAL_METADATA_MODEL
    });
  }

  if (deterministicOverride.reason) {
    evidence.push({
      evidence_type: 'manual_review',
      signal_type: 'deterministic_override',
      signal_value: deterministicOverride.reason,
      score: merged.confidence_global,
      confidence: merged.confidence_global,
      source_table: 'dictamenes',
      source_locator: `dictamen_id=${merged.dictamen_id}`,
      snippet: deterministicOverride.reason,
      detected_by: DOCTRINAL_METADATA_PIPELINE_VERSION
    });
  }

  return {
    row: merged,
    evidence
  };
}

async function persistComputation(
  env: Env,
  row: DictamenMetadataDoctrinalRow,
  evidence: DoctrinalEvidenceInput[],
  sourceSnapshotVersion: string | null
) {
  await env.DB.prepare(
    `INSERT INTO dictamen_metadata_doctrinal (
       dictamen_id,
       pipeline_version,
       computed_at,
       materia_base,
       tema_canonico,
       subtema_canonico,
       rol_principal,
       roles_secundarios_json,
       estado_intervencion_cgr,
       estado_vigencia,
       reading_role,
       reading_weight,
       currentness_score,
       historical_significance_score,
       doctrinal_centrality_score,
       shift_intensity_score,
       family_eligibility_score,
       drift_risk_score,
       supports_state_current,
       signals_litigious_matter,
       signals_abstention,
       signals_competence_closure,
       signals_operational_rule,
       anchor_norma_principal,
       anchor_dictamen_referido,
       evidence_summary_json,
       confidence_global,
       manual_review_status,
       source_snapshot_version,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(dictamen_id, pipeline_version) DO UPDATE SET
       computed_at = excluded.computed_at,
       materia_base = excluded.materia_base,
       tema_canonico = excluded.tema_canonico,
       subtema_canonico = excluded.subtema_canonico,
       rol_principal = excluded.rol_principal,
       roles_secundarios_json = excluded.roles_secundarios_json,
       estado_intervencion_cgr = excluded.estado_intervencion_cgr,
       estado_vigencia = excluded.estado_vigencia,
       reading_role = excluded.reading_role,
       reading_weight = excluded.reading_weight,
       currentness_score = excluded.currentness_score,
       historical_significance_score = excluded.historical_significance_score,
       doctrinal_centrality_score = excluded.doctrinal_centrality_score,
       shift_intensity_score = excluded.shift_intensity_score,
       family_eligibility_score = excluded.family_eligibility_score,
       drift_risk_score = excluded.drift_risk_score,
       supports_state_current = excluded.supports_state_current,
       signals_litigious_matter = excluded.signals_litigious_matter,
       signals_abstention = excluded.signals_abstention,
       signals_competence_closure = excluded.signals_competence_closure,
       signals_operational_rule = excluded.signals_operational_rule,
       anchor_norma_principal = excluded.anchor_norma_principal,
       anchor_dictamen_referido = excluded.anchor_dictamen_referido,
       evidence_summary_json = excluded.evidence_summary_json,
       confidence_global = excluded.confidence_global,
       manual_review_status = excluded.manual_review_status,
       source_snapshot_version = excluded.source_snapshot_version,
       updated_at = datetime('now')`
  ).bind(
    row.dictamen_id,
    row.pipeline_version,
    row.computed_at,
    row.materia_base,
    row.tema_canonico,
    row.subtema_canonico,
    row.rol_principal,
    row.roles_secundarios_json,
    row.estado_intervencion_cgr,
    row.estado_vigencia,
    row.reading_role,
    row.reading_weight,
    row.currentness_score,
    row.historical_significance_score,
    row.doctrinal_centrality_score,
    row.shift_intensity_score,
    row.family_eligibility_score,
    row.drift_risk_score,
    row.supports_state_current,
    row.signals_litigious_matter,
    row.signals_abstention,
    row.signals_competence_closure,
    row.signals_operational_rule,
    row.anchor_norma_principal,
    row.anchor_dictamen_referido,
    row.evidence_summary_json,
    row.confidence_global,
    row.manual_review_status,
    sourceSnapshotVersion
  ).run();

  await env.DB.prepare(
    `DELETE FROM dictamen_metadata_doctrinal_evidence
     WHERE dictamen_id = ? AND pipeline_version = ?`
  ).bind(row.dictamen_id, row.pipeline_version).run();

  for (const item of evidence) {
    await env.DB.prepare(
      `INSERT INTO dictamen_metadata_doctrinal_evidence (
         dictamen_id,
         pipeline_version,
         evidence_type,
         signal_type,
         signal_value,
         score,
         confidence,
         source_table,
         source_locator,
         snippet,
         detected_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      row.dictamen_id,
      row.pipeline_version,
      item.evidence_type,
      item.signal_type,
      item.signal_value,
      item.score,
      item.confidence,
      item.source_table,
      item.source_locator,
      item.snippet,
      item.detected_by
    ).run();
  }
}

async function computeAndPersistDictamenMetadata(env: Env, dictamenId: string, sourceSnapshotVersion: string | null) {
  const base = await fetchBaseRow(env, dictamenId);
  if (!base) return null;
  const [relations, primaryLegalSource, anchorDictamenReferido, rawJson] = await Promise.all([
    fetchRelationAggregateRows(env, dictamenId),
    fetchPrimaryLegalSource(env, dictamenId),
    fetchAnchorDictamenReferido(env, dictamenId),
    getRawJsonForDictamen(env, dictamenId)
  ]);
  const heuristic = buildComputation(base, relations, primaryLegalSource, anchorDictamenReferido);
  let merged: { row: DictamenMetadataDoctrinalRow; evidence: DoctrinalEvidenceInput[] } = heuristic;

  if (rawJson) {
    const llm = await analyzeDoctrinalMetadata(env, rawJson, {
      dictamen_id: dictamenId,
      materia: base.materia,
      criterio: base.criterio,
      titulo: base.titulo,
      resumen: base.resumen,
      relation_counts: {
        incoming: relations.filter((row) => row.direction === 'incoming').reduce((acc, row) => acc + Number(row.total ?? 0), 0),
        outgoing: relations.filter((row) => row.direction === 'outgoing').reduce((acc, row) => acc + Number(row.total ?? 0), 0)
      },
      heuristic_snapshot: heuristic.row
    });

    merged = mergeWithLlmComputation({
      base,
      heuristic,
      llm: llm.result,
      llmModel: llm.model
    });
    merged.row.source_snapshot_version = buildSourceSnapshotVersion(sourceSnapshotVersion, llm.model);
  } else {
    merged.row.source_snapshot_version = buildSourceSnapshotVersion(sourceSnapshotVersion, null);
  }

  await persistComputation(env, merged.row, merged.evidence, merged.row.source_snapshot_version);
  await logDictamenEvent(env.DB, {
    dictamen_id: dictamenId,
    event_type: 'DOCTRINAL_METADATA_SUCCESS',
    metadata: {
      pipeline_version: DOCTRINAL_METADATA_PIPELINE_VERSION,
      source_snapshot_version: merged.row.source_snapshot_version,
      rol_principal: merged.row.rol_principal,
      reading_role: merged.row.reading_role,
      estado_intervencion_cgr: merged.row.estado_intervencion_cgr,
      confidence_global: merged.row.confidence_global,
      model: DOCTRINAL_METADATA_MODEL
    }
  });
  return {
    ...merged.row
  } satisfies DictamenMetadataDoctrinalRow;
}

export async function loadDoctrinalMetadataByIds(
  env: Env,
  dictamenIds: string[],
  options: LoadDoctrinalMetadataOptions = {}
) {
  await ensureDoctrinalMetadataSchema(env);
  const uniqueIds = [...new Set(dictamenIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {} as Record<string, DictamenMetadataDoctrinalRow>;

  const placeholders = uniqueIds.map(() => '?').join(',');
  const existing = await env.DB.prepare(
    `SELECT *
     FROM dictamen_metadata_doctrinal
     WHERE pipeline_version = ?
       AND dictamen_id IN (${placeholders})`
  ).bind(DOCTRINAL_METADATA_PIPELINE_VERSION, ...uniqueIds).all<DictamenMetadataDoctrinalRow>();

  const byId = Object.fromEntries((existing.results ?? []).map((row) => [row.dictamen_id, row]));
  if (options.computeMissing === false) {
    return byId;
  }
  const missingIds = uniqueIds.filter((id) => !byId[id]);

  for (const id of missingIds) {
    const computed = await computeAndPersistDictamenMetadata(env, id, 'runtime_on_demand');
    if (computed) {
      byId[id] = computed;
    }
  }

  return byId;
}

export async function reprocessDoctrinalMetadata(env: Env, options: ReprocessOptions = {}): Promise<ReprocessResult> {
  await ensureDoctrinalMetadataSchema(env);
  const explicitIds = Array.isArray(options.dictamenIds)
    ? [...new Set(options.dictamenIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim()))]
    : [];

  let dictamenIds = explicitIds;
  if (dictamenIds.length === 0) {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const offset = Math.max(options.offset ?? 0, 0);
    const rows = await env.DB.prepare(
      `SELECT id
       FROM dictamenes
       WHERE estado IN ('enriched_pending_vectorization', 'vectorized')
       ORDER BY COALESCE(fecha_documento, created_at) DESC, id DESC
       LIMIT ? OFFSET ?`
    ).bind(limit, offset).all<{ id: string }>();
    dictamenIds = (rows.results ?? []).map((row) => row.id);
  }

  const processed: string[] = [];
  for (const dictamenId of dictamenIds) {
    const row = await computeAndPersistDictamenMetadata(env, dictamenId, options.sourceSnapshotVersion ?? 'manual_reprocess');
    if (row) processed.push(row.dictamen_id);
  }

  return {
    processed: processed.length,
    dictamen_ids: processed,
    pipeline_version: DOCTRINAL_METADATA_PIPELINE_VERSION
  };
}
