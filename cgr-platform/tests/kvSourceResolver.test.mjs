// cgr-platform/tests/kvSourceResolver.test.mjs
// Test unitario del helper de fuente local estricta.
// Importa getDictamenSourceStrict y SourceLocalMissingException reales desde TS.
//
// Uso: node --import tsx/esm --test tests/kvSourceResolver.test.mjs

import * as assert from 'node:assert/strict';
import { test, mock } from 'node:test';

// Importamos el helper real desde TypeScript (tsx loader en runtime).
import {
  getDictamenSourceStrict,
  getSourceJsonWithFallbackStrict,
  SourceLocalMissingException,
} from '../src/lib/kvSourceResolver.ts';

// ─── Mocks ────────────────────────────────────────────────────────────────

/**
 * Crea un mock de KVNamespace con comportamiento configurable.
 * Soporta tanto llave raw como llave con prefijo dictamen:.
 */
function mockKVNamespace(entries = {}) {
  return {
    async get(key, opts) {
      // Buscar coincidencia exacta
      if (key in entries) {
        const val = entries[key];
        if (opts?.type === 'text') return val;
        return val;
      }
      return null;
    },
    async put(key, value) {
      entries[key] = value;
    },
  };
}

/** Crea un Env mock con namespaces KV controlables. */
function mockEnv(sourceEntries = {}, pasoEntries = {}) {
  return {
    ENVIRONMENT: 'test',
    DICTAMENES_SOURCE: mockKVNamespace(sourceEntries),
    DICTAMENES_PASO: mockKVNamespace(pasoEntries),
  };
}

/** Crea un payload JSON válido con documento_completo. */
function payloadConDoc(id = 'D286N26', docText = 'Texto íntegro del dictamen de prueba.') {
  return JSON.stringify({
    _source: {
      doc_id: id,
      documento_completo: docText,
      fecha_documento: '2026-05-18',
      materia: 'Prueba de resolución KV',
      criterio: 'Test',
    },
  });
}

/** Crea un payload JSON válido SIN documento_completo. */
function payloadSinDoc(id = 'D286N26') {
  return JSON.stringify({
    _source: {
      doc_id: id,
      fecha_documento: '2026-05-18',
      materia: 'Prueba sin documento_completo',
    },
  });
}

// ─── Tests: normalización de entrada ───────────────────────────────────────

test('normalización: id puro busca SOURCE:id → SOURCE:dictamen:id → PASO:id', async () => {
  const env = mockEnv(
    { 'D286N26': payloadConDoc('D286N26') },
    {},
  );

  const result = await getDictamenSourceStrict(env, 'D286N26');

  assert.strictEqual(result.resolution.namespace, 'DICTAMENES_SOURCE');
  assert.strictEqual(result.resolution.key, 'D286N26');
  assert.strictEqual(result.resolution.has_documento_completo, true);
  assert.ok(result.resolution.payload_bytes > 0);
  assert.ok(result.resolution.documento_completo_bytes > 0);
});

test('normalización: entrada con prefijo dictamen: no genera dictamen:dictamen:*', async () => {
  // Simular que la llave existe bajo la forma legacy dictamen:D286N26
  const env = mockEnv(
    { 'dictamen:D286N26': payloadConDoc('D286N26') },
    {},
  );

  // El caller pasa el id con prefijo (caso real: viene de listado KV)
  const result = await getDictamenSourceStrict(env, 'dictamen:D286N26');

  // Debe resolver a SOURCE:dictamen:D286N26, no a dictamen:dictamen:D286N26
  assert.strictEqual(result.resolution.namespace, 'DICTAMENES_SOURCE');
  assert.strictEqual(result.resolution.key, 'dictamen:D286N26');
  assert.strictEqual(result.resolution.has_documento_completo, true);
});

test('normalización: id con prefijo — fallback a PASO si SOURCE no tiene', async () => {
  const env = mockEnv(
    {}, // SOURCE vacío
    { 'D286N26': payloadConDoc('D286N26') }, // PASO tiene
  );

  const result = await getDictamenSourceStrict(env, 'dictamen:D286N26');

  // Debe encontrar en PASO:id tras fallar SOURCE:id y SOURCE:dictamen:id
  assert.strictEqual(result.resolution.namespace, 'DICTAMENES_PASO');
  assert.strictEqual(result.resolution.key, 'D286N26');
  assert.strictEqual(result.resolution.has_documento_completo, true);
});

test('normalización: id sin prefijo — orden correcto con llave legacy presente', async () => {
  // Ambas llaves existen: id puro y dictamen:id
  const env = mockEnv(
    {
      'E85862N25': payloadConDoc('E85862N25', 'Versión nueva.'),
      'dictamen:E85862N25': payloadConDoc('E85862N25', 'Versión legacy.'),
    },
    {},
  );

  const result = await getDictamenSourceStrict(env, 'E85862N25');

  // SOURCE:id tiene prioridad sobre SOURCE:dictamen:id
  assert.strictEqual(result.resolution.namespace, 'DICTAMENES_SOURCE');
  assert.strictEqual(result.resolution.key, 'E85862N25');
  assert.strictEqual(result.resolution.has_documento_completo, true);
  // El payload debe ser la versión nueva (id puro), no la legacy
  const parsed = result.rawJson;
  assert.strictEqual(parsed._source.documento_completo, 'Versión nueva.');
});

