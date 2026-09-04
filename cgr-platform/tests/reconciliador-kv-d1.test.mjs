// cgr-platform/tests/reconciliador-kv-d1.test.mjs
// Tests unitarios para reconciliador KV↔D1.
// Importa funciones reales desde src/lib/reconciliadorKV.mjs.
// Verifica: parseKVPayload, reconcileDictamen, aggregateMetrics,
// buildReconciliationReport, sanitizeMetrics, formatos, seguridad, edge cases.
//
// Uso: node --test tests/reconciliador-kv-d1.test.mjs

import * as assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import {
  parseKVPayload,
  reconcileDictamen,
  aggregateMetrics,
  buildReconciliationReport,
  buildEmptyReport,
  sanitizeMetrics,
  formatMarkdown,
  formatCSV,
  formatJSON,
} from '../src/lib/reconciliadorKV.mjs';

// ─── Helpers de datos de prueba ────────────────────────────────────────────

function metrics(overrides = {}) {
  return {
    namespace: 'SOURCE',
    keyFormat: 'id',
    present: true,
    jsonParseable: true,
    payloadBytes: 20272,
    hasDocumentoCompleto: true,
    documentoCompletoBytes: 6890,
    error: null,
    ...overrides,
  };
}

function absentMetrics(namespace = 'SOURCE', keyFormat = 'id') {
  return {
    namespace,
    keyFormat,
    present: false,
    jsonParseable: false,
    payloadBytes: 0,
    hasDocumentoCompleto: false,
    documentoCompletoBytes: 0,
    error: 'KV key not found',
  };
}

// ─── parseKVPayload ────────────────────────────────────────────────────────

describe('parseKVPayload', () => {
  test('payload válido con documento_completo en _source', () => {
    const payload = JSON.stringify({
      _source: {
        doc_id: 'D286N26',
        documento_completo: 'Texto íntegro del dictamen de prueba.',
        materia: 'Test',
      },
    });
    const result = parseKVPayload(payload, 'SOURCE', 'id');

    assert.strictEqual(result.present, true);
    assert.strictEqual(result.jsonParseable, true);
    assert.strictEqual(result.hasDocumentoCompleto, true);
    assert.ok(result.payloadBytes > 0);
    assert.ok(result.documentoCompletoBytes > 0);
    assert.strictEqual(result.error, null);
  });

  test('payload válido sin documento_completo', () => {
    const payload = JSON.stringify({ _source: { materia: 'Test' } });
    const result = parseKVPayload(payload, 'SOURCE', 'id');

    assert.strictEqual(result.jsonParseable, true);
    assert.strictEqual(result.hasDocumentoCompleto, false);
    assert.strictEqual(result.documentoCompletoBytes, 0);
  });

  test('documento_completo en nivel raíz', () => {
    const payload = JSON.stringify({ documento_completo: 'Dictamen en raíz.' });
    const result = parseKVPayload(payload, 'SOURCE', 'id');

    assert.strictEqual(result.hasDocumentoCompleto, true);
  });

  test('documento_completo en clave source', () => {
    const payload = JSON.stringify({ source: { documento_completo: 'Dictamen en source.' } });
    const result = parseKVPayload(payload, 'SOURCE', 'id');

    assert.strictEqual(result.hasDocumentoCompleto, true);
  });

  test('documento_completo en raw_data', () => {
    const payload = JSON.stringify({ raw_data: { documento_completo: 'Dictamen en raw_data.' } });
    const result = parseKVPayload(payload, 'SOURCE', 'id');

    assert.strictEqual(result.hasDocumentoCompleto, true);
  });

  test('payload null (llave no encontrada)', () => {
    const result = parseKVPayload(null, 'SOURCE', 'id');

    assert.strictEqual(result.present, false);
    assert.strictEqual(result.jsonParseable, false);
    assert.strictEqual(result.payloadBytes, 0);
    assert.strictEqual(result.error, 'KV key not found');
  });

  test('payload que no es JSON', () => {
    const result = parseKVPayload('esto no es JSON {{{', 'SOURCE', 'id');

    assert.strictEqual(result.present, true);
    assert.strictEqual(result.jsonParseable, false);
    assert.ok(result.payloadBytes > 0);
    assert.ok(result.error.includes('no es JSON'));
  });

  test('payload JSON array (no objeto)', () => {
    const result = parseKVPayload('["item1", "item2"]', 'SOURCE', 'id');

    assert.strictEqual(result.jsonParseable, false);
    assert.ok(result.error.includes('no es JSON'));
  });

  test('documento_completo vacío no cuenta como presente', () => {
    const payload = JSON.stringify({ _source: { documento_completo: '' } });
    const result = parseKVPayload(payload, 'SOURCE', 'id');

    assert.strictEqual(result.hasDocumentoCompleto, false);
  });

  test('documento_completo whitespace no cuenta como presente', () => {
    const payload = JSON.stringify({ _source: { documento_completo: '   \n\t  ' } });
    const result = parseKVPayload(payload, 'SOURCE', 'id');

    assert.strictEqual(result.hasDocumentoCompleto, false);
  });

  test('documento_completo con Unicode', () => {
    const texto = 'Dictamen con caracteres especiales: áéíóúñ 日本語 🎉';
    const payload = JSON.stringify({ _source: { documento_completo: texto } });
    const result = parseKVPayload(payload, 'SOURCE', 'id');

    assert.strictEqual(result.hasDocumentoCompleto, true);
    assert.strictEqual(result.documentoCompletoBytes, new TextEncoder().encode(texto).length);
  });
});

