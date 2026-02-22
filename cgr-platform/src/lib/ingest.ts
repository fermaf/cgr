// Ingesta de dictámenes desde CGR.cl → KV + D1.
// Adaptado a cgr-dictamenes (c391c767): tabla dictamenes (plural),
// clave KV = dictamen:{ID}, sin sha256/raw_ref.
import type { Env, DictamenRaw, DictamenSource, DictamenStatus } from '../types';
import { upsertDictamen, updateDictamenStatus, getKvKey } from '../storage/d1';


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

// Ingesta principal: guarda JSON crudo en KV y metadata en D1.
async function ingestDictamen(
  env: Env,
  raw: DictamenRaw,
  options?: {
    status?: DictamenStatus;
    crawledFromCgr?: number | null;
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
    crawledFromCgr: options?.crawledFromCgr ?? null,
    numero: normalizeText(source.n_dictamen),
    anio: extractAnio(source),
    fechaDocumento: normalizeText(source.fecha_documento),
    fechaIndexacion: normalizeText(source.fecha_indexacion),
    materia: normalizeText(source.materia),
    criterio: normalizeText(source.criterio),
    destinatarios: normalizeText(source.destinatarios),
    origenImportacion: origenImport,
  });

  // 2. Guardar JSON crudo en KV con clave = dictamen:{ID}
  const kvKey = getKvKey(dictamenId);
  const payload = JSON.stringify(raw);
  await env.DICTAMENES_SOURCE.put(kvKey, payload);

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