// ─── Tests: SourceLocalMissingException ─────────────────────────────────────

test('SourceLocalMissingException: se lanza cuando no hay fuente en ningún namespace', async () => {
  const env = mockEnv({}, {});

  await assert.rejects(
    async () => getDictamenSourceStrict(env, 'Z99999'),
    (err) => {
      assert.ok(err instanceof SourceLocalMissingException);
      assert.strictEqual(err.dictamenId, 'Z99999');
      assert.strictEqual(err.attempts.length, 3);
      assert.strictEqual(err.environment, 'test');
      assert.ok(err.message.includes('SOURCE_LOCAL_MISSING'));
      return true;
    },
  );
});

test('SourceLocalMissingException: toLoggable() serializa correctamente', () => {
  const attempts = [
    { namespace: 'DICTAMENES_SOURCE', key: 'X00001', error: 'KV key not found or empty' },
    { namespace: 'DICTAMENES_SOURCE', key: 'dictamen:X00001', error: 'KV key not found or empty' },
    { namespace: 'DICTAMENES_PASO', key: 'X00001', error: 'KV key not found or empty' },
  ];

  const exc = new SourceLocalMissingException('X00001', attempts, 'staging');
  const logged = exc.toLoggable();

  assert.strictEqual(logged.exception, 'SourceLocalMissingException');
  assert.strictEqual(logged.dictamen_id, 'X00001');
  assert.strictEqual(logged.environment, 'staging');
  assert.deepStrictEqual(logged.attempts, attempts);
  assert.ok(logged.timestamp);
});

// ─── Tests: Variante con fallback ──────────────────────────────────────────

test('getSourceJsonWithFallbackStrict: retorna rawJson en éxito', async () => {
  const env = mockEnv(
    { 'D286N26': payloadConDoc('D286N26') },
    {},
  );

  const result = await getSourceJsonWithFallbackStrict(env, 'D286N26');
  assert.ok(result !== null);
  assert.strictEqual(result._source.doc_id, 'D286N26');
});

test('getSourceJsonWithFallbackStrict: retorna null en fallo', async () => {
  const env = mockEnv({}, {});

  const result = await getSourceJsonWithFallbackStrict(env, 'Z99999');
  assert.strictEqual(result, null);
});

// ─── Tests: payload no es JSON o no es objeto ─────────────────────────────

test('payload no es JSON válido: continúa al siguiente probe', async () => {
  const env = mockEnv(
    {
      'D286N26': 'esto no es JSON {{{',  // SOURCE:id corrupto
      'dictamen:D286N26': payloadConDoc('D286N26'),  // SOURCE:dictamen:id sano
    },
    {},
  );

  const result = await getDictamenSourceStrict(env, 'D286N26');

  // Debe saltar el probe corrupto y resolver desde dictamen:id
  assert.strictEqual(result.resolution.namespace, 'DICTAMENES_SOURCE');
  assert.strictEqual(result.resolution.key, 'dictamen:D286N26');
  assert.strictEqual(result.resolution.has_documento_completo, true);
});

test('payload JSON array (no objeto): continúa al siguiente probe', async () => {
  const env = mockEnv(
    {
      'D286N26': '["item1", "item2"]',
      'dictamen:D286N26': payloadConDoc('D286N26'),
    },
    {},
  );

  const result = await getDictamenSourceStrict(env, 'D286N26');
  assert.strictEqual(result.resolution.key, 'dictamen:D286N26');
  assert.strictEqual(result.resolution.has_documento_completo, true);
});

// ─── Tests: sin documento_completo ─────────────────────────────────────────

test('payload sin documento_completo: reporta has_documento_completo=false', async () => {
  const env = mockEnv(
    { 'Y00001': payloadSinDoc('Y00001') },
    {},
  );

  const result = await getDictamenSourceStrict(env, 'Y00001');

  assert.strictEqual(result.resolution.has_documento_completo, false);
  assert.strictEqual(result.resolution.documento_completo_bytes, 0);
  assert.ok(result.resolution.payload_bytes > 0);
});

// ─── Tests: extracción desde distintas envolturas ──────────────────────────

test('documento_completo extraído desde raw_data anidado', async () => {
  const payload = JSON.stringify({
    raw_data: {
      documento_completo: 'Dictamen desde raw_data.',
    },
  });
  const env = mockEnv({ 'R00001': payload }, {});

  const result = await getDictamenSourceStrict(env, 'R00001');
  assert.strictEqual(result.resolution.has_documento_completo, true);
});

test('documento_completo extraído desde source anidado', async () => {
  const payload = JSON.stringify({
    source: {
      documento_completo: 'Dictamen desde source.',
    },
  });
  const env = mockEnv({ 'S00001': payload }, {});

  const result = await getDictamenSourceStrict(env, 'S00001');
  assert.strictEqual(result.resolution.has_documento_completo, true);
});

test('documento_completo extraído desde nivel raíz', async () => {
  const payload = JSON.stringify({
    documento_completo: 'Dictamen en raíz.',
    materia: 'Test',
  });
  const env = mockEnv({ 'T00001': payload }, {});

  const result = await getDictamenSourceStrict(env, 'T00001');
  assert.strictEqual(result.resolution.has_documento_completo, true);
});
