// Acceso a D1 (base: cgr-dictamenes c391c767).
// Tablas principales: dictamenes, enriquecimiento, registro_ejecucion.
// Tablas principales: dictamenes, enriquecimiento
import type { DictamenStatus, EnrichmentRow } from '../types';

// Parámetros de upsert para la tabla dictamenes.
type DictamenUpsertParams = {
  id: string;
  generaJurisprudencia: number | null;
  status: DictamenStatus;
  numero?: string | null;
  anio?: number | null;
  fechaDocumento?: string | null;
  fechaIndexacion?: string | null;
  materia?: string | null;
  criterio?: string | null;
  destinatarios?: string | null;
  origenImportacion?: string | null;
};

function nowIso() {
  return new Date().toISOString();
}


// ─── Historial de Cambios ────────────────────────────────────────────

async function logChange(db: D1Database, dictamenId: string, campo: string, vOld: any, vNew: any, origen: string) {
  await db.prepare(
    `INSERT INTO historial_cambios (dictamen_id, campo_modificado, valor_anterior, valor_nuevo, origen, fecha_cambio)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(dictamenId, campo, String(vOld ?? ""), String(vNew ?? ""), origen, nowIso()).run();
}

// ─── Dictámenes ──────────────────────────────────────────────────────

async function upsertDictamen(db: D1Database, params: DictamenUpsertParams): Promise<void> {
  const now = nowIso();
  const existing = await db.prepare("SELECT * FROM dictamenes WHERE id = ?").bind(params.id).first<Record<string, any>>();

  if (existing) {
    // Si ya existe y NO está en error, no hacer nada (deduplicación).
    if (existing.estado && existing.estado !== 'error') {
      console.log(`[SKIP] Dictamen ${params.id} ya existe con estado ${existing.estado}. No se actualiza.`);
      return;
    }

    // Rastrear cambios en campos clave.
    const fieldsToTrack: (keyof DictamenUpsertParams & string)[] = [
      'numero', 'fechaDocumento', 'materia', 'criterio', 'destinatarios'
    ];
    const mapping: Record<string, string> = {
      numero: 'numero', fechaDocumento: 'fecha_documento',
      materia: 'materia', criterio: 'criterio', destinatarios: 'destinatarios'
    };
    for (const field of fieldsToTrack) {
      const dbField = mapping[field];
      const newVal = params[field];
      const oldVal = existing[dbField];
      if (newVal !== undefined && newVal !== oldVal) {
        await logChange(db, params.id, dbField, oldVal, newVal, params.origenImportacion ?? 'crawl_contraloria');
      }
    }

    await db.prepare(
      `UPDATE dictamenes
       SET numero = COALESCE(?, numero),
           anio = COALESCE(?, anio),
           fecha_documento = COALESCE(?, fecha_documento),
           fecha_indexacion = COALESCE(?, fecha_indexacion),
           materia = COALESCE(?, materia),
           criterio = COALESCE(?, criterio),
           destinatarios = COALESCE(?, destinatarios),
           origen_importacion = COALESCE(?, origen_importacion),
           estado = ?,
           updated_at = ?
       WHERE id = ?`
    ).bind(
      params.numero ?? null,
      params.anio ?? null,
      params.fechaDocumento ?? null,
      params.fechaIndexacion ?? null,
      params.materia ?? null,
      params.criterio ?? null,
      params.destinatarios ?? null,
      params.origenImportacion ?? null,
      params.status,
      now,
      params.id
    ).run();
  } else {
    await db.prepare(
      `INSERT INTO dictamenes
       (id, numero, anio, fecha_documento, fecha_indexacion, materia, criterio, destinatarios,
        origen_importacion, estado, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      params.id,
      params.numero ?? null,
      params.anio ?? null,
      params.fechaDocumento ?? null,
      params.fechaIndexacion ?? null,
      params.materia ?? null,
      params.criterio ?? null,
      params.destinatarios ?? null,
      params.origenImportacion ?? 'crawl_contraloria',
      params.status,
      now,
      now
    ).run();
  }
}

async function updateDictamenStatus(db: D1Database, id: string, status: DictamenStatus): Promise<void> {
  await db.prepare("UPDATE dictamenes SET estado = ?, updated_at = ? WHERE id = ?").bind(status, nowIso(), id).run();
}

