import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../types';

type ProviderName = 'gemini' | 'mistral';

type KeyStateRow = {
  provider: string;
  model: string;
  key_id: string;
  status: string;
  exhausted_until: string | null;
  last_used_at: string | null;
};

export type ProviderKeySelection =
  | {
      ok: true;
      apiKey: string;
      keyId: string;
      provider: ProviderName;
      model: string;
    }
  | {
      ok: false;
      provider: ProviderName;
      model: string;
      reason: 'NO_KEYS' | 'WAIT';
      retryAfterSeconds?: number;
    };

function nowIso() {
  return new Date().toISOString();
}

function parseKeyList(raw?: string | null, fallback?: string | null): string[] {
  const source = raw?.trim() || fallback?.trim() || '';
  if (!source) return [];

  if (source.startsWith('[')) {
    try {
      const parsed = JSON.parse(source);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // Fallback a split simple.
    }
  }

  return source
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildKeyId(provider: ProviderName, apiKey: string) {
  const tail = apiKey.slice(-8);
  return `${provider}:${tail}`;
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function secondsUntilNextMinute() {
  const now = new Date();
  return Math.max(1, 60 - now.getSeconds());
}

function getLocalDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [year, month, day] = formatter.format(date).split('-').map(Number);
  return { year, month, day };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset'
  }).formatToParts(date);
  const zone = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+0';
  const match = zone.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

function zonedDateTimeToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string
) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  const offsetMinutes = getTimeZoneOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offsetMinutes * 60_000).toISOString();
}

function nextSantiagoMidnightIso(resetHour = 0) {
  const now = new Date();
  const today = getLocalDateParts(now, 'America/Santiago');
  const localNoonToday = new Date(Date.UTC(today.year, today.month - 1, today.day, 12, 0, 0));
  const tomorrow = getLocalDateParts(new Date(localNoonToday.getTime() + 24 * 60 * 60 * 1000), 'America/Santiago');
  return zonedDateTimeToUtcIso(tomorrow.year, tomorrow.month, tomorrow.day, resetHour, 'America/Santiago');
}

function nextMonthlyResetIso(day = 1) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const candidate = new Date(Date.UTC(year, month, day, 0, 0, 0));
  if (candidate.getTime() > now.getTime()) {
    return candidate.toISOString();
  }
  return new Date(Date.UTC(year, month + 1, day, 0, 0, 0)).toISOString();
}

function addHoursIso(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function getKeyState(
  db: D1Database,
  provider: ProviderName,
  model: string,
  keyId: string
): Promise<KeyStateRow | null> {
  return db
    .prepare(
      `SELECT provider, model, key_id, status, exhausted_until, last_used_at
       FROM api_key_state
       WHERE provider = ? AND model = ? AND key_id = ?`
    )
    .bind(provider, model, keyId)
    .first<KeyStateRow>();
}

async function getMinuteUsage(
  db: D1Database,
  provider: ProviderName,
  model: string,
  keyId: string
) {
  const minuteKey = new Date().toISOString().slice(0, 16);
  const row = await db
    .prepare(
      `SELECT request_count
       FROM api_key_usage_window
       WHERE provider = ? AND model = ? AND key_id = ? AND window_type = 'minute' AND window_key = ?`
    )
    .bind(provider, model, keyId, minuteKey)
    .first<{ request_count: number }>();
  return row?.request_count ?? 0;
}

export async function selectProviderApiKey(
  db: D1Database,
  env: Env,
  provider: ProviderName,
  model: string
): Promise<ProviderKeySelection> {
  const keys = provider === 'gemini'
    ? parseKeyList(env.GEMINI_API_KEYS, env.GEMINI_API_KEY)
    : parseKeyList(env.MISTRAL_API_KEYS, env.MISTRAL_API_KEY);
  if (keys.length === 0) {
    return { ok: false, provider, model, reason: 'NO_KEYS' };
  }

  const blockedKeyIds = new Set(
    provider === 'gemini'
      ? parseKeyList(env.GEMINI_BLOCKED_API_KEYS).map((item) => buildKeyId('gemini', item))
      : []
  );

  const now = Date.now();
  const rpmLimit = provider === 'gemini' ? parsePositiveInt(env.GEMINI_RPM_LIMIT_PER_KEY, 2) : Number.POSITIVE_INFINITY;
  const candidates: Array<{ apiKey: string; keyId: string; lastUsedAt: number; waitUntil?: number }> = [];

  for (const apiKey of keys) {
    const keyId = buildKeyId(provider, apiKey);
    if (blockedKeyIds.has(keyId)) continue;

    const state = await getKeyState(db, provider, model, keyId);
    if (state?.status === 'blocked') continue;

    const exhaustedUntil = state?.exhausted_until ? Date.parse(state.exhausted_until) : 0;
    if (exhaustedUntil && exhaustedUntil > now) {
      candidates.push({
        apiKey,
        keyId,
        lastUsedAt: state?.last_used_at ? Date.parse(state.last_used_at) : 0,
        waitUntil: exhaustedUntil
      });
      continue;
    }

    if (provider === 'gemini') {
      const minuteUsage = await getMinuteUsage(db, provider, model, keyId);
      if (minuteUsage >= rpmLimit) {
        candidates.push({
          apiKey,
          keyId,
          lastUsedAt: state?.last_used_at ? Date.parse(state.last_used_at) : 0,
          waitUntil: now + secondsUntilNextMinute() * 1000
        });
        continue;
      }
    }

    candidates.push({
      apiKey,
      keyId,
      lastUsedAt: state?.last_used_at ? Date.parse(state.last_used_at) : 0
    });
  }

  const active = candidates
    .filter((item) => !item.waitUntil || item.waitUntil <= now)
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt);

  if (active.length > 0) {
    const selected = active[0];
    return {
      ok: true,
      apiKey: selected.apiKey,
      keyId: selected.keyId,
      provider,
      model
    };
  }

  const retryAt = candidates
    .filter((item) => item.waitUntil && item.waitUntil > now)
    .map((item) => item.waitUntil as number)
    .sort((a, b) => a - b)[0];

  return {
    ok: false,
    provider,
    model,
    reason: 'WAIT',
    retryAfterSeconds: retryAt ? Math.max(1, Math.ceil((retryAt - now) / 1000)) : undefined
  };
}

