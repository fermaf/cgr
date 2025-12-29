// Gobernador de cuota diaria para llamadas externas.
import { getJson, putJson } from '../storage/kv';

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
function parseDailyQuota(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1e3;
}
function parseReserveRatio(value?: string): number {
  const parsed = value ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return 0.8;
  return Math.min(Math.max(parsed, 0.1), 0.95);
}
async function canConsume(kv: KVNamespace, dailyQuota: string, units: number, reserveRatio?: string) {
  const limit = Math.floor(parseDailyQuota(dailyQuota) * parseReserveRatio(reserveRatio));
  const key = `quota:${todayKey()}`;
  const state = await getJson<{ used: number; updated_at: string }>(kv, key) ?? { used: 0, updated_at: new Date().toISOString() };
  return state.used + units <= limit;
}
async function consume(kv: KVNamespace, dailyQuota: string, units: number, reserveRatio?: string) {
  const limit = Math.floor(parseDailyQuota(dailyQuota) * parseReserveRatio(reserveRatio));
  const key = `quota:${todayKey()}`;
  const state = await getJson<{ used: number; updated_at: string }>(kv, key) ?? { used: 0, updated_at: new Date().toISOString() };
  if (state.used + units > limit) return false;
  const next = { used: state.used + units, updated_at: new Date().toISOString() };
  await putJson(kv, key, next, 60 * 60 * 26);
  return true;
}

export { canConsume, consume };
