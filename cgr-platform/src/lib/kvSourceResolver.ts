// cgr-platform/src/lib/kvSourceResolver.ts
// Helper único de fuente local estricta para dictámenes CGR.
// Contrato: buscar localmente antes de cualquier fallback web.
// Fase 0 — bug report 2026-05-22: contención inmediata.
// Madurez: prototipo revisable.
//
// Reglas:
// - Buscar en: SOURCE:id → SOURCE:dictamen:id → PASO:id
// - Validar JSON parseable y documento_completo
// - Devolver metadata de resolución auditable
// - Si todo falla: SourceLocalMissingException con trazabilidad

import type { Env } from '../types';

// ─── Tipos de resolución ───────────────────────────────────────────

export interface SourceResolution {
  /** Namespace de KV donde se encontró: 'DICTAMENES_SOURCE' o 'DICTAMENES_PASO' */
  namespace: string;
  /** Llave KV exacta resuelta */
  key: string;
  /** Bytes totales del payload JSON (stringified) */
  payload_bytes: number;
  /** Bytes del campo documento_completo (0 si no existe) */
  documento_completo_bytes: number;
  /** true si documento_completo existe y es string no vacío */
  has_documento_completo: boolean;
}

export interface SourceAttempt {
  namespace: string;
  key: string;
  error?: string;
}

// ─── Excepción auditable ───────────────────────────────────────────

export class SourceLocalMissingException extends Error {
  public readonly dictamenId: string;
  public readonly attempts: SourceAttempt[];
  public readonly environment: string | undefined;
  public readonly timestamp: string;

  constructor(
    dictamenId: string,
    attempts: SourceAttempt[],
    environment?: string
  ) {
    const probed = attempts.map(a => `${a.namespace}:${a.key}`).join(', ');
    super(
      `SOURCE_LOCAL_MISSING: dictamen ${dictamenId} no encontrado en KV local. ` +
      `Namespaces/llaves probados: [${probed}]. Entorno: ${environment ?? 'desconocido'}.`
    );
    this.name = 'SourceLocalMissingException';
    this.dictamenId = dictamenId;
    this.attempts = attempts;
    this.environment = environment;
    this.timestamp = new Date().toISOString();
  }

  /** Forma loggeable estructurada para eventos y auditoría. */
  toLoggable(): Record<string, unknown> {
    return {
      exception: this.name,
      dictamen_id: this.dictamenId,
      attempts: this.attempts,
      environment: this.environment,
      timestamp: this.timestamp,
      message: this.message,
    };
  }
}

// ─── Normalización de entrada ──────────────────────────────────────

/**
 * Normaliza un identificador de dictamen CGR eliminando prefijos redundantes.
 *
 * Reglas:
 * - "dictamen:D286N26" → "D286N26" (strip prefix)
 * - "D286N26" → "D286N26" (pass-through)
 * - "dictamen:dictamen:D286N26" → "D286N26" (double-prefix safe)
 *
 * Garantiza que nunca se genere "dictamen:dictamen:*" al construir llaves KV.
 */
function normalizeDictamenId(raw: string): string {
  let normalized = raw.trim();
  // Remover todos los prefijos "dictamen:" encadenados
  while (normalized.startsWith('dictamen:')) {
    normalized = normalized.slice('dictamen:'.length);
  }
  // Si después de limpiar queda vacío, retornar el original (defensivo)
  if (normalized.length === 0) {
    return raw.trim();
  }
  return normalized;
}

// ─── Resolvedor principal ──────────────────────────────────────────

/**
 * Recupera fuente local de dictamen desde KV con búsqueda estricta.
 *
 * Entrada normalizada: "D286N26", "dictamen:D286N26" y "dictamen:dictamen:D286N26"
 * se tratan como equivalentes. Nunca se generan llaves con doble prefijo.
 *
 * Orden de búsqueda:
 * 1. DICTAMENES_SOURCE:${id_puro}
 * 2. DICTAMENES_SOURCE:dictamen:${id_puro}
 * 3. DICTAMENES_PASO:${id_puro}
 *
 * Validaciones:
 * - El valor debe ser JSON parseable.
 * - Se verifica presencia de documento_completo (reportado, no bloqueante).
 * - Se calculan payload_bytes y documento_completo_bytes.
 *
 * @returns SourceResolution con metadata de dónde y cómo se encontró.
 * @throws {SourceLocalMissingException} Si no se encuentra en ningún namespace.
 */
