// Acceso a D1: catalogo, enrichment y run_log.
import type { DictamenStatus, EnrichmentRow, RawRefRow, RunLogRow } from '../types';

// Parametros de upsert para la tabla dictamen.
type DictamenUpsertParams = {
  id: string;
  generaJurisprudencia: number | null;
  status: DictamenStatus;
  migratedFromMongo?: number | null;
  crawledFromCgr?: number | null;
  documentoCompletoMissing?: number | null;
  canonicalSha256?: string | null;
  canonicalBytes?: number | null;
  nDictamen?: string | null;
  numericDocId?: string | null;
  yearDocId?: string | null;
  fechaDocumento?: string | null;
  fechaIndexacion?: string | null;
  materia?: string | null;
  criterio?: string | null;
  origen?: string | null;
  origenes?: string | null;
  descriptores?: string | null;
  abogados?: string | null;
  destinatarios?: string | null;
  origenImportacion?: string | null;
  esVectorizado?: number | null;
};


function nowIso() {
  return new Date().toISOString();
}
async function startRun(db: D1Database, runType: string, detail?: unknown): Promise<string> {
  const id = crypto.randomUUID();
  const startedAt = nowIso();
  const detailJson = detail ? JSON.stringify(detail) : null;
  await db.prepare(
    `INSERT INTO run_log (id, run_type, status, detail_json, started_at)
			 VALUES (?, ?, ?, ?, ?)`
  ).bind(id, runType, "started", detailJson, startedAt).run();
  return id;
}
async function finishRun(db: D1Database, runId: string, status: string, detail?: unknown): Promise<void> {
  const finishedAt = nowIso();
  const existing = await db.prepare("SELECT detail_json FROM run_log WHERE id = ?").bind(runId).first<{ detail_json: string | null }>();
  const existingJson = existing?.detail_json ?? null;
  const existingParsed = existingJson ? safeParseJson(existingJson) : null;
  let mergedDetail;
  if (detail === void 0) {
    mergedDetail = void 0;
  } else if (isPlainObject(existingParsed) && isPlainObject(detail)) {
    mergedDetail = { ...existingParsed, ...detail };
  } else {
    mergedDetail = detail;
  }
  const detailJson = mergedDetail === void 0 ? existingJson : mergedDetail === null ? null : JSON.stringify(mergedDetail);
  await db.prepare(
    `UPDATE run_log
			 SET status = ?, detail_json = ?, finished_at = ?
			 WHERE id = ?`
  ).bind(status, detailJson, finishedAt, runId).run();
}

