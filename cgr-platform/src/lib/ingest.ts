// Ingesta de dictámenes desde CGR.cl → KV + D1.
// Adaptado a cgr-dictamenes (c391c767): tabla dictamenes (plural),
// clave KV = dictamen:{ID}, sin sha256/raw_ref.
import type { Env, DictamenRaw, DictamenSource, DictamenStatus } from '../types';
import { upsertDictamen, updateDictamenStatus, getKvKey, insertDictamenBooleanosLLM } from '../storage/d1';


function getSource(raw: DictamenRaw): DictamenSource {
  const rawAny = raw as any;
  return raw._source ?? raw.source ?? rawAny.raw_data ?? raw;
}

function normalizeText(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const joined = value.map((item) => String(item).trim()).filter(Boolean).join(", ");
    return joined || null;
  }
  return String(value).trim() || null;
}

function normalizeFlag(value: unknown) {
  if (value === true) return 1;
  if (value === false) return 0;
  if (typeof value === "number") return value ? 1 : 0;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "si" || trimmed === "true" || trimmed === "1") return 1;
    if (trimmed === "no" || trimmed === "false" || trimmed === "0") return 0;
  }
  return null;
}

function extractDictamenId(raw: DictamenRaw): string {
  const source = getSource(raw);
  if (source.numeric_doc_id && source.year_doc_id) {
    const year = String(source.year_doc_id).slice(-2);
    return `${source.numeric_doc_id}N${year}`;
  }
  const fromSource = typeof source.doc_id === "string" ? source.doc_id : null;
  const fromRaw = typeof raw._id === "string" ? raw._id : null;
  const fromId = typeof raw.id === "string" ? raw.id : null;
  return fromSource ?? fromRaw ?? fromId ?? "unknown";
}

function extractGeneraJurisprudencia(raw: DictamenRaw): number | null {
  const source = getSource(raw);
  const value = source.genera_jurisprudencia;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value ? 1 : 0;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "si" || trimmed === "true" || trimmed === "1") return 1;
    if (trimmed === "no" || trimmed === "false" || trimmed === "0") return 0;
  }
  const criterio = typeof source.criterio === "string" ? source.criterio.toLowerCase() : "";
  if (criterio.includes("genera jurisprudencia")) return 1;
  if (criterio.includes("aplica jurisprudencia")) return 0;
  return null;
}

// Extraer año desde fecha_documento del source.
function extractAnio(source: DictamenSource): number | null {
  const fecha = normalizeText(source.fecha_documento);
  if (!fecha) return null;
  const match = fecha.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

// Extraer diccionarios (abogados, descriptores) como listas limpias
function extractCommaSeparatedList(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    return value.split(/[,;\n]/).map(s => s.trim()).filter(s => s.length > 2);
  }
  if (Array.isArray(value)) {
    return value.map(s => String(s).trim()).filter(s => s.length > 2);
  }
  return [];
}

function isMissingColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("has no column named") || message.includes("no such column");
}

async function upsertCatalogAndLink(
  db: D1Database,
  dictamenId: string,
  term: string,
  options: {
    catalogTable: string;
    relationTable: string;
    relationForeignIdColumn: string;
    normalizerSqlFn: 'LOWER' | 'UPPER';
    candidateTermColumns: string[];
  }
): Promise<void> {
  for (const termColumn of options.candidateTermColumns) {
    try {
      await db.prepare(
        `INSERT OR IGNORE INTO ${options.catalogTable} (${termColumn}) VALUES (${options.normalizerSqlFn}(?))`
      ).bind(term).run();

      await db.prepare(
        `INSERT OR IGNORE INTO ${options.relationTable} (dictamen_id, ${options.relationForeignIdColumn})
         SELECT ?, id FROM ${options.catalogTable} WHERE ${termColumn} = ${options.normalizerSqlFn}(?)`
      ).bind(dictamenId, term).run();
      return;
    } catch (error) {
      if (!isMissingColumnError(error)) {
        throw error;
      }
      console.warn(`[Ingest] Columna ${termColumn} no existe en ${options.catalogTable}. Probando fallback...`);
    }
  }

  throw new Error(
    `No compatible column found for ${options.catalogTable}. Tried: ${options.candidateTermColumns.join(", ")}`
  );
}

