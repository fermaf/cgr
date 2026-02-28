// cgr-platform/src/lib/incident.ts

export type IncidentFamily =
  | 'db'
  | 'network'
  | 'kv'
  | 'ai'
  | 'workflow'
  | 'config'
  | 'auth'
  | 'io'
  | 'unknown';

export type IncidentSystem =
  | 'd1'
  | 'kv'
  | 'mistral'
  | 'pinecone'
  | 'workflows'
  | 'http'
  | 'worker'
  | 'unknown';

export type IncidentCode =
  // DB / D1
  | 'D1_NO_SUCH_TABLE'
  | 'D1_NO_SUCH_COLUMN'
  | 'D1_SQL_ERROR'
  // Workflow
  | 'WORKFLOW_TEST_ERROR'
  | 'WORKFLOW_RPC_EXCEPTION'
  | 'WORKER_INTERNAL_ERROR_REFERENCE'
  // Network / HTTP
  | 'NETWORK_DNS_LOOKUP_FAILED'
  | 'NETWORK_FETCH_FAILED'
  | 'HTTP_429_RATE_LIMIT'
  | 'HTTP_4XX_CLIENT_ERROR'
  | 'HTTP_5XX'
  // AI
  | 'AI_GATEWAY_TIMEOUT'
  // Fallback
  | 'UNKNOWN';

export type Incident = {
  ts: string;
  env: 'local' | 'prod' | 'unknown';
  service: string;
  workflow?: string;
  kind: IncidentFamily;
  system: IncidentSystem;
  code: IncidentCode;
  message: string;

  table?: string;
  column?: string;
  fingerprint?: string;

  // Contexto de depuración (sin secretos)
  context?: Record<string, unknown>;
};

const SENSITIVE_KEYS = [
  'token',
  'password',
  'secret',
  'api_key',
  'apikey',
  'authorization',
  'rut',
  'dni',
  'email',
  'phone',
  'cookie',
  'set-cookie'
];

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /bearer\s+[a-z0-9._\-]+/i,
  /sk-[a-z0-9]{8,}/i,
  /pcsk_[a-z0-9_\-]{8,}/i,
  /(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/i
];

function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => normalized.includes(sensitive));
}

function redactString(value: string): string {
  let redacted = value;
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

function sanitizeValue(value: unknown, keyHint: string | null, visited: WeakSet<object>): unknown {
  if (keyHint && isSensitiveKey(keyHint)) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, keyHint, visited));
  }

  if (isRecord(value)) {
    if (visited.has(value)) {
      return '[CIRCULAR]';
    }
    visited.add(value);
    const output: Record<string, unknown> = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      output[nestedKey] = sanitizeValue(nestedValue, nestedKey, visited);
    }
    return output;
  }

  return value;
}

export function sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const visited = new WeakSet<object>();
  return sanitizeValue(context, null, visited) as Record<string, unknown>;
}

