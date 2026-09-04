// cgr-platform/src/storage/kvVerify.ts
// Verificación post-write KV: get inmediato + validación JSON + documento_completo + sha256.
// Usa putWithRetry de kv.ts para tolerancia a 429.
//
// Contexto: bug_report_kv_documento_completo_2026-05-22.md — Fase 1.
// kv_sync_status no debe ser optimista: sólo marcar en_source=1 tras verificar lectura post-write.
//
// Parches B1+B2 (2026-05-22): refactor DRY + trim en documento_completo.

import type { KVNamespace, KVNamespacePutOptions } from '@cloudflare/workers-types';
import { putWithRetry } from './kv';

export interface KVVerifyResult {
  ok: boolean;
  payload_bytes?: number;
  documento_completo_bytes?: number;
  documento_completo_present?: boolean;
  sha256?: string;
  error?: string;
}

export interface KVVerifyOptions {
  /** Si true, exige que documento_completo exista en el payload verificado. */
  expectedDocumentoCompleto?: boolean;
}

// ── Estado intermedio entre put+get+parse y la verificación final ──────────

type _VerifiedState = {
  _kind: 'ok';
  raw: string;
  payload_bytes: number;
  hasDocCompleto: boolean;
  documento_completo_bytes?: number;
};

type _HelperResult =
  | _VerifiedState
  | { _kind: 'error'; result: KVVerifyResult };

/**
 * Helper interno: escribe con retry, lee inmediatamente, valida JSON y
 * verifica presencia de documento_completo (con trim).
 *
 * Retorna el estado intermedio en caso de éxito, o un KVVerifyResult
 * con ok=false en caso de error. Las funciones públicas agregan su paso
 * específico (sha256 / omitido).
 */
async function _putAndGetVerified(
  kv: KVNamespace,
  key: string,
  payload: string,
  options?: KVVerifyOptions,
): Promise<_HelperResult> {
  // ── 1. Escritura con retry (tolerancia a 429 vía putWithRetry) ──────────
  try {
    await putWithRetry(kv, key, payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      _kind: 'error',
      result: { ok: false, error: `KV put failed: ${message}` },
    };
  }

  // ── 2. Lectura inmediata post-write ──────────────────────────────────────
  let raw: string | null;
  try {
    raw = await kv.get(key);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      _kind: 'error',
      result: { ok: false, error: `KV get post-write failed: ${message}` },
    };
  }

  if (raw === null || raw === undefined) {
    return {
      _kind: 'error',
      result: {
        ok: false,
        error: 'KV get post-write returned null — key not found after successful put',
      },
    };
  }

  // ── 3. Validación de JSON parseable ──────────────────────────────────────
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      _kind: 'error',
      result: {
        ok: false,
        payload_bytes: raw.length,
        error: 'KV post-write value is not valid JSON',
      },
    };
  }

  const payload_bytes = raw.length;

  // ── 4. Verificación de documento_completo ────────────────────────────────
  // Extraer el source anidado (estructura canónica: raw._source / raw.source / raw.raw_data)
  const source: Record<string, unknown> =
    (parsed._source as Record<string, unknown>) ??
    (parsed.source as Record<string, unknown>) ??
    (parsed.raw_data as Record<string, unknown>) ??
    parsed;
  const docCompleto = source?.documento_completo;
  // Consistente con kvSourceResolver.ts línea 189: requiere string no vacío tras trim.
  const hasDocCompleto =
    typeof docCompleto === 'string' && docCompleto.trim().length > 0;

  if (options?.expectedDocumentoCompleto && !hasDocCompleto) {
    return {
      _kind: 'error',
      result: {
        ok: false,
        payload_bytes,
        documento_completo_present: false,
        error: 'documento_completo expected but missing from verified payload',
      },
    };
  }

  const documento_completo_bytes: number | undefined = hasDocCompleto
    ? new TextEncoder().encode(docCompleto as string).length
    : undefined;

  return {
    _kind: 'ok',
    raw,
    payload_bytes,
    hasDocCompleto,
    documento_completo_bytes,
  };
}

/**
 * putWithVerify: escribe en KV con retry 429, lee inmediatamente, valida JSON,
 * verifica presencia/ausencia de documento_completo y calcula sha256.
 *
 * Devuelve KVVerifyResult con ok=true sólo si todas las validaciones pasan.
 */
export async function putWithVerify(
  kv: KVNamespace,
  key: string,
  payload: string,
  options?: KVVerifyOptions,
): Promise<KVVerifyResult> {
  const verified = await _putAndGetVerified(kv, key, payload, options);
  if (verified._kind === 'error') {
    return verified.result;
  }

  const { raw, payload_bytes, hasDocCompleto, documento_completo_bytes } = verified;

  // ── 5. Cálculo de sha256 (Web Crypto API disponible en Workers) ──────────
  let sha256: string | undefined;
  try {
    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(raw),
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    sha256 = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // sha256 no es crítico — no bloquear la verificación si falla.
  }

  // ── 6. Éxito ─────────────────────────────────────────────────────────────
  return {
    ok: true,
    payload_bytes,
    documento_completo_bytes,
    documento_completo_present: hasDocCompleto,
    sha256,
  };
}

/**
 * Wrapper síncrono de verificación para entornos sin crypto.subtle (tests/miniflare).
 * Omite sha256 pero valida JSON y documento_completo.
 */
export async function putWithVerifyNoCrypto(
  kv: KVNamespace,
  key: string,
  payload: string,
  options?: KVVerifyOptions,
): Promise<KVVerifyResult> {
  const verified = await _putAndGetVerified(kv, key, payload, options);
  if (verified._kind === 'error') {
    return verified.result;
  }

  const { payload_bytes, hasDocCompleto, documento_completo_bytes } = verified;

  return {
    ok: true,
    payload_bytes,
    documento_completo_bytes,
    documento_completo_present: hasDocCompleto,
  };
}
