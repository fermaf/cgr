// src/storage/kv.ts
async function getJson(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return null;
  return JSON.parse(raw);
}
__name(getJson, "getJson");
var KV_RETRY_MAX = 4;
var KV_RETRY_BASE_MS = 200;
async function sleep2(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
__name(sleep2, "sleep");
async function putWithRetry(kv, key, value, options) {
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
__name(putWithRetry, "putWithRetry");
async function putJson(kv, key, value, ttlSeconds) {
  const payload = JSON.stringify(value);
  await putWithRetry(kv, key, payload, ttlSeconds ? { expirationTtl: ttlSeconds } : void 0);
}
__name(putJson, "putJson");
async function getCursor(kv, name) {
  return kv.get(`cursor:${name}`);
}
__name(getCursor, "getCursor");
async function setCursor(kv, name, value) {
  await putWithRetry(kv, `cursor:${name}`, value);
}
__name(setCursor, "setCursor");