// ─── reconcileDictamen ─────────────────────────────────────────────────────

describe('reconcileDictamen', () => {
  test('dictamen completo OK (SOURCE + PASO, doc_completo presente)', () => {
    const sourceId = metrics();
    const sourceDictamenId = absentMetrics('SOURCE', 'dictamen:id');
    const pasoId = metrics({ namespace: 'PASO', payloadBytes: 28163, documentoCompletoBytes: 7215 });

    const d = reconcileDictamen('D286N26', 1, 1, sourceId, sourceDictamenId, pasoId);

    assert.strictEqual(d.dictamenId, 'D286N26');
    assert.strictEqual(d.d1EnSource, 1);
    assert.strictEqual(d.d1EnPaso, 1);
    assert.strictEqual(d.sourceId.present, true);
    assert.strictEqual(d.sourceDictamenId.present, false);
    assert.strictEqual(d.pasoId.present, true);
    assert.strictEqual(d.badJson, false);
    assert.strictEqual(d.missingDocumentoCompleto, false);
    assert.strictEqual(d.enSourceMismatch, false);
  });

  test('en_source_mismatch: D1=0, KV=presente', () => {
    const sourceId = metrics();
    const d = reconcileDictamen('E195929N25', 0, 1,
      sourceId,
      absentMetrics('SOURCE', 'dictamen:id'),
      metrics({ namespace: 'PASO' }),
    );

    assert.strictEqual(d.enSourceMismatch, true);
  });

  test('missing_documento_completo: SOURCE:id sin doc', () => {
    const sourceId = metrics({ hasDocumentoCompleto: false, documentoCompletoBytes: 0 });
    const d = reconcileDictamen('X00001', 1, 1,
      sourceId,
      absentMetrics('SOURCE', 'dictamen:id'),
      absentMetrics('PASO'),
    );

    assert.strictEqual(d.missingDocumentoCompleto, true);
    assert.strictEqual(d.sourceId.hasDocumentoCompleto, false);
  });

  test('bad_json: alguna llave no es JSON', () => {
    const sourceId = metrics({ jsonParseable: false, error: 'payload no es JSON válido' });
    const d = reconcileDictamen('E00001', 1, 1,
      sourceId,
      absentMetrics('SOURCE', 'dictamen:id'),
      metrics({ namespace: 'PASO' }),
    );

    assert.strictEqual(d.badJson, true);
  });

  test('todas las llaves ausentes', () => {
    const d = reconcileDictamen('Z99999', 0, 0,
      absentMetrics('SOURCE', 'id'),
      absentMetrics('SOURCE', 'dictamen:id'),
      absentMetrics('PASO', 'id'),
    );

    assert.strictEqual(d.sourceId.present, false);
    assert.strictEqual(d.sourceDictamenId.present, false);
    assert.strictEqual(d.pasoId.present, false);
    assert.strictEqual(d.badJson, false);
    assert.strictEqual(d.missingDocumentoCompleto, false);
    assert.strictEqual(d.enSourceMismatch, false);
  });
});