// Ingesta principal: guarda JSON crudo en KV y metadata en D1.
async function ingestDictamen(
  env: Env,
  raw: DictamenRaw,
  options?: {
    status?: DictamenStatus;
    origenImportacion?: string | null;
  }
): Promise<{ dictamenId: string; kvKey: string }> {
  const source = getSource(raw);
  const dictamenId = extractDictamenId(raw);
  const generaJurisprudencia = extractGeneraJurisprudencia(raw);
  const status = options?.status ?? "ingested";
  const origenImport = options?.origenImportacion ?? 'crawl_contraloria';

  // 1. Upsert en D1 (tabla dictamenes)
  await upsertDictamen(env.DB, {
    id: dictamenId,
    generaJurisprudencia,
    status,
    numero: normalizeText(source.n_dictamen),
    anio: extractAnio(source),
    fechaDocumento: normalizeText(source.fecha_documento),
    fechaIndexacion: normalizeText(source.fecha_indexacion),
    materia: normalizeText(source.materia),
    criterio: normalizeText(source.criterio),
    destinatarios: normalizeText(source.destinatarios),
    origenImportacion: origenImport,
  });

  // 1.5. Mapear booleanos desde raw_data
  const rawBooleanos = {
    nuevo: normalizeFlag(source.nuevo) === 1,
    aclarado: normalizeFlag(source.aclarado) === 1,
    relevante: normalizeFlag(source.relevante) === 1,
    confirmado: normalizeFlag(source.confirmado) === 1,
    boletin: normalizeFlag(source.boletin) === 1,
    alterado: normalizeFlag(source.alterado) === 1,
    complementado: normalizeFlag(source.complementado) === 1,
    reconsiderado_parcialmente: normalizeFlag(source.reconsiderado_parcialmente) === 1,
    reconsiderado: normalizeFlag(source.reconsiderado) === 1,
    aplicado: normalizeFlag(source.aplicado) === 1,
    reactivado: normalizeFlag(source.reactivado) === 1,
    recurso_proteccion: normalizeFlag(source.recurso_proteccion) === 1
  };
  await insertDictamenBooleanosLLM(env.DB, dictamenId, rawBooleanos);

  // 1.6. Extraer y poblar listas de validación/entidades
  const descriptores = extractCommaSeparatedList(source.descriptores);
  for (const desc of descriptores) {
    await upsertCatalogAndLink(env.DB, dictamenId, desc, {
      catalogTable: 'cat_descriptores',
      relationTable: 'dictamen_descriptores',
      relationForeignIdColumn: 'descriptor_id',
      normalizerSqlFn: 'LOWER',
      candidateTermColumns: ['termino', 'nombre']
    });
  }

  const abogados = extractCommaSeparatedList(source.abogados);
  for (const abog of abogados) {
    await upsertCatalogAndLink(env.DB, dictamenId, abog, {
      catalogTable: 'cat_abogados',
      relationTable: 'dictamen_abogados',
      relationForeignIdColumn: 'abogado_id',
      normalizerSqlFn: 'UPPER',
      candidateTermColumns: ['nombre', 'termino', 'iniciales']
    });
  }

  // 2. Guardar JSON crudo en KV con clave = dictamen:{ID}
  const kvKey = getKvKey(dictamenId);
  const payload = JSON.stringify(raw);
  const now = new Date().toISOString();

  try {
    await env.DICTAMENES_SOURCE.put(kvKey, payload);
    await env.DB.prepare(
      `INSERT INTO kv_sync_status (dictamen_id, en_source, source_written_at)
       VALUES (?, 1, ?)
       ON CONFLICT(dictamen_id) DO UPDATE SET en_source = 1, source_written_at = excluded.source_written_at, updated_at = excluded.source_written_at`
    ).bind(dictamenId, now).run();
  } catch (error: any) {
    await env.DB.prepare(
      `INSERT INTO kv_sync_status (dictamen_id, en_source, source_error)
       VALUES (?, 0, ?)
       ON CONFLICT(dictamen_id) DO UPDATE SET source_error = excluded.source_error, updated_at = ?`
    ).bind(dictamenId, error.message, now).run();
    throw error;
  }

  return { dictamenId, kvKey };
}


export {
  extractDictamenId,
  extractGeneraJurisprudencia,
  ingestDictamen,
  getSource,
  normalizeText,
  normalizeFlag,
};
