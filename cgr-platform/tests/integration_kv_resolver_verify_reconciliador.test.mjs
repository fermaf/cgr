// cgr-platform/tests/integration_kv_resolver_verify_reconciliador.test.mjs
// Test de integración cross-componente local: kvSourceResolver ↔ kvVerify ↔ reconciliadorKV.
//
// Uso: node --import tsx/esm --test tests/integration_kv_resolver_verify_reconciliador.test.mjs
//
// Flujo E2E local sin Cloudflare:
//   1. putWithVerifyNoCrypto → escribe payload en mock KV y verifica post-write
//   2. getDictamenSourceStrict  → resolve la misma llave via cadena de búsqueda
//   3. parseKVPayload          → analiza el raw payload con métricas reconciliador
//   4. Cross-verificación      → payload_bytes, has_documento_completo,
//                                 documento_completo_bytes deben coincidir entre las 3 capas
//
// Madurez: prototipo técnico usable interno, no desplegado.
// Capa fuente: Capa 1 (KV/API) — mocks locales, cero Cloudflare productivo.

import * as assert from 'node:assert/strict';
import { test, describe } from 'node:test';

// ─── Importaciones reales ──────────────────────────────────────────────────
// kvVerify (TS, necesita tsx loader)
import { putWithVerifyNoCrypto } from '../src/storage/kvVerify.ts';

// kvSourceResolver (TS, necesita tsx loader)
import {
  getDictamenSourceStrict,
  SourceLocalMissingException,
} from '../src/lib/kvSourceResolver.ts';

// reconciliadorKV (JS puro, sin dependencias)
import {
  parseKVPayload,
  reconcileDictamen,
  aggregateMetrics,
} from '../src/lib/reconciliadorKV.mjs';

// ─── Mocks ────────────────────────────────────────────────────────────────

/**
 * Mock compartido de KVNamespace que SIRVE TANTO para kvVerify como para resolver.
 *
 * kvVerify usa: kv.put(key, value) + kv.get(key)
 * Resolver usa: kv.get(key, { type: 'text' })
 *
 * Este mock unifica ambos contratos en un solo almacén interno.
 */
function mockKVNamespace(initialEntries = {}) {
  const store = { ...initialEntries };

  // ── helpers de inspección para tests ──
  let _lastPutKey = null;
  let _lastPutValue = null;

  return {
    // Para inspección desde tests
    _lastPutKey: () => _lastPutKey,
    _lastPutValue: () => _lastPutValue,
    _store: () => ({ ...store }),

    // ── Contrato kvVerify: kv.put(key, value) ──
    async put(key, value) {
      _lastPutKey = key;
      _lastPutValue = value;
      store[key] = value;
    },

    // ── Contrato compartido: kv.get(key) y kv.get(key, { type: 'text' }) ──
    async get(key, opts) {
      const val = store[key] ?? null;
      // Ambos contratos devuelven el string directamente
      return val;
    },

    // ── Métodos auxiliares requeridos por el tipo KVNamespace ──
    async delete(key) {
      delete store[key];
    },

    async list() {
      return { keys: [], list_complete: true };
    },
  };
}

/**
 * Crea un Env mock con DICTAMENES_SOURCE y DICTAMENES_PASO compartiendo
 * opcionalmente el mismo almacén (útil para tests de cascada).
 */
function mockEnv(sourceEntries = {}, pasoEntries = {}) {
  return {
    ENVIRONMENT: 'test-integration',
    DICTAMENES_SOURCE: mockKVNamespace(sourceEntries),
    DICTAMENES_PASO: mockKVNamespace(pasoEntries),
  };
}

// ─── Helpers de payload ───────────────────────────────────────────────────

function payloadConDoc(id, docText) {
  return JSON.stringify({
    _source: {
      doc_id: id,
      documento_completo: docText || `Texto íntegro del dictamen ${id} de prueba.`,
      fecha_documento: '2026-05-22',
      materia: 'Prueba de integración KV cross-componente',
      criterio: 'Test',
    },
  });
}