// ─── aggregateMetrics ──────────────────────────────────────────────────────

describe('aggregateMetrics', () => {
  test('agregación correcta de múltiples dictámenes', () => {
    const detalles = [
      reconcileDictamen('A001', 1, 1, 
        metrics({ payloadBytes: 100, documentoCompletoBytes: 50 }),
        absentMetrics('SOURCE', 'dictamen:id'),
        metrics({ namespace: 'PASO', payloadBytes: 200 })),
      reconcileDictamen('A002', 1, 1,
        metrics({ payloadBytes: 200, documentoCompletoBytes: 80 }),
        absentMetrics('SOURCE', 'dictamen:id'),
        metrics({ namespace: 'PASO', payloadBytes: 250 })),
      reconcileDictamen('A003', 0, 0,
        metrics({ payloadBytes: 300, hasDocumentoCompleto: false, documentoCompletoBytes: 0 }),
        absentMetrics('SOURCE', 'dictamen:id'),
        absentMetrics('PASO')),
    ];

    const agg = aggregateMetrics(detalles);

    assert.strictEqual(agg.sourceIdPresent, 3);
    assert.strictEqual(agg.totalSourcePayloadBytes, 600); // 100+200+300
    assert.strictEqual(agg.avgSourcePayloadBytes, 200);
    assert.strictEqual(agg.missingDocumentoCompleto, 1);
    assert.strictEqual(agg.totalDocCompletoBytes, 130); // 50+80 only
    assert.strictEqual(agg.avgDocCompletoBytes, 65); // (50+80)/2
  });
});

// ─── buildReconciliationReport ─────────────────────────────────────────────

describe('buildReconciliationReport', () => {
  test('declaraciones de seguridad correctas', () => {
    const detalles = [
      reconcileDictamen('D286N26', 1, 1, metrics(), absentMetrics('SOURCE', 'dictamen:id'), metrics({ namespace: 'PASO' })),
    ];
    const report = buildReconciliationReport(detalles, 'production', {
      mode: 'sample', maxDocs: 20, totalCorpus: 86714,
    });

    assert.strictEqual(report.seguridad.rowsWritten, 0);
    assert.strictEqual(report.seguridad.cloudflareMutations, false);
    assert.strictEqual(report.seguridad.anonimizacionVerificada, true);
    assert.strictEqual(report.seguridad.payloadsImpresos, 0);
    assert.ok(report.seguridad.capasUtilizadas.includes('D1_analisis'));
    assert.ok(report.seguridad.capasUtilizadas.includes('KV_API'));
    assert.strictEqual(report.seguridad.madurez, 'prototipo_revisable');
  });

  test('batch vacío: métricas en 0', () => {
    const report = buildEmptyReport('production', 20, true, 0, 0);

    assert.strictEqual(report.totalDictamenes, 0);
    assert.strictEqual(report.aggregate.sourceIdPresent, 0);
    assert.strictEqual(report.seguridad.rowsWritten, 0);
  });
});

// ─── sanitizeMetrics ───────────────────────────────────────────────────────

describe('sanitizeMetrics', () => {
  test('no incluye campos de payload crudo', () => {
    const m = metrics({ error: 'un error muy largo ' + 'x'.repeat(200) });
    const safe = sanitizeMetrics(m);

    const keys = Object.keys(safe);
    const forbidden = ['payload', 'raw', 'content', 'value', 'documentoCompleto'];
    for (const key of keys) {
      assert.strictEqual(forbidden.includes(key), false, `Campo no permitido: ${key}`);
    }
  });

  test('error se trunca a 100 caracteres', () => {
    const longError = 'ERROR: ' + 'x'.repeat(300);
    const m = metrics({ error: longError });
    const safe = sanitizeMetrics(m);

    assert.ok(safe.error.length <= 100);
  });

  test('no incluye documento_completo como texto', () => {
    const m = metrics();
    const safe = sanitizeMetrics(m);

    assert.strictEqual(typeof safe.hasDocumentoCompleto, 'boolean');
    assert.strictEqual(typeof safe.documentoCompletoBytes, 'number');
    assert.strictEqual('documentoCompleto' in safe, false);
  });
});