async function getOrCreateCategory(db: D1Database, table: string, nombre: string): Promise<string> {
  const existing = await db.prepare(`SELECT id FROM ${table} WHERE nombre = ?`).bind(nombre).first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO ${table} (id, nombre, created_at) VALUES (?, ?, ?)`).bind(id, nombre, nowIso()).run();
  return id;
}

async function logChange(db: D1Database, dictamenId: string, campo: string, vOld: any, vNew: any, origen: string) {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO historial_cambios (id, dictamen_id, campo_modificado, valor_anterior, valor_nuevo, origen, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, dictamenId, campo, String(vOld ?? ""), String(vNew ?? ""), origen, nowIso()).run();
}

async function upsertDictamen(db: D1Database, params: DictamenUpsertParams): Promise<void> {
  const now = nowIso();
  const existing = await db.prepare("SELECT * FROM dictamen WHERE id = ?").bind(params.id).first<Record<string, any>>();

  if (existing) {
    const fieldsToTrack: (keyof DictamenUpsertParams & string)[] = [
      'nDictamen', 'fechaDocumento', 'materia', 'criterio', 'destinatarios'
    ];
    const mapping: Record<string, string> = {
      nDictamen: 'n_dictamen',
      fechaDocumento: 'fecha_documento',
      materia: 'materia',
      criterio: 'criterio',
      destinatarios: 'destinatarios'
    };

    let hasChanges = false;
    for (const field of fieldsToTrack) {
      const dbField = mapping[field];
      const newVal = params[field];
      const oldVal = existing[dbField];
      if (newVal !== undefined && newVal !== oldVal) {
        await logChange(db, params.id, dbField, oldVal, newVal, params.origenImportacion ?? 'crawl_contraloria');
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      console.log(`[SKIP] Dictamen ${params.id} is identical. No update performed.`);
      return;
    }

    await db.prepare(
      `UPDATE dictamen
       SET n_dictamen = COALESCE(?, n_dictamen),
           numeric_doc_id = COALESCE(?, numeric_doc_id),
           year_doc_id = COALESCE(?, year_doc_id),
           fecha_documento = COALESCE(?, fecha_documento),
           fecha_indexacion = COALESCE(?, fecha_indexacion),
           materia = COALESCE(?, materia),
           criterio = COALESCE(?, criterio),
           origen = COALESCE(?, origen),
           origenes = COALESCE(?, origenes),
           descriptores = COALESCE(?, descriptores),
           abogados = COALESCE(?, abogados),
           destinatarios = COALESCE(?, destinatarios),
           genera_jurisprudencia = COALESCE(?, genera_jurisprudencia),
           documento_completo_missing = COALESCE(?, documento_completo_missing),
           migrated_from_mongo = COALESCE(?, migrated_from_mongo),
           crawled_from_cgr = COALESCE(?, crawled_from_cgr),
           canonical_sha256 = COALESCE(?, canonical_sha256),
           canonical_bytes = COALESCE(?, canonical_bytes),
           origen_importacion = COALESCE(?, origen_importacion),
           es_vectorizado = COALESCE(?, es_vectorizado),
           estado = ?,
           updated_at = ?
       WHERE id = ?`
    ).bind(
      params.nDictamen ?? null,
      params.numericDocId ?? null,
      params.yearDocId ?? null,
      params.fechaDocumento ?? null,
      params.fechaIndexacion ?? null,
      params.materia ?? null,
      params.criterio ?? null,
      params.origen ?? null,
      params.origenes ?? null,
      params.descriptores ?? null,
      params.abogados ?? null,
      params.destinatarios ?? null,
      params.generaJurisprudencia,
      params.documentoCompletoMissing ?? null,
      params.migratedFromMongo ?? null,
      params.crawledFromCgr ?? null,
      params.canonicalSha256 ?? null,
      params.canonicalBytes ?? null,
      params.origenImportacion ?? null,
      params.esVectorizado ?? null,
      params.status,
      now,
      params.id
    ).run();
  } else {
    await db.prepare(
      `INSERT INTO dictamen
       (id, n_dictamen, numeric_doc_id, year_doc_id, fecha_documento, fecha_indexacion, materia, criterio, origen, origenes, descriptores, abogados, destinatarios, genera_jurisprudencia, documento_completo_missing, migrated_from_mongo, crawled_from_cgr, canonical_sha256, canonical_bytes, origen_importacion, es_vectorizado, estado, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      params.id,
      params.nDictamen ?? null,
      params.numericDocId ?? null,
      params.yearDocId ?? null,
      params.fechaDocumento ?? null,
      params.fechaIndexacion ?? null,
      params.materia ?? null,
      params.criterio ?? null,
      params.origen ?? null,
      params.origenes ?? null,
      params.descriptores ?? null,
      params.abogados ?? null,
      params.destinatarios ?? null,
      params.generaJurisprudencia,
      params.documentoCompletoMissing ?? null,
      params.migratedFromMongo ?? null,
      params.crawledFromCgr ?? null,
      params.canonicalSha256 ?? null,
      params.canonicalBytes ?? null,
      params.origenImportacion ?? 'crawl_contraloria',
      params.esVectorizado ?? 0,
      params.status,
      now,
      now
    ).run();
  }
}
async function insertDictamenBooleanosLLM(db: D1Database, dictamenId: string, booleanos: any, enrichmentId: string): Promise<void> {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO dictamenes_booleanos_llm (id, dictamen_id, enrichment_id, nuevo, aclarado, relevante, confirmado, boletin, alterado, complementado, reconsiderado_parcialmente, reconsiderado, aplicado, reactivado, recurso_proteccion, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, dictamenId, enrichmentId,
    booleanos.nuevo ? 1 : 0, booleanos.aclarado ? 1 : 0, booleanos.relevante ? 1 : 0, booleanos.confirmado ? 1 : 0, booleanos.boletin ? 1 : 0,
    booleanos.alterado ? 1 : 0, booleanos.complementado ? 1 : 0, booleanos.reconsiderado_parcialmente ? 1 : 0, booleanos.reconsiderado ? 1 : 0,
    booleanos.aplicado ? 1 : 0, booleanos.reactivado ? 1 : 0, booleanos.recurso_proteccion ? 1 : 0,
    nowIso()
  ).run();
}


