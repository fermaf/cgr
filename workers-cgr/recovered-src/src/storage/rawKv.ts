// src/storage/rawKv.ts
async function putRaw(kv, key, body) {
  const bytes = new TextEncoder().encode(body).byteLength;
  await kv.put(key, body);
  return { key, bytes };
}
__name(putRaw, "putRaw");
async function getRaw(kv, key) {
  return kv.get(key);
}
__name(getRaw, "getRaw");