function withFingerprint(incident: Incident): Incident {
  const base = [
    incident.code,
    incident.system,
    incident.service,
    incident.workflow ?? 'none',
    incident.table ?? '',
    incident.column ?? ''
  ].join('|');

  const data = new TextEncoder().encode(base);
  let hash = 2166136261;
  for (const byte of data) {
    hash ^= byte;
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  const fingerprint = (hash >>> 0).toString(16).padStart(8, '0');
  return { ...incident, fingerprint };
}

export function normalizeIncident(params: {
  error: unknown;
  env: Incident['env'];
  service: string;
  workflow?: string;
  context?: Record<string, unknown>;
}): Incident {
  const ts = new Date().toISOString();
  const message = params.error instanceof Error ? params.error.message : safeString(params.error);
  const normalizedMessage = message.toLowerCase();
  const sanitizedContext = sanitizeContext(params.context);
  const cgrBaseUrl =
    typeof params.context?.cgrBaseUrl === 'string' ? params.context.cgrBaseUrl : undefined;

  const baseIncident = {
    ts,
    env: params.env,
    service: params.service,
    workflow: params.workflow,
    message
  };

  const reNoSuchTable = /no such table:\s*([a-zA-Z0-9_]+)/i;
  const mTable = message.match(reNoSuchTable);
  if (mTable) {
    return withFingerprint({
      ...baseIncident,
      kind: 'db',
      system: 'd1',
      code: 'D1_NO_SUCH_TABLE',
      table: mTable[1],
      context: sanitizedContext
    });
  }

  const reNoSuchColumn = /no such column:\s*([a-zA-Z0-9_]+)/i;
  const mCol = message.match(reNoSuchColumn);
  if (mCol) {
    return withFingerprint({
      ...baseIncident,
      kind: 'db',
      system: 'd1',
      code: 'D1_NO_SUCH_COLUMN',
      column: mCol[1],
      context: sanitizedContext
    });
  }

  if (/skill_test_error_forced/i.test(message)) {
    return withFingerprint({
      ...baseIncident,
      kind: 'workflow',
      system: 'workflows',
      code: 'WORKFLOW_TEST_ERROR',
      context: sanitizedContext
    });
  }

  if (/rpc exception/i.test(message)) {
    return withFingerprint({
      ...baseIncident,
      kind: 'workflow',
      system: 'workflows',
      code: 'WORKFLOW_RPC_EXCEPTION',
      context: sanitizedContext
    });
  }

  const referenceMatch = message.match(/reference(?:\s*id)?\s*[:=]\s*([a-zA-Z0-9-]+)/i);
  if (referenceMatch && /internal error/i.test(message) && cgrBaseUrl) {
    const mergedContext = sanitizeContext({
      ...(sanitizedContext ?? {}),
      reference: referenceMatch[1],
      cgrBaseUrl
    });

    return withFingerprint({
      ...baseIncident,
      kind: 'network',
      system: 'http',
      code: 'NETWORK_DNS_LOOKUP_FAILED',
      context: mergedContext
    });
  }

  if (referenceMatch && /internal error/i.test(message)) {
    const mergedContext = sanitizeContext({
      ...(sanitizedContext ?? {}),
      reference: referenceMatch[1]
    });

    return withFingerprint({
      ...baseIncident,
      kind: 'workflow',
      system: 'workflows',
      code: 'WORKER_INTERNAL_ERROR_REFERENCE',
      context: mergedContext
    });
  }

  if (/gateway_timeout/i.test(normalizedMessage)) {
    return withFingerprint({
      ...baseIncident,
      kind: 'ai',
      system: 'mistral',
      code: 'AI_GATEWAY_TIMEOUT',
      context: sanitizedContext
    });
  }

  const statusMatch = message.match(/(?:fetch failed:\s*|status\s*=\s*|status\s+)(\d{3})/i);
  if (statusMatch) {
    const status = Number.parseInt(statusMatch[1], 10);
    if (status === 429) {
      return withFingerprint({
        ...baseIncident,
        kind: 'network',
        system: 'http',
        code: 'HTTP_429_RATE_LIMIT',
        context: sanitizedContext
      });
    }

    if (status >= 500) {
      return withFingerprint({
        ...baseIncident,
        kind: 'network',
        system: 'http',
        code: 'HTTP_5XX',
        context: sanitizedContext
      });
    }

    if (status >= 400) {
      return withFingerprint({
        ...baseIncident,
        kind: 'network',
        system: 'http',
        code: 'HTTP_4XX_CLIENT_ERROR',
        context: sanitizedContext
      });
    }
  }

  if (
    /dns lookup failed|enotfound|eai_again|getaddrinfo|failed to resolve|name not resolved/i.test(normalizedMessage)
  ) {
    return withFingerprint({
      ...baseIncident,
      kind: 'network',
      system: 'http',
      code: 'NETWORK_DNS_LOOKUP_FAILED',
      context: sanitizedContext
    });
  }

  if (/fetch failed|network error|socket hang up|connect timeout/i.test(normalizedMessage)) {
    return withFingerprint({
      ...baseIncident,
      kind: 'network',
      system: 'http',
      code: 'NETWORK_FETCH_FAILED',
      context: sanitizedContext
    });
  }

  return withFingerprint({
    ...baseIncident,
    kind: 'unknown',
    system: 'worker',
    code: 'UNKNOWN',
    context: sanitizedContext
  });
}
