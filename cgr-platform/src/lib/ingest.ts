// Ingesta y utilidades canónicas de dictámenes.
import type { Env, DictamenRaw, DictamenSource, DictamenStatus } from '../types';
import { insertRawRef, upsertDictamen, updateDictamenStatus, getOrCreateCategory, insertDictamenReferencia } from '../storage/d1';


async function hashString(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}
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
function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
function normalizeCanonicalText(value: unknown) {
  if (typeof value === "string") return normalizeWhitespace(value);
  if (Array.isArray(value)) {
    const joined = value.map((item) => String(item)).join(" ");
    const normalized = normalizeWhitespace(joined);
    return normalized.length ? normalized : null;
  }
  return null;
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
function buildCanonicalObject(source: DictamenSource): Record<string, unknown> {
  return {
    documento_completo: normalizeCanonicalText(source.documento_completo),
    fecha_documento: normalizeCanonicalText(source.fecha_documento),
    fecha_indexacion: normalizeCanonicalText(source.fecha_indexacion),
    nuevo: normalizeFlag(source.nuevo),
    aclarado: normalizeFlag(source.aclarado),
    alterado: normalizeFlag(source.alterado),
    aplicado: normalizeFlag(source.aplicado),
    complementado: normalizeFlag(source.complementado),
    confirmado: normalizeFlag(source.confirmado),
    reconsiderado: normalizeFlag(source.reconsiderado),
    reconsiderado_parcialmente: normalizeFlag(source.reconsiderado_parcialmente),
    reactivado: normalizeFlag(source.reactivado),
    relevante: normalizeFlag(source.relevante),
    boletin: normalizeFlag(source.boletin),
    recurso_proteccion: normalizeFlag(source.recurso_proteccion)
  };
}
async function buildCanonicalSignature(raw: DictamenRaw): Promise<{ sha256: string; bytes: number }> {
  const source = getSource(raw);
  const canonical = buildCanonicalObject(source);
  const payload = JSON.stringify(canonical);
  const bytes = new TextEncoder().encode(payload).length;
  const sha256 = await hashString(payload);
  return { sha256, bytes };
}
function buildCanonicalPayload(raw: DictamenRaw): Record<string, unknown> {
  const source = getSource(raw);
  return buildCanonicalObject(source);
}
function extractDictamenId(raw: DictamenRaw): string {
  const source = getSource(raw);
  // Jerarquía: 
  // 1. numeric_doc_id + N + year_doc_id (Ej: 12345N23)
  // 2. doc_id (de Elastic)
  // 3. _id (de Elastic)

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
function buildRawKey(hash: string, createdAt = new Date()) {
  const date = createdAt.toISOString().slice(0, 10);
  return `raw/${date}/${hash}.json`;
}
async function ingestDictamen(
  env: Env,
  raw: DictamenRaw,
  options?: {
    status?: DictamenStatus;
    migratedFromMongo?: number | null;
    crawledFromCgr?: number | null;
    origenImportacion?: string | null;
  }
): Promise<{ dictamenId: string; rawKey: string }> {
  const source = getSource(raw);
  const dictamenId = extractDictamenId(raw);

  const payload = JSON.stringify(raw);
  const hash = await hashString(payload);
  const rawKey = buildRawKey(hash);

  const canonical = await buildCanonicalSignature(raw);
  const generaJurisprudencia = extractGeneraJurisprudencia(raw);

  const documentoCompleto = typeof source.documento_completo === "string" ? source.documento_completo.trim() : "";
  const documentoCompletoMissing = documentoCompleto.length === 0 ? 1 : 0;

  const status = options?.status ?? "ingested";
  const origenImport = options?.origenImportacion ?? 'crawl_contraloria';

  // 1. Upsert Dictamen Principal
  await upsertDictamen(env.DB, {
    id: dictamenId,
    generaJurisprudencia,
    documentoCompletoMissing,
    status,
    migratedFromMongo: options?.migratedFromMongo ?? null,
    crawledFromCgr: options?.crawledFromCgr ?? null,
    canonicalSha256: canonical.sha256,
    canonicalBytes: canonical.bytes,
    nDictamen: normalizeText(source.n_dictamen),
    numericDocId: normalizeText(source.numeric_doc_id),
    yearDocId: normalizeText(source.year_doc_id),
    fechaDocumento: normalizeText(source.fecha_documento),
    fechaIndexacion: normalizeText(source.fecha_indexacion),
    materia: normalizeText(source.materia),
    criterio: normalizeText(source.criterio),
    origen: normalizeText(source.origen),
    origenes: normalizeText(source.origenes),
    descriptores: normalizeText(source.descriptores),
    abogados: normalizeText(source.abogados),
    destinatarios: normalizeText(source.destinatarios),
    origenImportacion: origenImport,
    esVectorizado: 0
  });

  // 2. Gestión de Categorías
  if (source.origen) {
    await getOrCreateCategory(env.DB, 'cat_divisiones', String(source.origen));
  }

  if (source.abogados) {
    const list = String(source.abogados).split(',').map(s => s.trim()).filter(Boolean);
    for (const name of list) {
      const catId = await getOrCreateCategory(env.DB, 'cat_abogados', name);
      const linkId = await hashString(`${dictamenId}-${catId}`);
      await env.DB.prepare("INSERT OR IGNORE INTO dictamen_abogados (id, dictamen_id, abogado_id, created_at) VALUES (?, ?, ?, ?)").bind(linkId, dictamenId, catId, new Date().toISOString()).run();
    }
  }

  if (source.descriptores) {
    const list = String(source.descriptores).split(',').map(s => s.trim()).filter(Boolean);
    for (const name of list) {
      const catId = await getOrCreateCategory(env.DB, 'cat_descriptores', name);
      const linkId = await hashString(`${dictamenId}-${catId}`);
      await env.DB.prepare("INSERT OR IGNORE INTO dictamen_descriptores (id, dictamen_id, descriptor_id, created_at) VALUES (?, ?, ?, ?)").bind(linkId, dictamenId, catId, new Date().toISOString()).run();
    }
  }

  // 3. Referencias (desde acción)
  if (source.accion) {
    try {
      const acciones = typeof source.accion === 'string' ? JSON.parse(source.accion) : source.accion;
      if (Array.isArray(acciones)) {
        for (const acc of acciones) {
          if (acc.id) {
            await insertDictamenReferencia(env.DB, dictamenId, acc.id, acc.tipo || 'Referencia');
          }
        }
      }
    } catch (e) {
      console.error(`Error parsing action for ${dictamenId}`, e);
    }
  }

  // 4. Guardar en KV (DICTAMENES_SOURCE)
  await env.DICTAMENES_SOURCE.put(rawKey, payload);

  await insertRawRef(env.DB, {
    dictamen_id: dictamenId,
    raw_key: rawKey,
    sha256: hash,
    bytes: payload.length,
    created_at: new Date().toISOString()
  });

  return { dictamenId, rawKey };
}

async function storeRawOnly(env: Env, dictamenId: string, raw: DictamenRaw): Promise<void> {
  const payload = JSON.stringify(raw);
  const hash = await hashString(payload);
  const rawKey = buildRawKey(hash);
  await env.DICTAMENES_SOURCE.put(rawKey, payload);
  await insertRawRef(env.DB, {
    dictamen_id: dictamenId,
    raw_key: rawKey,
    sha256: hash,
    bytes: payload.length,
    created_at: new Date().toISOString()
  });
}


export {
  hashString,
  buildCanonicalSignature,
  buildCanonicalPayload,
  buildRawKey,
  extractDictamenId,
  extractGeneraJurisprudencia,
  ingestDictamen,
  storeRawOnly
};
