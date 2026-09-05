import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { isVectorizationPaused, logPausaThrottled } from '../src/workflows/vectorizationBreaker.ts';

// ─── isVectorizationPaused ───────────────────────────────────────────

test('circuit breaker: sin variable => pausado (default seguro)', () => {
  assert.equal(isVectorizationPaused({}), true);
  assert.equal(isVectorizationPaused({ VECTORIZATION_PAUSED: '' }), true);
  assert.equal(isVectorizationPaused({ VECTORIZATION_PAUSED: '   ' }), true);
});

test('circuit breaker: valores afirmativos => pausado', () => {
  assert.equal(isVectorizationPaused({ VECTORIZATION_PAUSED: 'true' }), true);
  assert.equal(isVectorizationPaused({ VECTORIZATION_PAUSED: 'TRUE' }), true);
  assert.equal(isVectorizationPaused({ VECTORIZATION_PAUSED: '1' }), true);
  assert.equal(isVectorizationPaused({ VECTORIZATION_PAUSED: 'yes' }), true);
  assert.equal(isVectorizationPaused({ VECTORIZATION_PAUSED: ' True ' }), true);
});

test('circuit breaker: valores negativos => NO pausado (reanudar)', () => {
  assert.equal(isVectorizationPaused({ VECTORIZATION_PAUSED: 'false' }), false);
  assert.equal(isVectorizationPaused({ VECTORIZATION_PAUSED: 'FALSE' }), false);
  assert.equal(isVectorizationPaused({ VECTORIZATION_PAUSED: '0' }), false);
  assert.equal(isVectorizationPaused({ VECTORIZATION_PAUSED: 'no' }), false);
});

test('circuit breaker: valor arbitrario no reconocido => NO pausado (opt-in explícito para reanudar)', () => {
  // Cualquier otro valor (p.ej. "auto") se interpreta como NO pausado:
  // la pausa requiere afirmación explícita o ausencia de la variable.
  assert.equal(isVectorizationPaused({ VECTORIZATION_PAUSED: 'auto' }), false);
  assert.equal(isVectorizationPaused({ VECTORIZATION_PAUSED: 'off' }), false);
});

// ─── logPausaThrottled ───────────────────────────────────────────────

function buildDb({ existingRecent = false, failInsert = false } = {}) {
  const calls = [];
  const db = {
    prepare(query) {
      const isSelect = query.trimStart().startsWith('SELECT');
      const stmt = {
        async first() {
          calls.push({ kind: 'first', query });
          return existingRecent ? { id: 1 } : undefined;
        },
        bind(...values) {
          return {
            async run() {
              calls.push({ kind: 'run', query, values });
              if (failInsert) throw new Error('D1 unavailable');
              return { success: true };
            }
          };
        }
      };
      return stmt;
    }
  };
  return { db, calls };
}

test('logPausaThrottled: sin evento reciente => inserta 1 evento VECTORIZATION_PAUSED', async () => {
  const { db, calls } = buildDb({ existingRecent: false });
  await logPausaThrottled(db, 'inst-123');
  const runs = calls.filter((c) => c.kind === 'run');
  assert.equal(runs.length, 1);
  assert.match(runs[0].query, /INSERT INTO dictamen_events/);
  assert.match(runs[0].query, /'VECTORIZATION_PAUSED'/);
  const metadata = JSON.parse(runs[0].values[0]);
  assert.equal(metadata.instanceId, 'inst-123');
  assert.equal(metadata.motivo, 'circuit-breaker NVIDIA EOL 410');
});

test('logPausaThrottled: con evento en la última hora => NO inserta (throttle 1/hora)', async () => {
  const { db, calls } = buildDb({ existingRecent: true });
  await logPausaThrottled(db, 'inst-456');
  assert.equal(calls.filter((c) => c.kind === 'run').length, 0);
});

test('logPausaThrottled: fallo de D1 no propaga el error (early-exit nunca se bloquea)', async () => {
  const { db } = buildDb({ failInsert: true });
  await assert.doesNotReject(() => logPausaThrottled(db, 'inst-789'));
});

// ─── Integración del breaker en el workflow (fuente) ─────────────────

test('vectorizationWorkflow: el early-exit del breaker precede a cualquier checkout', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/workflows/vectorizationWorkflow.ts', import.meta.url), 'utf8');
  const posBreaker = source.indexOf('if (isVectorizationPaused(env))');
  const posCheckout = source.indexOf("step.do('fetch-vectorization-ids'");
  const posRelanzar = source.indexOf("'trigger-next-vectorization-batch'");
  assert.ok(posBreaker > -1, 'el workflow debe llamar a isVectorizationPaused');
  assert.ok(posCheckout > -1, 'el workflow debe tener el checkout original');
  assert.ok(posRelanzar > -1, 'el workflow debe conservar el relanzamiento original');
  assert.ok(
    posBreaker < posCheckout,
    'el early-exit del breaker debe ejecutarse ANTES del checkout de pendientes'
  );
  // El return del breaker debe salir antes del checkout: verificar que entre
  // el breaker y el checkout hay un return.
  const segmento = source.slice(posBreaker, posCheckout);
  assert.match(segmento, /return\s*\{/, 'el breaker debe retornar antes del checkout');
});

test('vectorizationWorkflow: ingest y enrichment no tocan el breaker (sin cambios)', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['ingestWorkflow.ts', 'enrichmentWorkflow.ts']) {
    const source = await readFile(new URL(`../src/workflows/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /VECTORIZATION_PAUSED|isVectorizationPaused/, `${file} no debe referenciar el breaker`);
  }
});