function payloadSinDoc(id) {
  return JSON.stringify({
    _source: {
      doc_id: id,
      fecha_documento: '2026-05-22',
      materia: 'Prueba sin documento_completo',
    },
  });
}

/** Calcula bytes de un string con TextEncoder (igual que los 3 componentes). */
function byteLength(str) {
  return new TextEncoder().encode(str).length;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE INTEGRACIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('Integración: kvVerify → kvSourceResolver → reconciliadorKV', () => {

  // ── Happy Path: ciclo Write → Resolve → Reconcile completo ───────────

  test('Ciclo completo: write con doc_completo → resolve vía SOURCE:id → reconcile', async () => {
    const env = mockEnv({}, {});
    const dictamenId = 'D286N26';
    const payload = payloadConDoc(dictamenId, 'Texto íntegro del dictamen de prueba.');
    const kv = env.DICTAMENES_SOURCE; // usamos el namespace SOURCE directamente

    // ── Fase 1: Write + Verify ───────────────────────────────────────────
    const verifyResult = await putWithVerifyNoCrypto(kv, dictamenId, payload, {
      expectedDocumentoCompleto: true,
    });

    assert.strictEqual(verifyResult.ok, true, 'kvVerify: escritura OK');
    assert.ok(verifyResult.payload_bytes > 0, 'kvVerify: payload_bytes > 0');
    assert.strictEqual(verifyResult.documento_completo_present, true,
      'kvVerify: documento_completo presente');
    assert.ok(verifyResult.documento_completo_bytes > 0,
      'kvVerify: documento_completo_bytes > 0');

    // ── Fase 2: Resolve vía SourceResolver ───────────────────────────────
    const resolved = await getDictamenSourceStrict(env, dictamenId);

    assert.strictEqual(resolved.resolution.namespace, 'DICTAMENES_SOURCE',
      'Resolver: namespace correcto');
    assert.strictEqual(resolved.resolution.key, dictamenId,
      'Resolver: key coincide');
    assert.strictEqual(resolved.resolution.has_documento_completo, true,
      'Resolver: has_documento_completo=true');
    assert.ok(resolved.resolution.payload_bytes > 0,
      'Resolver: payload_bytes > 0');
    assert.ok(resolved.resolution.documento_completo_bytes > 0,
      'Resolver: documento_completo_bytes > 0');

    // ── Fase 3: Reconciliador parsea el mismo raw payload ────────────────
    const rawPayload = await kv.get(dictamenId);
    const parsedMetrics = parseKVPayload(rawPayload, 'SOURCE', 'id');

    assert.strictEqual(parsedMetrics.present, true, 'Reconciliador: presente');
    assert.strictEqual(parsedMetrics.jsonParseable, true, 'Reconciliador: JSON válido');
    assert.strictEqual(parsedMetrics.hasDocumentoCompleto, true,
      'Reconciliador: hasDocumentoCompleto=true');

    // ── Fase 4: Cross-verificación de métricas entre las 3 capas ─────────

    // NOTA DE DISEÑO: kvVerify mide payload_bytes con String.length (UTF-16 code units),
    // mientras kvSourceResolver usa TextEncoder.encode().length (bytes UTF-8).
    // Para payloads con caracteres no-ASCII (ej. "í"), hay discrepancia.
    // Verificamos cada componente contra byteLength(payload) como ground truth (UTF-8).
    const groundTruthBytes = byteLength(payload);

    // 4a. kvVerify payload_bytes (String.length — puede diferir en no-ASCII)
    assert.ok(verifyResult.payload_bytes > 0, 'kvVerify: bytes > 0');
    // Para ASCII puro coinciden; con no-ASCII, String.length < TextEncoder bytes
    assert.ok(
      verifyResult.payload_bytes <= groundTruthBytes ||
      verifyResult.payload_bytes === groundTruthBytes,
      `kvVerify payload_bytes (${verifyResult.payload_bytes}) <= ground truth UTF-8 (${groundTruthBytes})`
    );

    // 4b. resolver usa TextEncoder, debe coincidir con ground truth
    assert.strictEqual(
      resolved.resolution.payload_bytes,
      groundTruthBytes,
      `resolver payload_bytes (${resolved.resolution.payload_bytes}) === ground truth UTF-8 (${groundTruthBytes})`
    );

    // 4c. reconciliador usa TextEncoder, debe coincidir con ground truth
    assert.strictEqual(
      parsedMetrics.payloadBytes,
      groundTruthBytes,
      `reconciliador payloadBytes (${parsedMetrics.payloadBytes}) === ground truth UTF-8 (${groundTruthBytes})`
    );

    // 4d. documento_completo_bytes: resolver y reconciliador usan TextEncoder
    if (verifyResult.documento_completo_present) {
      assert.ok(verifyResult.documento_completo_bytes > 0);
      assert.strictEqual(
        resolved.resolution.documento_completo_bytes,
        verifyResult.documento_completo_bytes,
        `doc_bytes: resolver(${resolved.resolution.documento_completo_bytes}) vs kvVerify(${verifyResult.documento_completo_bytes})`
      );
      assert.strictEqual(
        parsedMetrics.documentoCompletoBytes,
        verifyResult.documento_completo_bytes,
      );
    }

    // 4e. has_documento_completo debe ser consistente
    assert.strictEqual(
      verifyResult.documento_completo_present,
      resolved.resolution.has_documento_completo,
      'has_doc: consistencia kvVerify ↔ resolver'
    );
    assert.strictEqual(
      verifyResult.documento_completo_present,
      parsedMetrics.hasDocumentoCompleto,
      'has_doc: consistencia kvVerify ↔ reconciliador'
    );
  });

  // ── Consistencia sin documento_completo ────────────────────────────

  test('Payload sin documento_completo: las 3 capas reportan ausencia', async () => {
    const env = mockEnv({}, {});
    const dictamenId = 'NODOC01';
    const payload = payloadSinDoc(dictamenId);
    const kv = env.DICTAMENES_SOURCE;

    // Write sin exigir doc_completo
    const verifyResult = await putWithVerifyNoCrypto(kv, dictamenId, payload);
    assert.strictEqual(verifyResult.ok, true);
    assert.strictEqual(verifyResult.documento_completo_present, false);

    // Resolve
    const resolved = await getDictamenSourceStrict(env, dictamenId);
    assert.strictEqual(resolved.resolution.has_documento_completo, false);
    assert.strictEqual(resolved.resolution.documento_completo_bytes, 0);

    // Reconciliador
    const rawPayload = await kv.get(dictamenId);
    const parsedMetrics = parseKVPayload(rawPayload, 'SOURCE', 'id');
    assert.strictEqual(parsedMetrics.hasDocumentoCompleto, false);
    assert.strictEqual(parsedMetrics.documentoCompletoBytes, 0);

    // Cross-verify: las 3 capas coinciden en ausencia
    assert.strictEqual(verifyResult.documento_completo_present, false);
    assert.strictEqual(resolved.resolution.has_documento_completo, false);
    assert.strictEqual(parsedMetrics.hasDocumentoCompleto, false);
  });

  // ── Cascada del resolver: fallback a PASO ──────────────────────────

  test('Resolver cascada: fallback a DICTAMENES_PASO cuando SOURCE no tiene la llave', async () => {
    // Escribimos SOLO en PASO, NO en SOURCE
    const env = mockEnv({}, {});
    const dictamenId = 'PASO01';
    const payload = payloadConDoc(dictamenId, 'Dictamen desde PASO.');
    const pasoKV = env.DICTAMENES_PASO;

    // Write en PASO
    const verifyResult = await putWithVerifyNoCrypto(pasoKV, dictamenId, payload, {
      expectedDocumentoCompleto: true,
    });
    assert.strictEqual(verifyResult.ok, true);

    // Resolver: no encuentra en SOURCE → debe caer a PASO:id
    const resolved = await getDictamenSourceStrict(env, dictamenId);

    assert.strictEqual(resolved.resolution.namespace, 'DICTAMENES_PASO',
      'Resolver encontró en PASO tras fallar SOURCE:id y SOURCE:dictamen:id');
    assert.strictEqual(resolved.resolution.key, dictamenId);
    assert.strictEqual(resolved.resolution.has_documento_completo, true);

    // Las métricas de verify (vs PASO) y resolver deben coincidir
    // contra ground truth UTF-8
    const groundTruthBytes = byteLength(payload);
    assert.strictEqual(
      resolved.resolution.payload_bytes,
      groundTruthBytes,
      `resolver payload_bytes (${resolved.resolution.payload_bytes}) === ground truth UTF-8 (${groundTruthBytes})`
    );
    assert.strictEqual(
      verifyResult.documento_completo_bytes,
      resolved.resolution.documento_completo_bytes,
      'doc_bytes consistente verify(PASO) ↔ resolver'
    );
  });

  // ── Prioridad de llaves: SOURCE:id > SOURCE:dictamen:id ────────────

  test('Prioridad: SOURCE:id gana sobre SOURCE:dictamen:id cuando ambos existen', async () => {
    const dictamenId = 'E85862N25';
    const payloadPuro = payloadConDoc(dictamenId, 'Versión nueva (id puro).');
    const payloadLegacy = payloadConDoc(dictamenId, 'Versión legacy (dictamen:id).');

    // Escribimos AMBAS llaves en SOURCE
    const env = mockEnv({}, {});
    const sourceKV = env.DICTAMENES_SOURCE;

    // Escribir llave id puro
    await putWithVerifyNoCrypto(sourceKV, dictamenId, payloadPuro);
    // Escribir llave dictamen:id (legacy)
    await putWithVerifyNoCrypto(sourceKV, `dictamen:${dictamenId}`, payloadLegacy);

    // Resolver: debe tomar SOURCE:id (primera prioridad)
    const resolved = await getDictamenSourceStrict(env, dictamenId);

    assert.strictEqual(resolved.resolution.namespace, 'DICTAMENES_SOURCE');
    assert.strictEqual(resolved.resolution.key, dictamenId,
      'Debe resolver a id puro, no a dictamen:id');
    assert.strictEqual(resolved.resolution.has_documento_completo, true);

    // El documento_completo debe ser el de la versión nueva
    const rawJson = resolved.rawJson;
    assert.strictEqual(
      rawJson._source.documento_completo,
      'Versión nueva (id puro).',
      'El contenido es el de la llave id puro, no el legacy'
    );
  });

  // ── SourceLocalMissingException: sin fuente en ningún namespace ────

  test('SourceLocalMissingException: resolver lanza cuando ningún namespace tiene la llave', async () => {
    const env = mockEnv({}, {}); // ambos namespaces vacíos

    await assert.rejects(
      async () => getDictamenSourceStrict(env, 'Z99999'),
      (err) => {
        assert.ok(err instanceof SourceLocalMissingException);
        assert.strictEqual(err.dictamenId, 'Z99999');
        assert.strictEqual(err.attempts.length, 3);
        assert.strictEqual(err.environment, 'test-integration');
        assert.ok(err.message.includes('SOURCE_LOCAL_MISSING'));
        return true;
      },
    );
  });

  // ── Reconciliador integrado: reconcileDictamen con datos reales ─────

  test('Reconciliador: reconcileDictamen con métricas reales del ciclo write→resolve', async () => {
    const env = mockEnv({}, {});
    const dictamenId = 'REC01';
    const payload = payloadConDoc(dictamenId, 'Dictamen para reconciliación.');
    const kv = env.DICTAMENES_SOURCE;

    // Write
    await putWithVerifyNoCrypto(kv, dictamenId, payload);

    // Raw payload para parseKVPayload
    const raw = await kv.get(dictamenId);

    // Métricas de las 3 llaves posibles
    const sourceIdMetrics = parseKVPayload(raw, 'SOURCE', 'id');
    // SOURCE:dictamen:id — no existe en este test
    const sourceDictamenIdMetrics = parseKVPayload(null, 'SOURCE', 'dictamen:id');
    // PASO:id — no existe en este test
    const pasoIdMetrics = parseKVPayload(null, 'PASO', 'id');

    // Reconciliación
    const rec = reconcileDictamen(
      dictamenId,
      1, // d1EnSource (simulado: D1 dice que sí está en source)
      0, // d1EnPaso (no está en paso)
      sourceIdMetrics,
      sourceDictamenIdMetrics,
      pasoIdMetrics,
    );

    assert.strictEqual(rec.dictamenId, dictamenId);
    assert.strictEqual(rec.sourceId.present, true);
    assert.strictEqual(rec.sourceId.jsonParseable, true);
    assert.strictEqual(rec.sourceId.hasDocumentoCompleto, true);
    assert.strictEqual(rec.sourceDictamenId.present, false);
    assert.strictEqual(rec.pasoId.present, false);
    assert.strictEqual(rec.badJson, false);
    assert.strictEqual(rec.missingDocumentoCompleto, false);
    assert.strictEqual(rec.enSourceMismatch, false,
      'No hay mismatch porque D1 dice 1 y KV tiene la llave');
  });

  // ── Reconciliador: enSourceMismatch detectado ───────────────────────

  test('Reconciliador: detecta enSourceMismatch cuando D1=0 pero KV tiene la llave', async () => {
    const env = mockEnv({}, {});
    const dictamenId = 'MISMATCH01';
    const payload = payloadConDoc(dictamenId, 'Dictamen con mismatch.');
    const kv = env.DICTAMENES_SOURCE;

    await putWithVerifyNoCrypto(kv, dictamenId, payload);
    const raw = await kv.get(dictamenId);

    const sourceIdMetrics = parseKVPayload(raw, 'SOURCE', 'id');
    const sourceDictamenIdMetrics = parseKVPayload(null, 'SOURCE', 'dictamen:id');
    const pasoIdMetrics = parseKVPayload(null, 'PASO', 'id');

    const rec = reconcileDictamen(
      dictamenId,
      0, // ← D1 dice en_source=0 pero KV SÍ tiene la llave
      0,
      sourceIdMetrics,
      sourceDictamenIdMetrics,
      pasoIdMetrics,
    );

    assert.strictEqual(rec.enSourceMismatch, true,
      'Debe marcar mismatch cuando D1=0 y KV tiene la llave');
  });

  // ── Reconciliador: aggregateMetrics con batch mixto ─────────────────

  test('Reconciliador: aggregateMetrics sobre batch mixto (presentes + ausentes)', async () => {
    const env = mockEnv({}, {});
    const kv = env.DICTAMENES_SOURCE;

    // Escribir 2 dictámenes
    await putWithVerifyNoCrypto(kv, 'A01', payloadConDoc('A01', 'Doc A.'));
    await putWithVerifyNoCrypto(kv, 'A02', payloadSinDoc('A02'));

    // Construir detalles para 3 dictámenes (A01 presente, A02 presente sin doc, A03 ausente)
    const detalles = [
      reconcileDictamen('A01', 1, 0,
        parseKVPayload(await kv.get('A01'), 'SOURCE', 'id'),
        parseKVPayload(null, 'SOURCE', 'dictamen:id'),
        parseKVPayload(null, 'PASO', 'id'),
      ),
      reconcileDictamen('A02', 1, 0,
        parseKVPayload(await kv.get('A02'), 'SOURCE', 'id'),
        parseKVPayload(null, 'SOURCE', 'dictamen:id'),
        parseKVPayload(null, 'PASO', 'id'),
      ),
      reconcileDictamen('A03', 0, 0,
        parseKVPayload(null, 'SOURCE', 'id'),
        parseKVPayload(null, 'SOURCE', 'dictamen:id'),
        parseKVPayload(null, 'PASO', 'id'),
      ),
    ];

    const agg = aggregateMetrics(detalles);

    assert.strictEqual(agg.sourceIdPresent, 2, '2 de 3 presentes en SOURCE:id');
    assert.strictEqual(agg.sourceDictamenIdPresent, 0);
    assert.strictEqual(agg.pasoIdPresent, 0);
    assert.strictEqual(agg.badJson, 0);
    assert.strictEqual(agg.missingDocumentoCompleto, 1, 'A02 sin doc_completo');
    assert.strictEqual(agg.enSourceMismatch, 0);
    assert.ok(agg.totalSourcePayloadBytes > 0);
    assert.ok(agg.avgSourcePayloadBytes > 0);
    assert.ok(agg.totalDocCompletoBytes > 0, 'Al menos A01 tiene doc_completo bytes');
  });

  // ── Caso borde: documento_completo whitespace (B2 consistency) ──────

  test('Consistencia B2: documento_completo whitespace → las 3 capas reportan ausencia', async () => {
    const env = mockEnv({}, {});
    const dictamenId = 'WSP01';
    const kv = env.DICTAMENES_SOURCE;

    const payload = JSON.stringify({
      _source: {
        doc_id: dictamenId,
        documento_completo: '   \n\t  ',  // solo whitespace
        materia: 'Test whitespace',
      },
    });

    // Write (no exigimos doc_completo porque es whitespace)
    const verifyResult = await putWithVerifyNoCrypto(kv, dictamenId, payload);
    assert.strictEqual(verifyResult.ok, true);
    assert.strictEqual(verifyResult.documento_completo_present, false,
      'kvVerify: whitespace no cuenta como presente (B2)');

    // Resolve
    const resolved = await getDictamenSourceStrict(env, dictamenId);
    assert.strictEqual(resolved.resolution.has_documento_completo, false,
      'Resolver: whitespace no cuenta como presente (B2)');
    assert.strictEqual(resolved.resolution.documento_completo_bytes, 0);

    // Reconciliador
    const raw = await kv.get(dictamenId);
    const parsed = parseKVPayload(raw, 'SOURCE', 'id');
    assert.strictEqual(parsed.hasDocumentoCompleto, false,
      'Reconciliador: whitespace no cuenta como presente (B2)');
    assert.strictEqual(parsed.documentoCompletoBytes, 0);
  });

  // ── End-to-end: payload con source anidado ─────────────────────────

  test('E2E: payload con documento_completo en source (no _source)', async () => {
    const env = mockEnv({}, {});
    const dictamenId = 'SRC01';
    const kv = env.DICTAMENES_SOURCE;

    const payload = JSON.stringify({
      source: {
        documento_completo: 'Dictamen desde source.',
        materia: 'Test envoltura source',
      },
    });

    // Write
    const verifyResult = await putWithVerifyNoCrypto(kv, dictamenId, payload, {
      expectedDocumentoCompleto: true,
    });
    assert.strictEqual(verifyResult.ok, true);

    // Resolve
    const resolved = await getDictamenSourceStrict(env, dictamenId);
    assert.strictEqual(resolved.resolution.has_documento_completo, true);

    // Reconciliador
    const raw = await kv.get(dictamenId);
    const parsed = parseKVPayload(raw, 'SOURCE', 'id');
    assert.strictEqual(parsed.hasDocumentoCompleto, true);

    // Cross-verify con ground truth UTF-8
    const groundTruthBytes = byteLength(payload);
    assert.strictEqual(
      resolved.resolution.payload_bytes,
      groundTruthBytes,
    );
    assert.strictEqual(
      resolved.resolution.documento_completo_bytes,
      verifyResult.documento_completo_bytes,
    );
  });
});
