// Ingesta y utilidades canónicas de dictámenes.
import type { DictamenRaw, DictamenSource, DictamenStatus } from '../types/dictamen';
import { insertRawRef, upsertDictamen, updateDictamenStatus } from '../storage/d1';
import { putRaw } from '../storage/rawKv';

async function hashString(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}
function getSource(raw: DictamenRaw): DictamenSource {
  const rawAny = raw as DictamenRaw & { raw_data?: DictamenSource };
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
function extractDictamenId(raw: DictamenRaw): string | null {
  const source = getSource(raw);
  const fromSource = typeof source.doc_id === "string" ? source.doc_id : null;
  const fromRaw = typeof raw._id === "string" ? raw._id : null;
  const fromId = typeof raw.id === "string" ? raw.id : null;
  return fromSource ?? fromRaw ?? fromId ?? null;
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
  const criterio = source.criterio?.toLowerCase() ?? "";
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
  }
): Promise<{ dictamenId: string; rawKey: string }> {
  const payload = JSON.stringify(raw);
  const hash = await hashString(payload);
  const rawKey = buildRawKey(hash);
  const canonical = await buildCanonicalSignature(raw);
  const generaJurisprudencia = extractGeneraJurisprudencia(raw);
  const source = getSource(raw);
  const documentoCompleto = typeof source.documento_completo === "string" ? source.documento_completo.trim() : "";
  const documentoCompletoMissing = documentoCompleto.length === 0 ? 1 : 0;
  const dictamenId = extractDictamenId(raw) ?? hash;
  const status = options?.status ?? "ingested";
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
    origen: normalizeText(source.origen_),
    origenes: normalizeText(source.origenes),
    descriptores: normalizeText(source.descriptores),
    abogados: normalizeText(source.abogados),
    destinatarios: normalizeText(source.destinatarios)
  });
  const putResult = await putRaw(env.RAW_KV, rawKey, payload);
  await insertRawRef(env.DB, {
    dictamen_id: dictamenId,
    raw_key: putResult.key,
    sha256: hash,
    bytes: putResult.bytes,
    created_at: new Date().toISOString()
  });
  await updateDictamenStatus(env.DB, dictamenId, status);
  return { dictamenId, rawKey };
}
async function storeRawOnly(env: Env, dictamenId: string, raw: DictamenRaw): Promise<void> {
  const payload = JSON.stringify(raw);
  const hash = await hashString(payload);
  const rawKey = buildRawKey(hash);
  const putResult = await putRaw(env.RAW_KV, rawKey, payload);
  await insertRawRef(env.DB, {
    dictamen_id: dictamenId,
    raw_key: putResult.key,
    sha256: hash,
    bytes: putResult.bytes,
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