async function getExistingDictamenIds(db: D1Database, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const placeholders = ids.map(() => "?").join(",");
  const result = await db.prepare(`SELECT id FROM dictamenes WHERE id IN (${placeholders})`).bind(...ids).all<{ id: string }>();
  return new Set(result.results?.map((row) => row.id) ?? []);
}

async function getDictamenById(db: D1Database, id: string): Promise<{ id: string; numero: string | null; estado: string | null }> {
  const row = await db.prepare("SELECT id, numero, estado FROM dictamenes WHERE id = ?").bind(id).first<{ id: string; numero: string | null; estado: string | null }>();
  return row ?? { id, numero: null, estado: null };
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
     FROM dictamenes
     WHERE estado IN (${placeholders})
     ORDER BY updated_at ${direction}
     LIMIT ?`
  ).bind(...statuses, limit).all<{ id: string; estado: string }>();
  return result.results ?? [];
}

async function listDictamenIdsByStatus(
  db: D1Database,
  statuses: string[],
  limit = 100
): Promise<string[]> {
  const rows = await listDictamenByStatus(db, statuses, limit, 'DESC');
  return rows.map((row) => row.id);
}

async function listDictamenes(
  db: D1Database,
  filters: { status?: string; generaJurisprudencia?: number | null },
  limit = 50,
  offset = 0
): Promise<Record<string, unknown>[]> {
  const clauses = [];
  const binds: (string | number)[] = [];
  if (filters.status) {
    clauses.push("d.estado = ?");
    binds.push(filters.status);
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const sql = `SELECT d.id, d.numero, d.anio, d.fecha_documento, d.materia, d.criterio,
                      d.destinatarios, d.estado, d.created_at, d.updated_at,
                      e.titulo, e.resumen
               FROM dictamenes d
               LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
               ${whereClause}
               ORDER BY d.created_at DESC LIMIT ? OFFSET ?`;
  binds.push(limit, offset);
  const result = await db.prepare(sql).bind(...binds).all();
  return result.results ?? [];
}

// ─── Clave KV ────────────────────────────────────────────────────────
// La clave KV siempre se computa desde el ID del dictamen.
// No necesitamos tabla `raw_ref` — la función es pura.

function getKvKey(dictamenId: string): string {
  return dictamenId; // Removido el prefijo "dictamen:" para coincidir con legacy original de mongo.
}

// Función de compatibilidad para código que usaba getLatestRawRef.
// Retorna un objeto con la clave KV computada (sin consultar BD).
async function getLatestRawRef(_db: D1Database, dictamenId: string): Promise<{ raw_key: string; dictamen_id: string } | null> {
  return { raw_key: getKvKey(dictamenId), dictamen_id: dictamenId };
}

// ─── Enriquecimiento ─────────────────────────────────────────────────

async function insertEnrichment(
  db: D1Database,
  row: {
    dictamen_id: string;
    titulo: string | null;
    resumen: string | null;
    analisis: string | null;
    etiquetas_json: string | null;
    genera_jurisprudencia_llm: number | null;
    booleanos_json: string | null;
    fuentes_legales_json: string | null;
    model: string | null;
  }
): Promise<string> {
  // enriquecimiento tiene PK = dictamen_id (relación 1:1).
  // Usamos INSERT OR REPLACE para sobrescribir enrichments previos.
  await db.prepare(
    `INSERT OR REPLACE INTO enriquecimiento
     (dictamen_id, titulo, resumen, analisis, etiquetas_json,
      genera_jurisprudencia, booleanos_json, fuentes_legales_json,
      modelo_llm, fecha_enriquecimiento)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.dictamen_id,
    row.titulo,
    row.resumen,
    row.analisis,
    row.etiquetas_json,
    row.genera_jurisprudencia_llm ?? 0,
    row.booleanos_json,
    row.fuentes_legales_json,
    row.model,
    nowIso()
  ).run();
  return row.dictamen_id; // PK es dictamen_id, no UUID
}

async function getLatestEnrichment(db: D1Database, dictamenId: string): Promise<EnrichmentRow | null> {
  const result = await db.prepare(
    `SELECT dictamen_id, titulo, resumen, analisis, etiquetas_json,
            genera_jurisprudencia, booleanos_json, fuentes_legales_json,
            modelo_llm, fecha_enriquecimiento
     FROM enriquecimiento
     WHERE dictamen_id = ?`
  ).bind(dictamenId).first<EnrichmentRow>();
  return result ?? null;
}

