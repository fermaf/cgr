// cgr-platform/tests/kvVerify.test.mjs
// Test de verificación post-write KV: importa putWithVerifyNoCrypto real desde TS.
// Escenarios: éxito, fallo put, null post-get, JSON inválido, doc_completo presente/ausente,
// delete legacy seguro.
//
// Uso: npx tsx --test tests/kvVerify.test.mjs
//      (requiere tsx para resolver imports .ts)
//
// Parche B3 (2026-05-22): test 13 actualizado para trim().length > 0;
// nuevo test whitespace.

import * as assert from 'node:assert/strict';
import { test, describe } from 'node:test';

// Importamos la función real desde TypeScript (tsx loader en runtime).
import { putWithVerifyNoCrypto } from '../src/storage/kvVerify.ts';

// ─── Mocks ────────────────────────────────────────────────────────────────

/** Crea un mock de KVNamespace con comportamiento controlable. */
function mockKV(config = {}) {
  const {
    putShouldThrow = false,
    putError = new Error('KV put simulated failure'),
    getShouldReturnNull = false,
    getShouldThrow = false,
    getError = new Error('KV get simulated failure'),
    storedValue = null,
    deleteShouldThrow = false,
    deleteError = new Error('KV delete simulated failure'),
  } = config;

  let lastPutKey = null;
  let lastPutValue = null;
  let lastDeleteKey = null;
  let internalStore = storedValue;

  return {
    lastPutKey: () => lastPutKey,
    lastPutValue: () => lastPutValue,
    lastDeleteKey: () => lastDeleteKey,

    async put(key, value) {
      if (putShouldThrow) throw putError;
      lastPutKey = key;
      lastPutValue = value;
      if (!getShouldReturnNull) {
        internalStore = value;
      } else {
        internalStore = null;
      }
    },

    async get(key) {
      if (getShouldThrow) throw getError;
      return internalStore;
    },

    async delete(key) {
      if (deleteShouldThrow) throw deleteError;
      lastDeleteKey = key;
    },

    async list() {
      return { keys: [], list_complete: true };
    },
  };
}

/** Crea un payload JSON válido con documento_completo. */
function validPayload(id = 'D286N26') {
  return JSON.stringify({
    _source: {
      doc_id: id,
      documento_completo: 'Texto íntegro del dictamen de prueba.',
      fecha_documento: '2026-05-18',
      materia: 'Prueba de verificación KV',
      criterio: 'Test',
    },
  });
}

/** Crea un payload JSON válido SIN documento_completo. */
function payloadSinDocCompleto(id = 'D286N26') {
  return JSON.stringify({
    _source: {
      doc_id: id,
      fecha_documento: '2026-05-18',
      materia: 'Prueba sin documento_completo',
    },
  });
}

/** Payload que no es JSON válido. */
const INVALID_JSON_PAYLOAD = 'esto no es JSON {{{';

// ─── Tests usando putWithVerifyNoCrypto real ───────────────────────────────

test('Escenario 1: put exitoso + get OK + JSON válido + doc_completo presente', async () => {
  const kv = mockKV();
  const payload = validPayload();

  const result = await putWithVerifyNoCrypto(kv, 'D286N26', payload, {
    expectedDocumentoCompleto: true,
  });

  assert.strictEqual(result.ok, true);
  assert.ok(result.payload_bytes > 0);
  assert.strictEqual(result.documento_completo_present, true);
  assert.ok(result.documento_completo_bytes > 0);
  assert.strictEqual(result.error, undefined);
});

test('Escenario 1b: put exitoso + get OK + JSON válido SIN doc_completo cuando no se exige', async () => {
  const kv = mockKV();
  const payload = payloadSinDocCompleto();

  const result = await putWithVerifyNoCrypto(kv, 'D286N26', payload);

  assert.strictEqual(result.ok, true);
  assert.ok(result.payload_bytes > 0);
  assert.strictEqual(result.documento_completo_present, false);
});

test('Escenario 1c: put exitoso + get OK + SIN doc_completo cuando SÍ se exige → falla', async () => {
  const kv = mockKV();
  const payload = payloadSinDocCompleto();

  const result = await putWithVerifyNoCrypto(kv, 'D286N26', payload, {
    expectedDocumentoCompleto: true,
  });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.documento_completo_present, false);
  assert.ok(result.error.includes('documento_completo expected'));
});

test('Escenario 2: put falla (KV lanza error)', async () => {
  const kv = mockKV({
    putShouldThrow: true,
    putError: new Error('429 Too Many Requests'),
  });
  const payload = validPayload();

  const result = await putWithVerifyNoCrypto(kv, 'D286N26', payload);

  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('KV put failed'));
  assert.ok(result.error.includes('429'));
});

test('Escenario 3: put exitoso pero get post-write retorna null', async () => {
  const kv = mockKV({ getShouldReturnNull: true });
  const payload = validPayload();

  const result = await putWithVerifyNoCrypto(kv, 'D286N26', payload);

  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('returned null'));
});

