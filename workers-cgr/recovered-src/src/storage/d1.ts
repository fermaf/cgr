// src/storage/d1.ts
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
async function startRun(db, runType, detail) {
  const id = crypto.randomUUID();
  const startedAt = nowIso();
  const detailJson = detail ? JSON.stringify(detail) : null;
  await db.prepare(
    `INSERT INTO run_log (id, run_type, status, detail_json, started_at)
			 VALUES (?, ?, ?, ?, ?)`
  ).bind(id, runType, "started", detailJson, startedAt).run();
  return id;
}
__name(startRun, "startRun");
async function finishRun(db, runId, status, detail) {
  const finishedAt = nowIso();
  const existing = await db.prepare("SELECT detail_json FROM run_log WHERE id = ?").bind(runId).first();
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
__name(finishRun, "finishRun");
async function upsertDictamen(db, params) {
  const now = nowIso();
  await db.prepare(
    `INSERT OR IGNORE INTO dictamen
			 (id, n_dictamen, numeric_doc_id, year_doc_id, fecha_documento, fecha_indexacion, materia, criterio, origen, origenes, descriptores, abogados, destinatarios, genera_jurisprudencia, documento_completo_missing, migrated_from_mongo, crawled_from_cgr, canonical_sha256, canonical_bytes, estado, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    params.status,
    now,
    now
  ).run();
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
    params.status,
    now,
    params.id
  ).run();
}
__name(upsertDictamen, "upsertDictamen");
async function updateDictamenStatus(db, id, status) {
  await db.prepare("UPDATE dictamen SET estado = ?, updated_at = ? WHERE id = ?").bind(status, nowIso(), id).run();
}
__name(updateDictamenStatus, "updateDictamenStatus");
async function updateDictamenDocumentoMissing(db, id, missing) {
  await db.prepare("UPDATE dictamen SET documento_completo_missing = ?, updated_at = ? WHERE id = ?").bind(missing ? 1 : 0, nowIso(), id).run();
}
__name(updateDictamenDocumentoMissing, "updateDictamenDocumentoMissing");
async function updateDictamenCanonical(db, id, canonical) {
  await db.prepare(
    `UPDATE dictamen
			 SET canonical_sha256 = ?,
				 canonical_bytes = ?,
				 updated_at = ?
			 WHERE id = ?`
  ).bind(canonical.sha256, canonical.bytes, nowIso(), id).run();
}
__name(updateDictamenCanonical, "updateDictamenCanonical");
async function listDictamenIdsForCanonical(db, params) {
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
  ).bind(...binds, limit).all();
  return result.results?.map((row) => row.id) ?? [];
}
__name(listDictamenIdsForCanonical, "listDictamenIdsForCanonical");
async function listDictamenIdsMissingDocumentoCompleto(db, limit = 100) {
  const result = await db.prepare(
    `SELECT id
			 FROM dictamen
			 WHERE documento_completo_missing IS NULL
			 ORDER BY updated_at DESC
			 LIMIT ?`
  ).bind(limit).all();
  return result.results?.map((row) => row.id) ?? [];
}
__name(listDictamenIdsMissingDocumentoCompleto, "listDictamenIdsMissingDocumentoCompleto");
async function insertRawRef(db, ref) {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO raw_ref (id, dictamen_id, raw_key, sha256, bytes, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, ref.dictamen_id, ref.raw_key, ref.sha256, ref.bytes, ref.created_at).run();
  return id;
}
__name(insertRawRef, "insertRawRef");
function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
__name(safeParseJson, "safeParseJson");
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
__name(isPlainObject, "isPlainObject");
async function insertEnrichment(db, row) {
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
__name(insertEnrichment, "insertEnrichment");
async function getLatestEnrichment(db, dictamenId) {
  const result = await db.prepare(
    `SELECT id, dictamen_id, titulo, resumen, analisis, etiquetas_json, genera_jurisprudencia_llm, fuentes_legales_missing, booleanos_json, fuentes_legales_json, model, migrated_from_mongo, created_at
			 FROM enrichment
			 WHERE dictamen_id = ?
			 ORDER BY created_at DESC
			 LIMIT 1`
  ).bind(dictamenId).first();
  return result ?? null;
}
__name(getLatestEnrichment, "getLatestEnrichment");
async function getLatestRawRef(db, dictamenId) {
  const result = await db.prepare(
    `SELECT id, dictamen_id, raw_key, sha256, bytes, created_at
			 FROM raw_ref
			 WHERE dictamen_id = ?
			 ORDER BY created_at DESC
			 LIMIT 1`
  ).bind(dictamenId).first();
  return result ?? null;
}
__name(getLatestRawRef, "getLatestRawRef");
async function getStats(db) {
  const total = await db.prepare("SELECT COUNT(*) as count FROM dictamen").first();
  const enriched = await db.prepare("SELECT COUNT(*) as count FROM dictamen WHERE estado = 'enriched'").first();
  const vectorized = await db.prepare("SELECT COUNT(*) as count FROM dictamen WHERE estado = 'vectorized'").first();
  return {
    total: total?.count ?? 0,
    enriched: enriched?.count ?? 0,
    vectorized: vectorized?.count ?? 0
  };
}
__name(getStats, "getStats");
async function getDashboardStats(db) {
  const countsResult = await db.prepare(
    `SELECT estado, COUNT(*) as count
			 FROM dictamen
			 GROUP BY estado`
  ).all();
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
  ).bind(since).all();
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
  ).first();
  const quality = {
    valid: qualityResult?.valid_enrichment ?? 0,
    invalid: qualityResult?.invalid_enrichment ?? 0,
    missing: qualityResult?.missing_enrichment ?? 0
  };
  const recentSince = new Date(Date.now() - 2 * 60 * 1e3).toISOString();
  const recentRuns = await db.prepare("SELECT COUNT(*) as count FROM run_log WHERE started_at >= ?").bind(recentSince).first();
  const lastRun = await db.prepare("SELECT MAX(started_at) as last_run FROM run_log").first();
  const activity = {
    recentRuns: recentRuns?.count ?? 0,
    lastRunAt: lastRun?.last_run ?? null
  };
  const docMissing = await db.prepare("SELECT COUNT(*) as count FROM dictamen WHERE documento_completo_missing = 1").first();
  const docMissingUnknown = await db.prepare("SELECT COUNT(*) as count FROM dictamen WHERE documento_completo_missing IS NULL").first();
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
  ).first();
  const errorsByTypeResult = await db.prepare(
    `SELECT run_type, COUNT(*) as count
			 FROM run_log
			 WHERE started_at >= ?
				AND status = 'error'
			 GROUP BY run_type`
  ).bind(since).all();
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
  ).first();
  const canonical = {
    complete: canonicalResult?.complete ?? 0,
    missing: canonicalResult?.missing ?? 0
  };
  return { counts, runs24h, quality, activity, pending, missing, canonical, errorsByType };
}
__name(getDashboardStats, "getDashboardStats");
async function listRuns(db, limit = 50) {
  const result = await db.prepare("SELECT * FROM run_log ORDER BY started_at DESC LIMIT ?").bind(limit).all();
  return result.results ?? [];
}
__name(listRuns, "listRuns");
async function listDictamenes(db, filters, limit = 50, offset = 0) {
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
__name(listDictamenes, "listDictamenes");
async function getDictamenById(db, id) {
  const row = await db.prepare("SELECT id, n_dictamen FROM dictamen WHERE id = ?").bind(id).first();
  return row ?? { id, n_dictamen: null };
}
__name(getDictamenById, "getDictamenById");
async function listDictamenByStatus(db, statuses, limit = 100, order = "DESC") {
  if (statuses.length === 0) return [];
  const placeholders = statuses.map(() => "?").join(",");
  const direction = order === "ASC" ? "ASC" : "DESC";
  const result = await db.prepare(
    `SELECT id, estado
			 FROM dictamen
			 WHERE estado IN (${placeholders})
			 ORDER BY updated_at ${direction}
			 LIMIT ?`
  ).bind(...statuses, limit).all();
  return result.results ?? [];
}
__name(listDictamenByStatus, "listDictamenByStatus");
async function listDictamenIdsWithEmptyEnrichment(db, limit = 100) {
  const result = await db.prepare(
    `SELECT dictamen_id
			 FROM enrichment
			 WHERE (titulo IS NULL OR TRIM(titulo) = '')
				OR (resumen IS NULL OR TRIM(resumen) = '')
				OR (analisis IS NULL OR TRIM(analisis) = '')
				OR (etiquetas_json IS NULL OR etiquetas_json = '[]')
			 ORDER BY created_at DESC
			 LIMIT ?`
  ).bind(limit).all();
  return result.results?.map((row) => row.dictamen_id) ?? [];
}
__name(listDictamenIdsWithEmptyEnrichment, "listDictamenIdsWithEmptyEnrichment");
async function listDictamenIdsWithEmptyFuentes(db, limit = 100) {
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
  ).bind(limit).all();
  return result.results?.map((row) => row.dictamen_id) ?? [];
}
__name(listDictamenIdsWithEmptyFuentes, "listDictamenIdsWithEmptyFuentes");
async function updateEnrichmentFuentes(db, dictamenId, fuentesLegalesJson) {
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
__name(updateEnrichmentFuentes, "updateEnrichmentFuentes");
async function updateEnrichmentFuentesMissing(db, dictamenId) {
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
__name(updateEnrichmentFuentesMissing, "updateEnrichmentFuentesMissing");
async function listDictamenIdsWithInvalidInput(db, reason, limit = 100) {
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
  ).bind(...reason ? [reason, limit] : [limit]).all();
  return result.results?.map((row) => row.dictamen_id).filter(Boolean);
}
__name(listDictamenIdsWithInvalidInput, "listDictamenIdsWithInvalidInput");
async function getExistingDictamenIds(db, ids) {
  if (ids.length === 0) return /* @__PURE__ */ new Set();
  const placeholders = ids.map(() => "?").join(",");
  const result = await db.prepare(`SELECT id FROM dictamen WHERE id IN (${placeholders})`).bind(...ids).all();
  return new Set(result.results?.map((row) => row.id) ?? []);
}
__name(getExistingDictamenIds, "getExistingDictamenIds");
async function getDictamenCanonicals(db, ids) {
  if (ids.length === 0) return /* @__PURE__ */ new Map();
  const placeholders = ids.map(() => "?").join(",");
  const result = await db.prepare(
    `SELECT id, canonical_sha256, canonical_bytes
			 FROM dictamen
			 WHERE id IN (${placeholders})`
  ).bind(...ids).all();
  const map = /* @__PURE__ */ new Map();
  for (const row of result.results ?? []) {
    map.set(row.id, { sha256: row.canonical_sha256, bytes: row.canonical_bytes });
  }
  return map;
}
__name(getDictamenCanonicals, "getDictamenCanonicals");