async function listDictamenIdsWithEmptyEnrichment(db: D1Database, limit = 100): Promise<string[]> {
  const result = await db.prepare(
    `SELECT dictamen_id
     FROM enriquecimiento
     WHERE (titulo IS NULL OR TRIM(titulo) = '')
        OR (resumen IS NULL OR TRIM(resumen) = '')
        OR (analisis IS NULL OR TRIM(analisis) = '')
        OR (etiquetas_json IS NULL OR etiquetas_json = '[]')
     LIMIT ?`
  ).bind(limit).all<{ dictamen_id: string }>();
  return result.results?.map((row) => row.dictamen_id) ?? [];
}

async function listDictamenIdsWithEmptyFuentes(db: D1Database, limit = 100): Promise<string[]> {
  const result = await db.prepare(
    `SELECT dictamen_id
     FROM enriquecimiento
     WHERE fuentes_legales_json IS NULL
        OR fuentes_legales_json = '[]'
        OR fuentes_legales_json = '[{}]'
     LIMIT ?`
  ).bind(limit).all<{ dictamen_id: string }>();
  return result.results?.map((row) => row.dictamen_id) ?? [];
}

async function updateEnrichmentFuentes(db: D1Database, dictamenId: string, fuentesLegalesJson: string): Promise<void> {
  await db.prepare(
    `UPDATE enriquecimiento SET fuentes_legales_json = ? WHERE dictamen_id = ?`
  ).bind(fuentesLegalesJson, dictamenId).run();
}

// ─── Tablas M:N (etiquetas, booleanos, fuentes, referencias) ─────────

async function insertDictamenEtiquetaLLM(db: D1Database, dictamenId: string, etiqueta: string): Promise<void> {
  await db.prepare(
    `INSERT INTO dictamen_etiquetas_llm (dictamen_id, etiqueta) VALUES (?, ?)`
  ).bind(dictamenId, etiqueta).run();
}

async function insertDictamenFuenteLegal(db: D1Database, dictamenId: string, fuente: any): Promise<void> {
  await db.prepare(
    `INSERT INTO dictamen_fuentes_legales (dictamen_id, tipo_norma, numero, articulo, extra, year, sector)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    dictamenId,
    fuente.nombre || fuente.tipo_norma || 'Desconocido',
    fuente.numero || null,
    fuente.articulo || null,
    fuente.extra || null,
    fuente.year || null,
    fuente.sector || null
  ).run();
}

async function insertDictamenBooleanosLLM(db: D1Database, dictamenId: string, booleanos: any): Promise<void> {
  // Actualizar la tabla atributos_juridicos (relación 1:1 con dictamenes)
  await db.prepare(
    `INSERT OR REPLACE INTO atributos_juridicos
     (dictamen_id, es_nuevo, es_relevante, en_boletin, recurso_proteccion,
      aclarado, alterado, aplicado, complementado, confirmado,
      reactivado, reconsiderado, reconsiderado_parcialmente)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    dictamenId,
    booleanos.nuevo ? 1 : 0, booleanos.relevante ? 1 : 0, booleanos.boletin ? 1 : 0,
    booleanos.recurso_proteccion ? 1 : 0, booleanos.aclarado ? 1 : 0, booleanos.alterado ? 1 : 0,
    booleanos.aplicado ? 1 : 0, booleanos.complementado ? 1 : 0, booleanos.confirmado ? 1 : 0,
    booleanos.reactivado ? 1 : 0, booleanos.reconsiderado ? 1 : 0,
    booleanos.reconsiderado_parcialmente ? 1 : 0
  ).run();
}

async function insertDictamenReferencia(db: D1Database, dictamenId: string, refNombre: string, tipo: string): Promise<void> {
  await db.prepare(
    `INSERT INTO dictamen_referencias (dictamen_id, dictamen_ref_nombre, url)
     VALUES (?, ?, ?)`
  ).bind(dictamenId, refNombre, tipo).run();
}

// ─── Estadísticas ────────────────────────────────────────────────────