test('Escenario 3b: put exitoso pero get post-write lanza error', async () => {
  const kv = mockKV({
    getShouldThrow: true,
    getError: new Error('Network error'),
  });
  const payload = validPayload();

  const result = await putWithVerifyNoCrypto(kv, 'D286N26', payload);

  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('KV get post-write failed'));
});

test('Escenario 3c: put exitoso pero valor no es JSON válido', async () => {
  // El mock guarda el valor que se le da; get devuelve lo mismo
  const kv = mockKV();
  // putWithVerifyNoCrypto usa putWithRetry que llama a kv.put(key, payload)
  // y luego kv.get(key). Como el mock guarda lo que se puso, get devolverá el INVALID_JSON
  // (a menos que el mock tenga storedValue configurado)

  // Para este test, el put guarda el payload inválido y get lo devuelve.
  // Usamos un mock que persiste el put.
  const result = await putWithVerifyNoCrypto(kv, 'D286N26', INVALID_JSON_PAYLOAD);

  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('not valid JSON'));
  assert.ok(result.payload_bytes > 0);
});

test('Escenario 4: delete legacy SÓLO ocurre tras verificación exitosa', async () => {
  const kv = mockKV();
  const payload = validPayload('000007N21');
  const legacyKey = 'dictamen:000007N21';
  const newKey = '000007N21';

  const result = await putWithVerifyNoCrypto(kv, newKey, payload);

  assert.strictEqual(result.ok, true);

  // Sólo si ok, borrar legacy
  if (result.ok) {
    await kv.delete(legacyKey);
    assert.strictEqual(kv.lastDeleteKey(), legacyKey);
  }
});

test('Escenario 4b: NO se borra llave legacy si verificación falla', async () => {
  const kv = mockKV({ getShouldReturnNull: true });
  const payload = validPayload('D286N26');

  const result = await putWithVerifyNoCrypto(kv, 'D286N26', payload);
  assert.strictEqual(result.ok, false);

  // Verificar que delete NUNCA fue llamado
  assert.strictEqual(kv.lastDeleteKey(), null);
});

test('Escenario 4c: delete legacy falla pero no revierte el éxito de la verificación', async () => {
  const kv = mockKV({ deleteShouldThrow: true });
  const payload = validPayload('D286N26');

  const result = await putWithVerifyNoCrypto(kv, 'D286N26', payload);
  assert.strictEqual(result.ok, true, 'La verificación debe ser exitosa aunque el delete falle después');

  let deleteFailed = false;
  try {
    await kv.delete('dictamen:D286N26');
  } catch {
    deleteFailed = true;
  }
  assert.strictEqual(deleteFailed, true, 'El delete debe haber fallado');
  assert.strictEqual(result.ok, true, 'La verificación OK no se ve afectada por un delete fallido');
});

// ─── Tests adicionales: edge cases con import real ─────────────────────────

test('Edge: payload con documento_completo en source (no _source)', async () => {
  const kv = mockKV();
  const payload = JSON.stringify({
    source: {
      documento_completo: 'Dictamen desde source.',
      materia: 'Test',
    },
  });

  const result = await putWithVerifyNoCrypto(kv, 'S00001', payload, {
    expectedDocumentoCompleto: true,
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.documento_completo_present, true);
});

test('Edge: payload con documento_completo en raw_data', async () => {
  const kv = mockKV();
  const payload = JSON.stringify({
    raw_data: {
      documento_completo: 'Dictamen desde raw_data.',
    },
  });

  const result = await putWithVerifyNoCrypto(kv, 'R00001', payload);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.documento_completo_present, true);
});

test('Edge: documento_completo vacío (string "") no cuenta como presente', async () => {
  const kv = mockKV();
  const payload = JSON.stringify({
    _source: {
      documento_completo: '',
      materia: 'Test',
    },
  });

  const result = await putWithVerifyNoCrypto(kv, 'E00001', payload);

  assert.strictEqual(result.ok, true);
  // B2+B3: ahora usa trim().length > 0 — string vacío NO cuenta como presente.
  assert.strictEqual(result.documento_completo_present, false);
  assert.strictEqual(result.documento_completo_bytes, undefined);
});

test('Edge: documento_completo solo whitespace no cuenta como presente', async () => {
  const kv = mockKV();
  const payload = JSON.stringify({
    _source: {
      documento_completo: '   \n\t  ',
      materia: 'Test',
    },
  });

  const result = await putWithVerifyNoCrypto(kv, 'W00001', payload);

  assert.strictEqual(result.ok, true);
  // B2: trim().length > 0 — whitespace puro NO cuenta como presente.
  assert.strictEqual(result.documento_completo_present, false);
  assert.strictEqual(result.documento_completo_bytes, undefined);
});

test('Edge: put guarda correctamente y get devuelve el valor exacto', async () => {
  const kv = mockKV();
  const payload = validPayload('EXACT01');
  const key = 'EXACT01';

  const result = await putWithVerifyNoCrypto(kv, key, payload);

  assert.strictEqual(result.ok, true);
  // Verificar que el mock registró el put correcto
  assert.strictEqual(kv.lastPutKey(), key);
  assert.strictEqual(kv.lastPutValue(), payload);
});
