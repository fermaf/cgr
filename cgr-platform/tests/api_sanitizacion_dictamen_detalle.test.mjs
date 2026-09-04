import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

// ─── FUNCIÓN DE SANITIZACIÓN (réplica exacta del código en index.ts) ──

/**
 * Sanitiza el objeto raw eliminando documento_completo de todas las
 * ubicaciones posibles: raíz, _source, source, raw_data.
 * Usa JSON.parse(JSON.stringify(...)) para deep clone.
 */
function sanitizeRaw(raw) {
  const safeRaw = JSON.parse(JSON.stringify(raw));
  if (safeRaw._source && typeof safeRaw._source === 'object' && safeRaw._source.documento_completo !== undefined) {
    delete safeRaw._source.documento_completo;
  }
  if (safeRaw.source && typeof safeRaw.source === 'object' && safeRaw.source.documento_completo !== undefined) {
    delete safeRaw.source.documento_completo;
  }
  if (safeRaw.raw_data && typeof safeRaw.raw_data === 'object' && safeRaw.raw_data.documento_completo !== undefined) {
    delete safeRaw.raw_data.documento_completo;
  }
  // Extensión P1 (2026-09-03): documento_completo_raw — misma clase de dato.
  if (safeRaw.documento_completo_raw !== undefined) {
    delete safeRaw.documento_completo_raw;
  }
  if (safeRaw._source && typeof safeRaw._source === 'object' && safeRaw._source.documento_completo_raw !== undefined) {
    delete safeRaw._source.documento_completo_raw;
  }
  if (safeRaw.source && typeof safeRaw.source === 'object' && safeRaw.source.documento_completo_raw !== undefined) {
    delete safeRaw.source.documento_completo_raw;
  }
  if (safeRaw.raw_data && typeof safeRaw.raw_data === 'object' && safeRaw.raw_data.documento_completo_raw !== undefined) {
    delete safeRaw.raw_data.documento_completo_raw;
  }
  if (safeRaw.documento_completo !== undefined) {
    delete safeRaw.documento_completo;
  }
  return safeRaw;
}

/**
 * Busca recursivamente la presencia de la clave 'documento_completo'
 * en cualquier nivel del objeto. Retorna un array de paths donde aparece.
 */
function findDocumentoCompletoPaths(obj, path = '') {
  const found = [];
  if (obj === null || obj === undefined) return found;
  if (typeof obj !== 'object') return found;

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (key === 'documento_completo') {
      found.push(currentPath);
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      found.push(...findDocumentoCompletoPaths(value, currentPath));
    }
  }
  return found;
}

// ─── TEST 1: Sanitización — raíz ─────────────────────────────────────

test('sanitizeRaw: elimina documento_completo de la raíz', () => {
  const raw = {
    id: 'test-001',
    documento_completo: 'Texto íntegro del dictamen que NO debe exponerse',
    metadata: { titulo: 'Dictamen X' }
  };

  const result = sanitizeRaw(raw);

  assert.equal(result.documento_completo, undefined);
  assert.equal(result.id, 'test-001');
  assert.equal(result.metadata.titulo, 'Dictamen X');
});

// ─── TEST 2: Sanitización — _source.documento_completo ────────────────

test('sanitizeRaw: elimina documento_completo de _source', () => {
  const raw = {
    id: 'test-002',
    _source: {
      url: 'https://www.contraloria.cl/...',
      documento_completo: 'Texto desde _source'
    }
  };

  const result = sanitizeRaw(raw);

  assert.equal(result._source.documento_completo, undefined);
  assert.equal(result._source.url, 'https://www.contraloria.cl/...');
  assert.equal(result.id, 'test-002');
});

// ─── TEST 3: Sanitización — source.documento_completo ─────────────────

