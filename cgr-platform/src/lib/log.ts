export function formatError(error: unknown): string {
  if (error instanceof Error) {
    const stack = error.stack ? ` | stack=${error.stack}` : "";
    return `${error.name}: ${error.message}${stack}`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_PRIORITIES: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

let currentLogLevel: LogLevel = "info";

export function setLogLevel(level?: string) {
  const normalized = String(level ?? "").trim().toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error") {
    currentLogLevel = normalized;
  } else {
    currentLogLevel = "info";
  }
}

function shouldLog(level: LogLevel) {
  return LOG_PRIORITIES[level] >= LOG_PRIORITIES[currentLogLevel];
}

function stringifyFields(fields?: Record<string, unknown>): string {
  if (!fields || Object.keys(fields).length === 0) return "";
  try {
    return ` ${JSON.stringify(fields)}`;
  } catch {
    return "";
  }
}

export function logDebug(event: string, fields?: Record<string, unknown>) {
  if (!shouldLog("debug")) return;
  console.log(`[${event}]${stringifyFields(fields)}`);
}

export function logInfo(event: string, fields?: Record<string, unknown>) {
  if (!shouldLog("info")) return;
  console.log(`[${event}]${stringifyFields(fields)}`);
}

export function logWarn(event: string, fields?: Record<string, unknown>) {
  if (!shouldLog("warn")) return;
  console.warn(`[${event}]${stringifyFields(fields)}`);
}

export function logError(event: string, error: unknown, fields?: Record<string, unknown>) {
  if (!shouldLog("error")) return;
  const payload = { ...(fields ?? {}), error: formatError(error) };
  console.error(`[${event}]${stringifyFields(payload)}`);
}