async function getStats(db: D1Database): Promise<Record<string, number>> {
  const total = await db.prepare("SELECT COUNT(*) as count FROM dictamenes").first<{ count: number }>();
  const enriched = await db.prepare("SELECT COUNT(*) as count FROM dictamenes WHERE estado = 'enriched'").first<{ count: number }>();
  const vectorized = await db.prepare("SELECT COUNT(*) as count FROM dictamenes WHERE estado = 'vectorized'").first<{ count: number }>();
  return {
    total: total?.count ?? 0,
    enriched: enriched?.count ?? 0,
    vectorized: vectorized?.count ?? 0
  };
}

async function getDashboardStats(db: D1Database): Promise<{
  counts: { total: number; ingested: number; enriched: number; vectorized: number; error: number };
  runs24h: { total: number; errors: number };
  quality: { valid: number; invalid: number; missing: number };
  activity: { recentRuns: number; lastRunAt: string | null };
  pending: { enrich: number; vectorize: number };
}> {
  const countsResult = await db.prepare(
    `SELECT estado, COUNT(*) as count FROM dictamenes GROUP BY estado`
  ).all<{ estado: string; count: number }>();
  const counts = { total: 0, ingested: 0, enriched: 0, vectorized: 0, error: 0 };
  for (const row of countsResult.results ?? []) {
    if (row.estado === "ingested") counts.ingested = row.count;
    else if (row.estado === "enriched") counts.enriched = row.count;
    else if (row.estado === "vectorized") counts.vectorized = row.count;
    else if (row.estado === "error") counts.error = row.count;
  }
  counts.total = counts.ingested + counts.enriched + counts.vectorized + counts.error;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString();
  // Se eliminó la dependencia de registro_ejecucion
  const runs24h = { total: 0, errors: 0 };

  const qualityResult = await db.prepare(
    `SELECT
       SUM(CASE WHEN e.dictamen_id IS NULL THEN 1 ELSE 0 END) AS missing_enrichment,
       SUM(CASE WHEN e.dictamen_id IS NOT NULL AND (
         TRIM(COALESCE(e.titulo,'')) = '' OR TRIM(COALESCE(e.resumen,'')) = '' OR
         TRIM(COALESCE(e.analisis,'')) = ''
       ) THEN 1 ELSE 0 END) AS invalid_enrichment,
       SUM(CASE WHEN e.dictamen_id IS NOT NULL AND
         TRIM(COALESCE(e.titulo,'')) <> '' AND TRIM(COALESCE(e.resumen,'')) <> '' AND
         TRIM(COALESCE(e.analisis,'')) <> ''
       THEN 1 ELSE 0 END) AS valid_enrichment
     FROM dictamenes d
     LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
     WHERE d.estado = 'vectorized'`
  ).first<{ valid_enrichment: number; invalid_enrichment: number; missing_enrichment: number }>();
  const quality = {
    valid: qualityResult?.valid_enrichment ?? 0,
    invalid: qualityResult?.invalid_enrichment ?? 0,
    missing: qualityResult?.missing_enrichment ?? 0
  };

  const recentSince = new Date(Date.now() - 2 * 60 * 1e3).toISOString();
  // Se eliminó la dependencia de registro_ejecucion
  const activity = {
    recentRuns: 0,
    lastRunAt: null
  };

  const pending = {
    enrich: counts.ingested + counts.error,
    vectorize: counts.enriched
  };

  return { counts, runs24h, quality, activity, pending };
}



// ─── Auxiliares ───────────────────────────────────────────────────────

function safeParseJson(value: string): unknown | null {
  try { return JSON.parse(value); } catch { return null; }
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ─── Exports ─────────────────────────────────────────────────────────

export {
  nowIso,
  upsertDictamen,
  updateDictamenStatus,
  getKvKey,
  getLatestRawRef, // compatibilidad — computa clave KV sin DB
  insertEnrichment,
  getLatestEnrichment,
  getStats,
  getDashboardStats,
  listDictamenes,
  getDictamenById,
  listDictamenByStatus,
  listDictamenIdsByStatus,
  listDictamenIdsWithEmptyEnrichment,
  listDictamenIdsWithEmptyFuentes,
  updateEnrichmentFuentes,
  getExistingDictamenIds,
  insertDictamenBooleanosLLM,
  insertDictamenReferencia,
  insertDictamenEtiquetaLLM,
  insertDictamenFuenteLegal
};
