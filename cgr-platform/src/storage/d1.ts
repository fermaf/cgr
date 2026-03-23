// Acceso a D1 (base: cgr-dictamenes c391c767).
// Tablas principales: dictamenes, enriquecimiento, registro_ejecucion.
// Tablas principales: dictamenes, enriquecimiento
import type { DictamenStatus, EnrichmentRow, DictamenEventType } from '../types';

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
  oldUrl?: string | null;
  divisionId?: number | null;
  force?: boolean;
};

function nowIso() {
  return new Date().toISOString();
}


// ─── Historial de Cambios y Event Sourcing ──────────────────────────────

async function logChange(db: D1Database, dictamenId: string, campo: string, vOld: any, vNew: any, origen: string) {
  await db.prepare(
    `INSERT INTO historial_cambios (dictamen_id, campo_modificado, valor_anterior, valor_nuevo, origen, fecha_cambio)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(dictamenId, campo, String(vOld ?? ""), String(vNew ?? ""), origen, nowIso()).run();
}

async function logDictamenEvent(
  db: D1Database,
  params: {
    dictamen_id: string;
    event_type: DictamenEventType;
    status_from?: string | null;
    status_to?: string | null;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  await db.prepare(
    `INSERT INTO dictamen_events (dictamen_id, event_type, status_from, status_to, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    params.dictamen_id,
    params.event_type,
    params.status_from ?? null,
    params.status_to ?? null,
    params.metadata ? JSON.stringify(params.metadata) : null,
    nowIso()
  ).run();
}

// ─── Dictámenes ──────────────────────────────────────────────────────

async function upsertDictamen(db: D1Database, params: DictamenUpsertParams): Promise<void> {
  const now = nowIso();
  const existing = await db.prepare("SELECT * FROM dictamenes WHERE id = ?").bind(params.id).first<Record<string, any>>();

  if (existing) {
    // Si ya existe y NO está en error, no hacer nada (deduplicación).
    // Permitir bypass si params.force es true.
    if (!params.force && existing.estado && existing.estado !== 'error') {
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
           old_url = COALESCE(?, old_url),
           division_id = COALESCE(?, division_id),
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
      params.oldUrl ?? null,
      params.divisionId ?? null,
      params.status,
      now,
      params.id
    ).run();
  } else {
    await db.prepare(
      `INSERT INTO dictamenes
       (id, numero, anio, fecha_documento, fecha_indexacion, materia, criterio, destinatarios,
        origen_importacion, old_url, division_id, estado, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      params.oldUrl ?? null,
      params.divisionId ?? null,
      params.status,
      now,
      now
    ).run();
  }
}

async function getOrInsertDivisionId(db: D1Database, origenes: unknown): Promise<number | null> {
  if (!origenes || typeof origenes !== 'string') return null;
  const parts = origenes.split(',').map(p => p.trim());
  const sigla = parts[0]?.toUpperCase();
  if (!sigla) return null;

  // Intentar deducir el nombre completo del mismo string origenes (ej: "DJA, División Jurídica")
  let nombreDeducido = parts.length > 1 ? parts[1] : null;

  // Mapeo exhaustivo y actualizado de divisiones (Fuente: CGR y Manual de Organización)
  const knownMap: Record<string, string> = {
    'DJU': 'División Jurídica',
    'DJA': 'División Jurídica', // Alias
    'DICOF': 'División de Contabilidad y Finanzas Públicas',
    'DCO': 'División de Contabilidad y Finanzas Públicas',
    'DIR': 'División de Infraestructura y Regulación',
    'DAEE': 'División de Auditoría de Entidades Estatales', // Tradicional
    'DGOREMUN': 'División de Gobiernos Regionales y Municipalidades',
    'CGR': 'Gabinete Contralor General',
    'DPP': 'División de Personal y Presupuesto',
    'DFP': 'División de Función Pública',
    'CRM': 'Contraloría Regional Metropolitana',
    'CRMI': 'Contraloría Regional Metropolitana I',
    'DPA': 'División de Personal de la Administración',
    'MUN': 'Municipalidades',
    'DAC': 'Departamento de Auditoría y Control',
    'DAU': 'División de Auditoría',
    'RCP': 'Registro de Contratos y Personal', // Contexto CGR
    'CIJ': 'Comité de Informatización Jurídica',
    'RAP': 'Registro de Actos de Personal',
    'DMA': 'Departamento de Medio Ambiente',
    'DFFAA': 'Departamento de Fuerzas Armadas y Seguridad Pública'
  };

  // Si no tenemos nombre deducido de 'origenes', buscar en el mapa conocido
  if (!nombreDeducido || nombreDeducido.length < 5) {
      nombreDeducido = knownMap[sigla] || null;
  }

  // Fallback final si no hay forma de saber qué es
  const finalName = nombreDeducido || `División No Identificada: ${sigla}`;

  // Consultar a la base de datos si la división ya fue ingresada
  const row = await db.prepare('SELECT id, nombre_completo FROM cat_divisiones WHERE codigo = ?').bind(sigla).first<{ id: number; nombre_completo: string }>();

  if (row) {
    // Si el nombre es genérico/feo ("Nueva División..."), intentar actualizarlo con el nuevo valor más preciso
    if (row.nombre_completo && row.nombre_completo.includes('Nueva División Autogenerada') && nombreDeducido) {
        await db.prepare('UPDATE cat_divisiones SET nombre_completo = ? WHERE id = ?').bind(finalName, row.id).run();
    }
    return row.id;
  }

  // Autogenerar dinámicamente y devolver ID
  try {
    const insertRes = await db.prepare(
      'INSERT INTO cat_divisiones (codigo, nombre_completo) VALUES (?, ?) RETURNING id'
    ).bind(sigla, finalName).first<{ id: number }>();
    return insertRes?.id ?? null;
  } catch (err) {
    console.warn(`[D1] No se pudo autogenerar división para sigla ${sigla}:`, err);
    return null;
  }
}

async function updateDictamenStatus(
  db: D1Database,
  id: string,
  status: DictamenStatus,
  eventType: DictamenEventType,
  metadata?: Record<string, any>
): Promise<void> {
  const existing = await getDictamenById(db, id);
  await db.prepare("UPDATE dictamenes SET estado = ?, updated_at = ? WHERE id = ?").bind(status, nowIso(), id).run();

  await logDictamenEvent(db, {
    dictamen_id: id,
    event_type: eventType,
    status_from: existing.estado,
    status_to: status,
    metadata
  });
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

async function listDictamenIdsParaProcesar(db: D1Database, limit = 50): Promise<string[]> {
  const result = await db.prepare(
    `SELECT d.id
     FROM dictamenes d
     LEFT JOIN enriquecimiento e ON d.id = e.dictamen_id
     WHERE d.estado = 'ingested'
       AND d.old_url IS NOT NULL 
       AND d.division_id IS NOT NULL
       AND (e.modelo_llm IS NULL OR e.modelo_llm != 'mistral-large-2512')
     ORDER BY d.fecha_documento DESC, d.numero DESC
     LIMIT ?`
  ).bind(limit).all<{ id: string }>();
  return result.results?.map((row) => row.id) ?? [];
}

async function checkoutDictamenesParaProcesar(db: D1Database, limit = 50): Promise<string[]> {
  const result = await db.prepare(
    `UPDATE dictamenes 
     SET estado = 'processing', updated_at = ?
     WHERE id IN (
         SELECT d.id
         FROM dictamenes d
         LEFT JOIN enriquecimiento e ON d.id = e.dictamen_id
         WHERE d.estado = 'ingested'
           AND d.old_url IS NOT NULL 
           AND d.division_id IS NOT NULL
           AND (e.modelo_llm IS NULL OR e.modelo_llm != 'mistral-large-2512')
         ORDER BY d.fecha_documento DESC, d.numero DESC
         LIMIT ?
     ) RETURNING id;`
  ).bind(nowIso(), limit).all<{ id: string }>();

  const ids = result.results?.map((row) => row.id) ?? [];

  for (const id of ids) {
    await logDictamenEvent(db, {
      dictamen_id: id,
      event_type: 'BACKFILL_LOTE_CHECKOUT',
      status_from: 'ingested',
      status_to: 'processing'
    });
  }

  return ids;
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
                      e.titulo, e.resumen,
                      (SELECT '[' || GROUP_CONCAT('{"origen_id":"' || r.dictamen_origen_id || '","tipo_accion":"' || r.tipo_accion || '"}') || ']'
                       FROM dictamen_relaciones_juridicas r 
                       WHERE r.dictamen_destino_id = d.id) as relaciones_json
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

async function getEnrichment(db: D1Database, dictamenId: string, model: string): Promise<any | null> {
  const row = await db.prepare("SELECT * FROM enriquecimiento WHERE dictamen_id = ? AND modelo_llm = ?").bind(dictamenId, model).first();
  if (!row) return null;
  return {
    extrae_jurisprudencia: {
      titulo: row.titulo,
      resumen: row.resumen,
      analisis: row.analisis,
      etiquetas: JSON.parse(String(row.etiquetas_json || '[]'))
    },
    genera_jurisprudencia: row.genera_jurisprudencia === 1,
    booleanos: JSON.parse(String(row.booleanos_json || '{}')),
    fuentes_legales: JSON.parse(String(row.fuentes_legales_json || '[]'))
  };
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

import { findSemanticMatch, normalizeDisplay } from '../lib/stringMatch';

async function insertDictamenEtiquetaLLM(db: D1Database, dictamenId: string, etiqueta: string): Promise<void> {
  const displayTerm = normalizeDisplay(etiqueta);
  const existingMatch = await findSemanticMatch(db, 'dictamen_etiquetas_llm', 'etiqueta', displayTerm);
  const insertTerm = existingMatch ?? displayTerm;

  await db.prepare(
    `INSERT INTO dictamen_etiquetas_llm (dictamen_id, etiqueta) VALUES (?, ?)`
  ).bind(dictamenId, insertTerm).run();
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
      reactivado, reconsiderado, reconsiderado_parcialmente, caracter)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    dictamenId,
    booleanos.nuevo ? 1 : 0, booleanos.relevante ? 1 : 0, booleanos.boletin ? 1 : 0,
    booleanos.recurso_proteccion ? 1 : 0, booleanos.aclarado ? 1 : 0, booleanos.alterado ? 1 : 0,
    booleanos.aplicado ? 1 : 0, booleanos.complementado ? 1 : 0, booleanos.confirmado ? 1 : 0,
    booleanos.reactivado ? 1 : 0, booleanos.reconsiderado ? 1 : 0,
    booleanos.reconsiderado_parcialmente ? 1 : 0,
    booleanos.caracter ?? null
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

async function getDictamenRelacionesJuridicas(db: D1Database, dictamenId: string): Promise<any[]> {
  const res = await db.prepare(`
    SELECT r.dictamen_origen_id as origen_id, r.tipo_accion, r.created_at
    FROM dictamen_relaciones_juridicas r
    WHERE r.dictamen_destino_id = ?
    ORDER BY r.created_at DESC
  `).bind(dictamenId).all<any>();
  return res.results || [];
}

async function getMigrationStats(db: D1Database): Promise<Record<string, number>> {
  const stats = await db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN d.estado LIKE 'error%' THEN 1 ELSE 0 END) as errors,
      SUM(CASE WHEN d.estado IN ('ingested', 'processing') THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN d.estado NOT LIKE 'error%' AND d.estado NOT IN ('ingested', 'processing') AND e.modelo_llm = 'mistral-large-2512' THEN 1 ELSE 0 END) as migrated,
      SUM(CASE WHEN d.estado NOT LIKE 'error%' AND d.estado NOT IN ('ingested', 'processing') AND e.modelo_llm IN ('mistral-large-2411', 'mistralLarge2411') THEN 1 ELSE 0 END) as legacy
    FROM dictamenes d
    LEFT JOIN enriquecimiento e ON d.id = e.dictamen_id
  `).first<Record<string, number>>();
  return stats ?? { total: 0, migrated: 0, legacy: 0, errors: 0, pending: 0 };
}

async function getMigrationEvolution(db: D1Database): Promise<Array<{ date: string; count: number; model: string }>> {
  const res = await db.prepare(`
    SELECT 
      strftime('%Y-%m-%d', fecha_enriquecimiento) as date,
      CASE 
        WHEN modelo_llm IN ('mistral-large-2411', 'mistralLarge2411') THEN 'mistral-large-2411'
        ELSE modelo_llm 
      END as model,
      COUNT(*) as count
    FROM enriquecimiento
    WHERE fecha_enriquecimiento >= datetime('now', '-30 days')
    GROUP BY date, model
    ORDER BY date ASC
  `).all<{ date: string; count: number; model: string }>();
  return res.results ?? [];
}

async function getRecentMigrationEvents(db: D1Database): Promise<Array<any>> {
  // Combinar eventos de skill_events y cambios relevantes en historial_cambios
  const skills = await db.prepare(`
    SELECT 
      ts as timestamp,
      'skill_event' as type,
      service,
      workflow,
      code,
      message,
      matched
    FROM skill_events
    WHERE ts >= datetime('now', '-7 days')
    ORDER BY ts DESC
    LIMIT 20
  `).all<any>();

  const changes = await db.prepare(`
    SELECT 
      fecha_cambio as timestamp,
      'data_change' as type,
      dictamen_id as code,
      campo_modificado as message,
      valor_nuevo as extra
    FROM historial_cambios
    WHERE fecha_cambio >= datetime('now', '-7 days')
      AND origen LIKE '%backfill%'
    ORDER BY fecha_cambio DESC
    LIMIT 20
  `).all<any>();

  return [...(skills.results ?? []), ...(changes.results ?? [])].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  ).slice(0, 30);
}

// ─── Relaciones Jurídicas ─────────────────────────────────────────────

async function findDictamenIdByNumeroAnio(db: D1Database, numero: string, anio: number | string): Promise<string | null> {
  // Búsqueda robusta: el número puede venir con ceros o puntos, usamos LIKE para flexibilidad
  const numClean = numero.replace(/\\./g, '').replace(/^0+/, '');
  const row = await db.prepare(
    "SELECT id FROM dictamenes WHERE anio = ? AND (numero = ? OR numero LIKE ? OR numero LIKE ?) LIMIT 1"
  ).bind(
    Number(anio),
    numero,
    `%${numClean}%`,
    `%${numero}%`
  ).first<{ id: string }>();
  return row?.id ?? null;
}

async function insertDictamenRelacionJuridica(
  db: D1Database,
  params: {
    origen_id: string;
    destino_id: string;
    tipo_accion: string;
    origen_extracccion?: string;
  }
): Promise<void> {
  await db.prepare(
    `INSERT OR IGNORE INTO dictamen_relaciones_juridicas 
     (dictamen_origen_id, dictamen_destino_id, tipo_accion, origen_extracccion)
     VALUES (?, ?, ?, ?)`
  ).bind(
    params.origen_id,
    params.destino_id,
    params.tipo_accion,
    params.origen_extracccion ?? 'ai_mistral'
  ).run();
}

async function insertDictamenRelacionHuerfana(
  db: D1Database,
  dictamenId: string,
  flag: string
): Promise<void> {
  await db.prepare(
    `INSERT OR IGNORE INTO dictamen_relaciones_huerfanas (dictamen_id, flag_huerfano)
     VALUES (?, ?)`
  ).bind(dictamenId, flag).run();
}

async function updateEnrichmentBooleanos(
  db: D1Database,
  dictamenId: string,
  flag: string,
  value: boolean
): Promise<void> {
  await db.prepare(
    `UPDATE enriquecimiento 
     SET booleanos_json = json_set(COALESCE(booleanos_json, '{}'), '$.' || ?, json(?))
     WHERE dictamen_id = ?`
  ).bind(flag, value ? 'true' : 'false', dictamenId).run();
}

// ─── Exports ─────────────────────────────────────────────────────────

export {
  nowIso,
  upsertDictamen,
  updateDictamenStatus,
  getKvKey,
  getLatestRawRef, // compatibilidad — computa clave KV sin DB
  insertEnrichment,
  getEnrichment,
  getLatestEnrichment,
  getStats,
  getDashboardStats,
  getMigrationStats,
  getMigrationEvolution,
  getRecentMigrationEvents,
  listDictamenes,
  getDictamenById,
  listDictamenByStatus,
  listDictamenIdsByStatus,
  listDictamenIdsParaProcesar,
  checkoutDictamenesParaProcesar,
  logDictamenEvent,
  listDictamenIdsWithEmptyEnrichment,
  listDictamenIdsWithEmptyFuentes,
  updateEnrichmentFuentes,
  getExistingDictamenIds,
  insertDictamenBooleanosLLM,
  insertDictamenReferencia,
  insertDictamenEtiquetaLLM,
  insertDictamenFuenteLegal,
  getOrInsertDivisionId,
  findDictamenIdByNumeroAnio,
  insertDictamenRelacionJuridica,
  insertDictamenRelacionHuerfana,
  updateEnrichmentBooleanos,
  getDictamenRelacionesJuridicas
};