// ─── formatMarkdown ────────────────────────────────────────────────────────

describe('formatMarkdown', () => {
  test('contiene secciones esperadas', () => {
    const detalles = [
      reconcileDictamen('D286N26', 1, 1, metrics(), absentMetrics('SOURCE', 'dictamen:id'), metrics({ namespace: 'PASO' })),
    ];
    const report = buildReconciliationReport(detalles, 'production', {
      mode: 'sample', maxDocs: 1, totalCorpus: 86714,
    });

    const md = formatMarkdown(report);

    assert.ok(md.includes('# Reconciliación KV ↔ D1'));
    assert.ok(md.includes('## 1. Métricas agregadas'));
    assert.ok(md.includes('## 2. Declaraciones de seguridad'));
    assert.ok(md.includes('## 3. Detalle por dictamen'));
    assert.ok(md.includes('D286N26'));
    assert.ok(md.includes('rows_written'));
    assert.ok(md.includes('anonimizacion_verificada'));
  });

  test('no contiene payloads', () => {
    const detalles = [
      reconcileDictamen('D286N26', 1, 1, metrics(), absentMetrics('SOURCE', 'dictamen:id'), metrics({ namespace: 'PASO' })),
    ];
    const report = buildReconciliationReport(detalles, 'production', {
      mode: 'sample', maxDocs: 1, totalCorpus: 86714,
    });

    const md = formatMarkdown(report);
    assert.strictEqual(md.includes('Texto íntegro del dictamen'), false);
  });
});

// ─── formatCSV ─────────────────────────────────────────────────────────────

describe('formatCSV', () => {
  test('estructura correcta y sin contenido', () => {
    const detalles = [
      reconcileDictamen('D286N26', 1, 1, 
        metrics({ payloadBytes: 20272, documentoCompletoBytes: 6890 }),
        absentMetrics('SOURCE', 'dictamen:id'),
        metrics({ namespace: 'PASO', payloadBytes: 28163 })),
    ];
    const report = buildReconciliationReport(detalles, 'production', {
      mode: 'sequential', maxDocs: 1, totalCorpus: 86714,
    });
    const csv = formatCSV(report);

    assert.ok(csv.startsWith('dictamen_id,d1_en_source,'));
    assert.ok(csv.includes('D286N26'));
    // No debe contener contenido real de dictamen (payload leak)
    assert.strictEqual(csv.includes('Texto íntegro del dictamen'), false);
    assert.strictEqual(csv.includes('materia'), false);
  });
});

// ─── formatJSON ────────────────────────────────────────────────────────────

describe('formatJSON', () => {
  test('no incluye datos crudos', () => {
    const detalles = [
      reconcileDictamen('D286N26', 1, 1, metrics(), absentMetrics('SOURCE', 'dictamen:id'), metrics({ namespace: 'PASO' })),
    ];
    const report = buildReconciliationReport(detalles, 'production', {
      mode: 'sample', maxDocs: 1, totalCorpus: 86714,
    });
    const json = formatJSON(report);

    assert.strictEqual(json.includes('Texto íntegro'), false);

    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.seguridad.rowsWritten, 0);
    assert.strictEqual(parsed.seguridad.anonimizacionVerificada, true);
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  test('dictamen con sólo PASO (sin SOURCE)', () => {
    const d = reconcileDictamen('E00002', 0, 1,
      absentMetrics('SOURCE', 'id'),
      absentMetrics('SOURCE', 'dictamen:id'),
      metrics({ namespace: 'PASO', payloadBytes: 15000 }),
    );

    assert.strictEqual(d.sourceId.present, false);
    assert.strictEqual(d.pasoId.present, true);
    assert.strictEqual(d.enSourceMismatch, false);
  });

  test('payload_bytes 0 cuando llave ausente', () => {
    const m = absentMetrics('SOURCE', 'id');
    assert.strictEqual(m.present, false);
    assert.strictEqual(m.payloadBytes, 0);
  });

  test('namespace y keyFormat se propagan correctamente', () => {
    const result = parseKVPayload(null, 'PASO', 'dictamen:id');
    assert.strictEqual(result.namespace, 'PASO');
    assert.strictEqual(result.keyFormat, 'dictamen:id');
  });
});
