// src/quota/governor.ts
function todayKey(date = /* @__PURE__ */ new Date()) {
  return date.toISOString().slice(0, 10);
}
__name(todayKey, "todayKey");
function parseDailyQuota(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1e3;
}
__name(parseDailyQuota, "parseDailyQuota");
async function canConsume(kv, dailyQuota, units) {
  const limit = Math.floor(parseDailyQuota(dailyQuota) * 0.8);
  const key = `quota:${todayKey()}`;
  const state = await getJson(kv, key) ?? { used: 0, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  return state.used + units <= limit;
}
__name(canConsume, "canConsume");
async function consume(kv, dailyQuota, units) {
  const limit = Math.floor(parseDailyQuota(dailyQuota) * 0.8);
  const key = `quota:${todayKey()}`;
  const state = await getJson(kv, key) ?? { used: 0, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  if (state.used + units > limit) return false;
  const next = { used: state.used + units, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  await putJson(kv, key, next, 60 * 60 * 26);
  return true;
}
__name(consume, "consume");