test('sanitizeRaw: elimina documento_completo de source', () => {
  const raw = {
    id: 'test-003',
    source: {
      fetched_at: '2026-01-01',
      documento_completo: 'Texto desde source'
    }
  };

  const result = sanitizeRaw(raw);

  assert.equal(result.source.documento_completo, undefined);
  assert.equal(result.source.fetched_at, '2026-01-01');
  assert.equal(result.id, 'test-003');
});

// ─── TEST 4: Sanitización — raw_data.documento_completo ───────────────

test('sanitizeRaw: elimina documento_completo de raw_data', () => {
  const raw = {
    id: 'test-004',
    raw_data: {
      parser_version: '2.0',
      documento_completo: 'Texto desde raw_data'
    }
  };

  const result = sanitizeRaw(raw);

  assert.equal(result.raw_data.documento_completo, undefined);
  assert.equal(result.raw_data.parser_version, '2.0');
  assert.equal(result.id, 'test-004');
});

// ─── TEST 5: Sanitización — múltiples ubicaciones simultáneas ─────────

test('sanitizeRaw: elimina documento_completo de todas las ubicaciones simultáneamente', () => {
  const raw = {
    id: 'test-005',
    documento_completo: 'Raíz',
    _source: { documento_completo: 'Desde _source', url: 'http://...' },
    source: { documento_completo: 'Desde source', fecha: '2026-01-01' },
    raw_data: { documento_completo: 'Desde raw_data', version: '1.0' },
    metadata: { titulo: 'Dictamen Y' }
  };

  const result = sanitizeRaw(raw);
  const paths = findDocumentoCompletoPaths(result);

  assert.equal(paths.length, 0, `documento_completo encontrado en: ${paths.join(', ')}`);
  assert.equal(result.id, 'test-005');
  assert.equal(result.metadata.titulo, 'Dictamen Y');
  assert.equal(result._source.url, 'http://...');
  assert.equal(result.source.fecha, '2026-01-01');
  assert.equal(result.raw_data.version, '1.0');
});

// ─── TEST 6: Sanitización — sin documento_completo (no-op) ────────────

test('sanitizeRaw: no modifica objetos sin documento_completo', () => {
  const raw = {
    id: 'test-006',
    metadata: { titulo: 'Dictamen Z', fecha: '2026-01-01' },
    _source: { url: 'http://...', fetched_at: '2026-01-01' }
  };

  const result = sanitizeRaw(raw);

  assert.deepEqual(result, raw);
});

// ─── TEST 7: Sanitización — objeto vacío ─────────────────────────────

test('sanitizeRaw: maneja objeto vacío sin errores', () => {
  const result = sanitizeRaw({});
  assert.deepEqual(result, {});
});

// ─── TEST 8: Sanitización — null/undefined seguro ─────────────────────

test('sanitizeRaw: maneja _source null sin errores', () => {
  const raw = {
    id: 'test-008',
    _source: null,
    source: undefined
  };

  const result = sanitizeRaw(raw);
  assert.equal(result.id, 'test-008');
  assert.equal(result._source, null);
});

// ─── TEST 9: Deep clone — no muta el original ────────────────────────

test('sanitizeRaw: no muta el objeto original (deep clone)', () => {
  const raw = {
    id: 'test-009',
    documento_completo: 'Texto sensible',
    _source: { documento_completo: 'Texto sensible anidado', url: 'http://...' }
  };

  const result = sanitizeRaw(raw);

  // El original debe mantener documento_completo
  assert.equal(raw.documento_completo, 'Texto sensible');
  assert.equal(raw._source.documento_completo, 'Texto sensible anidado');

  // El resultado no debe tener documento_completo
  assert.equal(result.documento_completo, undefined);
  assert.equal(result._source.documento_completo, undefined);
  assert.equal(result._source.url, 'http://...');
});

// ─── TEST 10: Inspección — raw: raw ya no existe en el handler ───────