async function insertDictamenReferencia(db: D1Database, dictamenId: string, refId: string, tipo: string): Promise<void> {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO dictamen_referencias (id, dictamen_id, referencia_id, tipo_referencia, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, dictamenId, refId, tipo, nowIso()).run();
}

async function insertDictamenEtiquetaLLM(db: D1Database, dictamenId: string, etiqueta: string, enrichmentId: string): Promise<void> {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO dictamen_etiquetas_llm (id, dictamen_id, etiqueta, enrichment_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, dictamenId, etiqueta, enrichmentId, nowIso()).run();
}

async function insertDictamenFuenteLegal(db: D1Database, dictamenId: string, fuente: any, enrichmentId: string): Promise<void> {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO dictamen_fuentes_legales (id, dictamen_id, nombre, numero, año, articulo, extra, enrichment_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, dictamenId,
    fuente.nombre || 'Desconocido',
    fuente.numero || null,
    fuente.year || null,
    fuente.articulo || null,
    fuente.extra || null,
    enrichmentId,
    nowIso()
  ).run();
}


async function updateDictamenStatus(db: D1Database, id: string, status: DictamenStatus): Promise<void> {
  await db.prepare("UPDATE dictamen SET estado = ?, updated_at = ? WHERE id = ?").bind(status, nowIso(), id).run();
}
async function updateDictamenDocumentoMissing(db: D1Database, id: string, missing: boolean): Promise<void> {
  await db.prepare("UPDATE dictamen SET documento_completo_missing = ?, updated_at = ? WHERE id = ?").bind(missing ? 1 : 0, nowIso(), id).run();
}
async function updateDictamenCanonical(
  db: D1Database,
  id: string,
  canonical: { sha256: string; bytes: number }
): Promise<void> {
  await db.prepare(
    `UPDATE dictamen
			 SET canonical_sha256 = ?,
				 canonical_bytes = ?,
				 updated_at = ?
			 WHERE id = ?`
  ).bind(canonical.sha256, canonical.bytes, nowIso(), id).run();
}
async function listDictamenIdsForCanonical(
  db: D1Database,
  params: { limit: number; force?: boolean; from?: string; to?: string }
): Promise<string[]> {
  const clauses = [];
  const binds = [];
  if (!params.force) {
    clauses.push("(canonical_sha256 IS NULL OR canonical_bytes IS NULL)");
  }
  if (params.from) {
    clauses.push("date(fecha_documento) >= date(?)");
    binds.push(params.from);
  }
  if (params.to) {
    clauses.push("date(fecha_documento) <= date(?)");
    binds.push(params.to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = params.limit ?? 100;
  const result = await db.prepare(
    `SELECT id
			 FROM dictamen
			 ${where}
			 ORDER BY updated_at DESC
			 LIMIT ?`
  ).bind(...binds, limit).all<{ id: string }>();
  return result.results?.map((row) => row.id) ?? [];
}
async function listDictamenIdsMissingDocumentoCompleto(db: D1Database, limit = 100): Promise<string[]> {
  const result = await db.prepare(
    `SELECT id
			 FROM dictamen
			 WHERE documento_completo_missing IS NULL
			 ORDER BY updated_at DESC
			 LIMIT ?`
  ).bind(limit).all<{ id: string }>();
  return result.results?.map((row) => row.id) ?? [];
}
async function insertRawRef(
  db: D1Database,
  ref: { dictamen_id: string; raw_key: string; sha256: string; bytes: number; created_at: string }
): Promise<void> {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO raw_ref (id, dictamen_id, raw_key, sha256, bytes, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, ref.dictamen_id, ref.raw_key, ref.sha256, ref.bytes, ref.created_at).run();
}
function safeParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
async function insertEnrichment(
  db: D1Database,
  row: {
    dictamen_id: string;
    titulo: string | null;
    resumen: string | null;
    analisis: string | null;
    etiquetas_json: string | null;
    genera_jurisprudencia_llm: number | null;
    fuentes_legales_missing: number | null;
    booleanos_json: string | null;
    fuentes_legales_json: string | null;
    model: string | null;
    migrated_from_mongo: number | null;
    created_at: string;
  }
): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO enrichment
			 (id, dictamen_id, titulo, resumen, analisis, etiquetas_json, genera_jurisprudencia_llm, fuentes_legales_missing, booleanos_json, fuentes_legales_json, model, migrated_from_mongo, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    row.dictamen_id,
    row.titulo,
    row.resumen,
    row.analisis,
    row.etiquetas_json,
    row.genera_jurisprudencia_llm,
    row.fuentes_legales_missing,
    row.booleanos_json,
    row.fuentes_legales_json,
    row.model,
    row.migrated_from_mongo,
    row.created_at
  ).run();
  return id;
}

async function getLatestEnrichment(db: D1Database, dictamenId: string): Promise<EnrichmentRow | null> {
  const result = await db.prepare(
    `SELECT id, dictamen_id, titulo, resumen, analisis, etiquetas_json, genera_jurisprudencia_llm, fuentes_legales_missing, booleanos_json, fuentes_legales_json, model, migrated_from_mongo, created_at
			 FROM enrichment
			 WHERE dictamen_id = ?
			 ORDER BY created_at DESC
			 LIMIT 1`
  ).bind(dictamenId).first<EnrichmentRow>();
  return result ?? null;
}
async function getLatestRawRef(db: D1Database, dictamenId: string): Promise<RawRefRow | null> {
  const result = await db.prepare(
    `SELECT id, dictamen_id, raw_key, sha256, bytes, created_at
			 FROM raw_ref
			 WHERE dictamen_id = ?
			 ORDER BY created_at DESC
			 LIMIT 1`
  ).bind(dictamenId).first<RawRefRow>();
  return result ?? null;
}
async function getStats(db: D1Database): Promise<Record<string, number>> {
  const total = await db.prepare("SELECT COUNT(*) as count FROM dictamen").first<{ count: number }>();
  const enriched = await db.prepare("SELECT COUNT(*) as count FROM dictamen WHERE estado = 'enriched'").first<{ count: number }>();
  const vectorized = await db.prepare("SELECT COUNT(*) as count FROM dictamen WHERE estado = 'vectorized'").first<{ count: number }>();
  return {
    total: total?.count ?? 0,
    enriched: enriched?.count ?? 0,
    vectorized: vectorized?.count ?? 0
  };
}
async function getDashboardStats(db: D1Database): Promise<{
  counts: {
    total: number;
    ingested: number;
    enriched: number;
    vectorized: number;
    error: number;
    invalidInput: number;
  };
  runs24h: { total: number; errors: number; vectorized: number; enriched: number; crawl: number; fuentes: number; backfill: number };
  quality: { valid: number; invalid: number; missing: number };
  activity: { recentRuns: number; lastRunAt: string | null };
  pending: { enrich: number; vectorize: number; fuentes: number };
  missing: {
    documentoCompleto: number;
    documentoCompletoUnknown: number;
    fuentesLegales: number;
    fuentesPendientes: number;
  };
  canonical: { complete: number; missing: number };
  errorsByType: { enrich: number; vectorize: number; crawl: number; fuentes: number; backfill: number };
}> {
  const countsResult = await db.prepare(
    `SELECT estado, COUNT(*) as count
			 FROM dictamen
			 GROUP BY estado`
  ).all<{ estado: string; count: number }>();
  const counts = { total: 0, ingested: 0, enriched: 0, vectorized: 0, error: 0, invalidInput: 0 };
  for (const row of countsResult.results ?? []) {
    if (row.estado === "ingested") counts.ingested = row.count;
    else if (row.estado === "enriched") counts.enriched = row.count;
    else if (row.estado === "vectorized") counts.vectorized = row.count;
    else if (row.estado === "error") counts.error = row.count;
    else if (row.estado === "invalid_input") counts.invalidInput = row.count;
  }
  counts.total = counts.ingested + counts.enriched + counts.vectorized + counts.error + counts.invalidInput;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString();
  const runsResult = await db.prepare(
    `SELECT run_type, status, COUNT(*) as count
			 FROM run_log
			 WHERE started_at >= ?
			 GROUP BY run_type, status`
  ).bind(since).all<{ run_type: string; status: string; count: number }>();
  const runs24h = { total: 0, errors: 0, vectorized: 0, enriched: 0, crawl: 0, fuentes: 0, backfill: 0 };
  for (const row of runsResult.results ?? []) {
    runs24h.total += row.count;
    if (row.status === "error") runs24h.errors += row.count;
    if (row.run_type === "vectorize" && row.status === "completed") runs24h.vectorized += row.count;
    if (row.run_type === "enrich" && row.status === "completed") runs24h.enriched += row.count;
    if (row.run_type === "crawl" && row.status === "completed") runs24h.crawl += row.count;
    if (row.run_type === "fuentes" && row.status === "completed") runs24h.fuentes += row.count;
    if (row.run_type.startsWith("backfill_") && row.status === "completed") runs24h.backfill += row.count;
  }
  const qualityResult = await db.prepare(
    `WITH latest_enrichment AS (
				SELECT dictamen_id, titulo, resumen, analisis, etiquetas_json,
					 ROW_NUMBER() OVER (PARTITION BY dictamen_id ORDER BY created_at DESC) AS rn
				FROM enrichment
			),
			vectorized AS (
				SELECT id FROM dictamen WHERE estado = 'vectorized'
			)
			SELECT
				SUM(CASE WHEN e.dictamen_id IS NULL THEN 1 ELSE 0 END) AS missing_enrichment,
				SUM(CASE WHEN e.dictamen_id IS NOT NULL AND (
					TRIM(COALESCE(e.titulo,'')) = '' OR
					TRIM(COALESCE(e.resumen,'')) = '' OR
					TRIM(COALESCE(e.analisis,'')) = '' OR
					COALESCE(e.etiquetas_json,'[]') = '[]'
				) THEN 1 ELSE 0 END) AS invalid_enrichment,
				SUM(CASE WHEN e.dictamen_id IS NOT NULL AND (
					TRIM(COALESCE(e.titulo,'')) <> '' AND
					TRIM(COALESCE(e.resumen,'')) <> '' AND
					TRIM(COALESCE(e.analisis,'')) <> '' AND
					COALESCE(e.etiquetas_json,'[]') <> '[]'
				) THEN 1 ELSE 0 END) AS valid_enrichment
			FROM vectorized v
			LEFT JOIN latest_enrichment e ON e.dictamen_id = v.id AND e.rn = 1`
  ).first<{ valid_enrichment: number; invalid_enrichment: number; missing_enrichment: number }>();
  const quality = {
    valid: qualityResult?.valid_enrichment ?? 0,
    invalid: qualityResult?.invalid_enrichment ?? 0,
    missing: qualityResult?.missing_enrichment ?? 0
  };
  const recentSince = new Date(Date.now() - 2 * 60 * 1e3).toISOString();
  const recentRuns = await db.prepare("SELECT COUNT(*) as count FROM run_log WHERE started_at >= ?").bind(recentSince).first<{ count: number }>();
  const lastRun = await db.prepare("SELECT MAX(started_at) as last_run FROM run_log").first<{ last_run: string | null }>();
  const activity = {
    recentRuns: recentRuns?.count ?? 0,
    lastRunAt: lastRun?.last_run ?? null
  };
  const docMissing = await db.prepare("SELECT COUNT(*) as count FROM dictamen WHERE documento_completo_missing = 1").first<{ count: number }>();
  const docMissingUnknown = await db.prepare("SELECT COUNT(*) as count FROM dictamen WHERE documento_completo_missing IS NULL").first<{ count: number }>();
  const fuentesStats = await db.prepare(
    `WITH latest_enrichment AS (
				SELECT dictamen_id, fuentes_legales_json, fuentes_legales_missing,
					 ROW_NUMBER() OVER (PARTITION BY dictamen_id ORDER BY created_at DESC) AS rn
				FROM enrichment
			)
			SELECT
				SUM(CASE WHEN COALESCE(fuentes_legales_missing, 0) = 1 THEN 1 ELSE 0 END) AS fuentes_missing,
				SUM(CASE WHEN COALESCE(fuentes_legales_missing, 0) = 0 AND (
					fuentes_legales_json IS NULL OR fuentes_legales_json = '[]'
				) THEN 1 ELSE 0 END) AS fuentes_pending
			FROM latest_enrichment
			WHERE rn = 1`
  ).first<{ fuentes_missing: number; fuentes_pending: number }>();
  const errorsByTypeResult = await db.prepare(
    `SELECT run_type, COUNT(*) as count
			 FROM run_log
			 WHERE started_at >= ?
				AND status = 'error'
			 GROUP BY run_type`
  ).bind(since).all<{ run_type: string; count: number }>();
  const errorsByType = { enrich: 0, vectorize: 0, crawl: 0, fuentes: 0, backfill: 0 };
  for (const row of errorsByTypeResult.results ?? []) {
    if (row.run_type === "enrich") errorsByType.enrich = row.count;
    if (row.run_type === "vectorize") errorsByType.vectorize = row.count;
    if (row.run_type === "crawl") errorsByType.crawl = row.count;
    if (row.run_type === "fuentes") errorsByType.fuentes = row.count;
    if (row.run_type.startsWith("backfill_")) errorsByType.backfill += row.count;
  }
  const pending = {
    enrich: counts.ingested + counts.error,
    vectorize: counts.enriched,
    fuentes: fuentesStats?.fuentes_pending ?? 0
  };
  const missing = {
    documentoCompleto: docMissing?.count ?? 0,
    documentoCompletoUnknown: docMissingUnknown?.count ?? 0,
    fuentesLegales: fuentesStats?.fuentes_missing ?? 0,
    fuentesPendientes: fuentesStats?.fuentes_pending ?? 0
  };
  const canonicalResult = await db.prepare(
    `SELECT
				SUM(CASE WHEN canonical_sha256 IS NOT NULL AND canonical_bytes IS NOT NULL THEN 1 ELSE 0 END) AS complete,
				SUM(CASE WHEN canonical_sha256 IS NULL OR canonical_bytes IS NULL THEN 1 ELSE 0 END) AS missing
			 FROM dictamen`
  ).first<{ complete: number; missing: number }>();
  const canonical = {
    complete: canonicalResult?.complete ?? 0,
    missing: canonicalResult?.missing ?? 0
  };
  return { counts, runs24h, quality, activity, pending, missing, canonical, errorsByType };
}
async function listRuns(db: D1Database, limit = 50): Promise<RunLogRow[]> {
  const result = await db.prepare("SELECT * FROM run_log ORDER BY started_at DESC LIMIT ?").bind(limit).all<RunLogRow>();
  return result.results ?? [];
}
async function listDictamenes(
  db: D1Database,
  filters: { status?: string; generaJurisprudencia?: number | null },
  limit = 50,
  offset = 0
): Promise<Record<string, unknown>[]> {
  const clauses = [];
  const binds = [];
  if (filters.status) {
    clauses.push("estado = ?");
    binds.push(filters.status);
  }
  if (filters.generaJurisprudencia === null) {
    clauses.push("genera_jurisprudencia IS NULL");
  } else if (filters.generaJurisprudencia !== void 0) {
    clauses.push("genera_jurisprudencia = ?");
    binds.push(filters.generaJurisprudencia);
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const sql = `SELECT id, n_dictamen, numeric_doc_id, year_doc_id, fecha_documento, fecha_indexacion, materia, criterio, origen, origenes, descriptores, abogados, destinatarios, genera_jurisprudencia, estado, created_at, updated_at FROM dictamen ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  binds.push(limit, offset);
  const result = await db.prepare(sql).bind(...binds).all();
  return result.results ?? [];
}
async function getDictamenById(db: D1Database, id: string): Promise<{ id: string; n_dictamen: string | null }> {
  const row = await db.prepare("SELECT id, n_dictamen FROM dictamen WHERE id = ?").bind(id).first<{ id: string; n_dictamen: string | null }>();
  return row ?? { id, n_dictamen: null };
}
async function listDictamenByStatus(
  db: D1Database,
  statuses: string[],
  limit = 100,
  order: 'ASC' | 'DESC' = 'DESC'
): Promise<Array<{ id: string; estado: string }>> {
  if (statuses.length === 0) return [];
  const placeholders = statuses.map(() => "?").join(",");
  const direction = order === "ASC" ? "ASC" : "DESC";
  const result = await db.prepare(
    `SELECT id, estado
			 FROM dictamen
			 WHERE estado IN (${placeholders})
			 ORDER BY updated_at ${direction}
			 LIMIT ?`
  ).bind(...statuses, limit).all<{ id: string; estado: string }>();
  return result.results ?? [];
}

// Atajo para obtener solo los IDs segun estado.
async function listDictamenIdsByStatus(
  db: D1Database,
  statuses: string[],
  limit = 100
): Promise<string[]> {
  const rows = await listDictamenByStatus(db, statuses, limit, 'DESC');
  return rows.map((row) => row.id);
}
async function listDictamenIdsWithEmptyEnrichment(db: D1Database, limit = 100): Promise<string[]> {
  const result = await db.prepare(
    `SELECT dictamen_id
			 FROM enrichment
			 WHERE (titulo IS NULL OR TRIM(titulo) = '')
				OR (resumen IS NULL OR TRIM(resumen) = '')
				OR (analisis IS NULL OR TRIM(analisis) = '')
				OR (etiquetas_json IS NULL OR etiquetas_json = '[]')
			 ORDER BY created_at DESC
			 LIMIT ?`
  ).bind(limit).all<{ dictamen_id: string }>();
  return result.results?.map((row) => row.dictamen_id) ?? [];
}
async function listDictamenIdsWithEmptyFuentes(db: D1Database, limit = 100): Promise<string[]> {
  const result = await db.prepare(
    `WITH latest_enrichment AS (
				SELECT dictamen_id, fuentes_legales_json,
					 ROW_NUMBER() OVER (PARTITION BY dictamen_id ORDER BY created_at DESC) AS rn
				FROM enrichment
			)
			SELECT dictamen_id
			FROM latest_enrichment
			WHERE rn = 1
			  AND (
					fuentes_legales_json IS NULL OR
					fuentes_legales_json = '[]' OR
					fuentes_legales_json = '[{}]'
			  )
			ORDER BY dictamen_id ASC
			LIMIT ?`
  ).bind(limit).all<{ dictamen_id: string }>();
  return result.results?.map((row) => row.dictamen_id) ?? [];
}
async function updateEnrichmentFuentes(db: D1Database, dictamenId: string, fuentesLegalesJson: string): Promise<void> {
  await db.prepare(
    `UPDATE enrichment
			 SET fuentes_legales_json = ?, fuentes_legales_missing = 0
			 WHERE id = (
				SELECT id FROM enrichment
				WHERE dictamen_id = ?
				ORDER BY created_at DESC
				LIMIT 1
			 )`
  ).bind(fuentesLegalesJson, dictamenId).run();
}
async function updateEnrichmentFuentesMissing(db: D1Database, dictamenId: string): Promise<void> {
  await db.prepare(
    `UPDATE enrichment
			 SET fuentes_legales_json = COALESCE(fuentes_legales_json, '[{}]'),
			     fuentes_legales_missing = 1
			 WHERE id = (
				SELECT id FROM enrichment
				WHERE dictamen_id = ?
				ORDER BY created_at DESC
				LIMIT 1
			 )`
  ).bind(dictamenId).run();
}
async function listDictamenIdsWithInvalidInput(db: D1Database, reason: string | null, limit = 100): Promise<string[]> {
  const reasonClause = reason ? "AND json_extract(detail_json, '$.reason') = ?" : "";
  const result = await db.prepare(
    `SELECT DISTINCT json_extract(detail_json, '$.dictamenId') as dictamen_id
			 FROM run_log
			 WHERE run_type = 'enrich'
			 AND status = 'invalid_input'
			 AND detail_json IS NOT NULL
			 ${reasonClause}
			 ORDER BY started_at DESC
			 LIMIT ?`
  ).bind(...reason ? [reason, limit] : [limit]).all<{ dictamen_id: string }>();
  return (result.results?.map((row) => row.dictamen_id) ?? []).filter(Boolean);
}
async function getExistingDictamenIds(db: D1Database, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const placeholders = ids.map(() => "?").join(",");
  const result = await db.prepare(`SELECT id FROM dictamen WHERE id IN (${placeholders})`).bind(...ids).all<{ id: string }>();
  return new Set(result.results?.map((row) => row.id) ?? []);
}
async function getDictamenCanonicals(
  db: D1Database,
  ids: string[]
): Promise<Map<string, { sha256: string | null; bytes: number | null }>> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const result = await db.prepare(
    `SELECT id, canonical_sha256, canonical_bytes
			 FROM dictamen
			 WHERE id IN (${placeholders})`
  ).bind(...ids).all<{ id: string; canonical_sha256: string | null; canonical_bytes: number | null }>();
  const map = new Map();
  for (const row of result.results ?? []) {
    map.set(row.id, { sha256: row.canonical_sha256, bytes: row.canonical_bytes });
  }
  return map;
}

export {
  nowIso,
  startRun,
  finishRun,
  upsertDictamen,
  updateDictamenStatus,
  updateDictamenDocumentoMissing,
  updateDictamenCanonical,
  listDictamenIdsForCanonical,
  listDictamenIdsMissingDocumentoCompleto,
  insertRawRef,
  insertEnrichment,
  getLatestEnrichment,
  getLatestRawRef,
  getStats,
  getDashboardStats,
  listRuns,
  listDictamenes,
  getDictamenById,
  listDictamenByStatus,
  listDictamenIdsByStatus,
  listDictamenIdsWithEmptyEnrichment,
  listDictamenIdsWithEmptyFuentes,
  updateEnrichmentFuentes,
  updateEnrichmentFuentesMissing,
  listDictamenIdsWithInvalidInput,
  getExistingDictamenIds,
  getDictamenCanonicals,
  getOrCreateCategory,
  insertDictamenBooleanosLLM,
  insertDictamenReferencia,
  insertDictamenEtiquetaLLM,
  insertDictamenFuenteLegal
};


