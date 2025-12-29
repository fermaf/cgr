// src/ingest/ingest.ts
async function hashString(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}
__name(hashString, "hashString");
function getSource(raw) {
  const rawAny = raw;
  return raw._source ?? raw.source ?? rawAny.raw_data ?? raw;
}
__name(getSource, "getSource");
function normalizeText(value) {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const joined = value.map((item) => String(item).trim()).filter(Boolean).join(", ");
    return joined || null;
  }
  return String(value).trim() || null;
}
__name(normalizeText, "normalizeText");
function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}
__name(normalizeWhitespace, "normalizeWhitespace");
function normalizeCanonicalText(value) {
  if (typeof value === "string") return normalizeWhitespace(value);
  if (Array.isArray(value)) {
    const joined = value.map((item) => String(item)).join(" ");
    const normalized = normalizeWhitespace(joined);
    return normalized.length ? normalized : null;
  }
  return null;
}
__name(normalizeCanonicalText, "normalizeCanonicalText");
function normalizeFlag(value) {
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
__name(normalizeFlag, "normalizeFlag");
function buildCanonicalObject(source) {
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
__name(buildCanonicalObject, "buildCanonicalObject");
async function buildCanonicalSignature(raw) {
  const source = getSource(raw);
  const canonical = buildCanonicalObject(source);
  const payload = JSON.stringify(canonical);
  const bytes = new TextEncoder().encode(payload).length;
  const sha256 = await hashString(payload);
  return { sha256, bytes };
}
__name(buildCanonicalSignature, "buildCanonicalSignature");
function buildCanonicalPayload(raw) {
  const source = getSource(raw);
  return buildCanonicalObject(source);
}
__name(buildCanonicalPayload, "buildCanonicalPayload");
function extractDictamenId(raw) {
  const source = getSource(raw);
  const fromSource = typeof source.doc_id === "string" ? source.doc_id : null;
  const fromRaw = typeof raw._id === "string" ? raw._id : null;
  const fromId = typeof raw.id === "string" ? raw.id : null;
  return fromSource ?? fromRaw ?? fromId ?? null;
}
__name(extractDictamenId, "extractDictamenId");
function extractGeneraJurisprudencia(raw) {
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
__name(extractGeneraJurisprudencia, "extractGeneraJurisprudencia");
function buildRawKey(hash, createdAt = /* @__PURE__ */ new Date()) {
  const date = createdAt.toISOString().slice(0, 10);
  return `raw/${date}/${hash}.json`;
}
__name(buildRawKey, "buildRawKey");
async function ingestDictamen(env, raw, options) {
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
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  await updateDictamenStatus(env.DB, dictamenId, status);
  return { dictamenId, rawKey };
}
__name(ingestDictamen, "ingestDictamen");
async function storeRawOnly(env, dictamenId, raw) {
  const payload = JSON.stringify(raw);
  const hash = await hashString(payload);
  const rawKey = buildRawKey(hash);
  const putResult = await putRaw(env.RAW_KV, rawKey, payload);
  await insertRawRef(env.DB, {
    dictamen_id: dictamenId,
    raw_key: putResult.key,
    sha256: hash,
    bytes: putResult.bytes,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  });
}
__name(storeRawOnly, "storeRawOnly");