test('index.ts: raw: raw NO aparece en GET /api/v1/dictamenes/:id', async () => {
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');

  // Buscar la sección del handler (desde app.get hasta el cierre)
  const handlerStart = source.indexOf("app.get('/api/v1/dictamenes/:id'");
  assert.ok(handlerStart !== -1, 'Handler del endpoint encontrado');

  // Extraer ~400 líneas del handler para verificar
  const handlerSection = source.substring(handlerStart, handlerStart + 8000);

  // raw: raw no debe aparecer en ninguna parte
  assert.ok(
    !handlerSection.includes('raw: raw'),
    'raw: raw encontrado en el handler — la sanitización no se aplicó correctamente'
  );
});

// ─── TEST 11: Inspección — raw: safeRaw SÍ existe ────────────────────

test('index.ts: raw: safeRaw SÍ aparece en GET /api/v1/dictamenes/:id', async () => {
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');

  const handlerStart = source.indexOf("app.get('/api/v1/dictamenes/:id'");
  const handlerSection = source.substring(handlerStart, handlerStart + 8000);

  assert.ok(
    handlerSection.includes('raw: safeRaw'),
    'raw: safeRaw NO encontrado en el handler — la sanitización no se aplicó'
  );
});

// ─── TEST 12: Inspección — lógica de sanitización presente ────────────

test('index.ts: sanitización P1 con JSON.parse(JSON.stringify(raw)) presente', async () => {
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');

  const handlerStart = source.indexOf("app.get('/api/v1/dictamenes/:id'");
  const handlerSection = source.substring(handlerStart, handlerStart + 8000);

  // Verificar que existe el comentario y la lógica
  assert.ok(
    handlerSection.includes('P1: sanitizar documento_completo'),
    'Comentario P1 no encontrado'
  );
  assert.ok(
    handlerSection.includes('JSON.parse(JSON.stringify(raw))'),
    'Deep clone via JSON no encontrado'
  );
  assert.ok(
    handlerSection.includes('_source') && handlerSection.includes('documento_completo'),
    'Sanitización de _source.documento_completo no encontrada'
  );
  assert.ok(
    handlerSection.includes('source') && handlerSection.includes('documento_completo'),
    'Sanitización de source.documento_completo no encontrada'
  );
  assert.ok(
    handlerSection.includes('raw_data') && handlerSection.includes('documento_completo'),
    'Sanitización de raw_data.documento_completo no encontrada'
  );
});

// ─── EJECUCIÓN ───────────────────────────────────────────────────────
// node --test tests/api_sanitizacion_dictamen_detalle.test.mjs

// ─── TESTS 13-15: Extensión P1 — documento_completo_raw ──────────────

test('sanitizeRaw: elimina documento_completo_raw de la raíz (extensión P1)', () => {
  const raw = {
    doc_id: '020445N19',
    documento_completo_raw: '<html>HTML íntegro del dictamen que NO debe exponerse</html>',
  };
  const result = sanitizeRaw(raw);
  assert.equal(result.documento_completo_raw, undefined);
  assert.equal(result.doc_id, '020445N19');
});

test('sanitizeRaw: elimina documento_completo_raw de _source y raw_data (extensión P1)', () => {
  const raw = {
    _source: { documento_completo_raw: '<p>Desde _source</p>', url: 'http://...' },
    raw_data: { documento_completo_raw: '<p>Desde raw_data</p>' },
  };
  const result = sanitizeRaw(raw);
  assert.equal(result._source.documento_completo_raw, undefined);
  assert.equal(result._source.url, 'http://...');
  assert.equal(result.raw_data.documento_completo_raw, undefined);
});

test('index.ts: sanitización de documento_completo_raw presente en el handler (extensión P1)', async () => {
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  const handlerStart = source.indexOf("app.get('/api/v1/dictamenes/:id'");
  const handlerSection = source.substring(handlerStart, handlerStart + 8000);
  assert.ok(
    handlerSection.includes('documento_completo_raw'),
    'Sanitización de documento_completo_raw no encontrada en el handler'
  );
});