async function upsertState(
  db: D1Database,
  params: {
    provider: ProviderName;
    model: string;
    keyId: string;
    status: 'active' | 'blocked' | 'exhausted';
    exhaustedUntil?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    incrementSuccess?: boolean;
    incrementError?: boolean;
  }
) {
  const ts = nowIso();
  await db.prepare(
    `INSERT INTO api_key_state
      (provider, model, key_id, status, exhausted_until, last_used_at, last_error_at, last_error_code, last_error_message, success_count, error_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, model, key_id) DO UPDATE SET
      status = excluded.status,
      exhausted_until = excluded.exhausted_until,
      last_used_at = excluded.last_used_at,
      last_error_at = excluded.last_error_at,
      last_error_code = excluded.last_error_code,
      last_error_message = excluded.last_error_message,
      success_count = api_key_state.success_count + ?,
      error_count = api_key_state.error_count + ?,
      updated_at = excluded.updated_at`
  ).bind(
    params.provider,
    params.model,
    params.keyId,
    params.status,
    params.exhaustedUntil ?? null,
    ts,
    params.incrementError ? ts : null,
    params.errorCode ?? null,
    params.errorMessage ?? null,
    params.incrementSuccess ? 1 : 0,
    params.incrementError ? 1 : 0,
    ts,
    params.incrementSuccess ? 1 : 0,
    params.incrementError ? 1 : 0
  ).run();
}

export async function recordProviderApiKeySuccess(
  db: D1Database,
  selection: Extract<ProviderKeySelection, { ok: true }>
) {
  const ts = nowIso();
  const minuteKey = ts.slice(0, 16);
  await db.batch([
    db.prepare(
      `INSERT INTO api_key_usage_window (provider, model, key_id, window_type, window_key, request_count, updated_at)
       VALUES (?, ?, ?, 'minute', ?, 1, ?)
       ON CONFLICT(provider, model, key_id, window_type, window_key) DO UPDATE SET
         request_count = api_key_usage_window.request_count + 1,
         updated_at = excluded.updated_at`
    ).bind(selection.provider, selection.model, selection.keyId, minuteKey, ts),
    db.prepare(
      `INSERT INTO api_key_usage_window (provider, model, key_id, window_type, window_key, request_count, updated_at)
       VALUES (?, ?, ?, 'day', ?, 1, ?)
       ON CONFLICT(provider, model, key_id, window_type, window_key) DO UPDATE SET
         request_count = api_key_usage_window.request_count + 1,
         updated_at = excluded.updated_at`
    ).bind(selection.provider, selection.model, selection.keyId, ts.slice(0, 10), ts)
  ]);

  await upsertState(db, {
    provider: selection.provider,
    model: selection.model,
    keyId: selection.keyId,
    status: 'active',
    exhaustedUntil: null,
    incrementSuccess: true
  });
}

export async function recordProviderApiKeyFailure(
  db: D1Database,
  env: Env,
  selection: Extract<ProviderKeySelection, { ok: true }>,
  reason: 'quota' | 'blocked' | 'error',
  message?: string
) {
  let status: 'active' | 'blocked' | 'exhausted' = 'active';
  let exhaustedUntil: string | null = null;
  let errorCode = 'GENERIC_ERROR';

  if (reason === 'quota') {
    status = 'exhausted';
    errorCode = 'QUOTA_EXCEEDED';
    exhaustedUntil = selection.provider === 'gemini'
      ? nextSantiagoMidnightIso(parsePositiveInt(env.GEMINI_DAILY_RESET_HOUR, 0))
      : addHoursIso(parsePositiveInt(env.MISTRAL_QUOTA_COOLDOWN_HOURS, 12));
  } else if (reason === 'blocked') {
    status = 'blocked';
    errorCode = 'KEY_BLOCKED';
  }

  await upsertState(db, {
    provider: selection.provider,
    model: selection.model,
    keyId: selection.keyId,
    status,
    exhaustedUntil,
    errorCode,
    errorMessage: message ?? null,
    incrementError: true
  });
}
