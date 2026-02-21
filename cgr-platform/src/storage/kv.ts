// Helpers para KV (estado y cursores).
async function getJson<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const raw = await kv.get(key);
  if (!raw) return null;
  return JSON.parse(raw);
}
const KV_RETRY_MAX = 4;
const KV_RETRY_BASE_MS = 200;
async function sleep2(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
async function putWithRetry(
  kv: KVNamespace,
  key: string,
  value: string,
  options?: KVNamespacePutOptions
) {
  let attempt = 0;
  for (; ; ) {
    try {
      await kv.put(key, value, options);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = message.includes("429");
      if (!retryable || attempt >= KV_RETRY_MAX) {
        throw error;
      }
      const delay = KV_RETRY_BASE_MS * 2 ** attempt;
      attempt += 1;
      await sleep2(delay);
    }
  }
}
async function putJson<T>(kv: KVNamespace, key: string, value: T, ttlSeconds?: number) {
  const payload = JSON.stringify(value);
  await putWithRetry(kv, key, payload, ttlSeconds ? { expirationTtl: ttlSeconds } : void 0);
}
async function getCursor(kv: KVNamespace, name: string) {
  return kv.get(`cursor:${name}`);
}
async function setCursor(kv: KVNamespace, name: string, value: string) {
  await putWithRetry(kv, `cursor:${name}`, value);
}

export { getJson, putJson, getCursor, setCursor };