export async function getDictamenSourceStrict(
  env: Env,
  id: string
): Promise<{ resolution: SourceResolution; rawJson: unknown }> {
  const attempts: SourceAttempt[] = [];
  const environment = env.ENVIRONMENT;

  // Normalizar entrada: "dictamen:D286N26" → "D286N26"
  const pureId = normalizeDictamenId(id);

  // Secuencia de búsqueda priorizada (Fase 0 — bug report sección 6).
  const probes: Array<{ namespace: string; kvKey: string; getter: () => Promise<string | null> }> = [
    {
      namespace: 'DICTAMENES_SOURCE',
      kvKey: pureId,
      getter: async () => env.DICTAMENES_SOURCE.get(pureId, { type: 'text' }),
    },
    {
      namespace: 'DICTAMENES_SOURCE',
      kvKey: `dictamen:${pureId}`,
      getter: async () => env.DICTAMENES_SOURCE.get(`dictamen:${pureId}`, { type: 'text' }),
    },
    {
      namespace: 'DICTAMENES_PASO',
      kvKey: pureId,
      getter: async () => env.DICTAMENES_PASO.get(pureId, { type: 'text' }),
    },
  ];

  for (const probe of probes) {
    const attempt: SourceAttempt = { namespace: probe.namespace, key: probe.kvKey };

    try {
      const rawText = await probe.getter();

      if (!rawText || rawText.trim().length === 0) {
        attempt.error = 'KV key not found or empty';
        attempts.push(attempt);
        continue;
      }

      // Validar JSON parseable
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        attempt.error = 'JSON parse error: payload inválido';
        attempts.push(attempt);
        continue;
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        attempt.error = 'JSON parse error: payload no es objeto';
        attempts.push(attempt);
        continue;
      }

      // Calcular bytes del payload completo
      const payloadBytes = new TextEncoder().encode(rawText).length;

      // Extraer documento_completo desde las envolturas posibles (DictamenRaw)
      const data = parsed as Record<string, unknown>;
      const sourceCandidate =
        data.documento_completo ??
        (data._source ? (data._source as Record<string, unknown>).documento_completo : undefined) ??
        (data.source ? (data.source as Record<string, unknown>).documento_completo : undefined) ??
        (data.raw_data ? (data.raw_data as Record<string, unknown>).documento_completo : undefined);

      const hasDocumentoCompleto =
        typeof sourceCandidate === 'string' && sourceCandidate.trim().length > 0;
      const documentoCompletoBytes = hasDocumentoCompleto
        ? new TextEncoder().encode(sourceCandidate as string).length
        : 0;

      const resolution: SourceResolution = {
        namespace: probe.namespace,
        key: probe.kvKey,
        payload_bytes: payloadBytes,
        documento_completo_bytes: documentoCompletoBytes,
        has_documento_completo: hasDocumentoCompleto,
      };

      return { resolution, rawJson: parsed };
    } catch (error: unknown) {
      attempt.error = error instanceof Error ? error.message : String(error);
      attempts.push(attempt);
      // Continuar con el siguiente probe
    }
  }

  // Falló toda la cadena de búsqueda: excepción auditable.
  throw new SourceLocalMissingException(id, attempts, environment);
}

/**
 * Variante que no lanza excepción — retorna null si no se encuentra.
 * Útil para código legacy que maneja null explícitamente mientras se migra.
 *
 * ⚠️  Preferir getDictamenSourceStrict para código nuevo o migrado.
 */
export async function getSourceJsonWithFallbackStrict(
  env: Env,
  id: string
): Promise<unknown | null> {
  try {
    const result = await getDictamenSourceStrict(env, id);
    return result.rawJson;
  } catch (error) {
    if (error instanceof SourceLocalMissingException) {
      return null;
    }
    throw error;
  }
}
