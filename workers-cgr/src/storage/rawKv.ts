// Acceso a RAW en KV.
async function putRaw(kv: KVNamespace, key: string, body: string) {
  const bytes = new TextEncoder().encode(body).byteLength;
  await kv.put(key, body);
  return { key, bytes };
}
async function getRaw(kv: KVNamespace, key: string) {
  return kv.get(key);
}

export { putRaw, getRaw };
