import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

// ─── UTILIDADES DE MOCK ──────────────────────────────────────────────

function mockD1(rows = []) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() { return rows[0] ?? null; },
            async run() { return { success: true, results: rows, meta: {} }; },
            async all() { return { results: rows }; }
          };
        }
      };
    }
  };
}

function mockKV(entries = {}) {
  return {
    async get(key, opts = {}) {
      const val = entries[key];
      if (opts.type === 'json') return val ?? null;
      return val ?? null;
    },
    async put(key, value) { entries[key] = value; },
    async delete(key) { delete entries[key]; }
  };
}

function mockWorkflow() {
  const calls = [];
  return {
    calls,
    async create({ params }) {
      calls.push(params);
      return { id: `wf-${Date.now()}-${calls.length}` };
    }
  };
}

function mockFetch(responseFn) {
  return async (url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return responseFn(url, { ...init, body });
  };
}

// ─── TEST 1: wrangler.jsonc tiene workflows correctos post-update ───

test('wrangler.jsonc: todos los workflows esperados están declarados', async () => {
  const raw = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const config = JSON.parse(raw);
  const workflows = config.workflows.map(w => w.binding);

  const required = [
    'WORKFLOW',
    'ENRICHMENT_WORKFLOW',
    'VECTORIZATION_WORKFLOW',
    'KV_SYNC_WORKFLOW',
    'CANONICAL_RELATIONS_WORKFLOW',
    'DOCTRINAL_METADATA_WORKFLOW',
    'REGIMEN_BACKFILL_WORKFLOW'
  ];

  for (const name of required) {
    assert.ok(workflows.includes(name), `Falta workflow binding: ${name}`);
  }
});

// ─── TEST 2: Configuración de embeddings NVIDIA Nemotron ──────────────

test('wrangler.jsonc: producción usa NVIDIA Nemotron como embedding provider', async () => {
  const raw = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const config = JSON.parse(raw);
  const prodVars = config.env.production.vars;

  assert.equal(prodVars.EMBEDDING_PROVIDER, 'nvidia');
  assert.equal(prodVars.NVIDIA_EMBEDDING_MODEL, 'nvidia/llama-nemotron-embed-1b-v2');
  assert.equal(prodVars.NVIDIA_EMBEDDING_DIMENSIONS, '1024');
  assert.equal(prodVars.NVIDIA_EMBEDDING_RPM_LIMIT, '18');
});

// ─── TEST 3: D1 migraciones PJO existen y tienen schema correcto ──────

test('migraciones PJO: pjo_review_queue tiene columnas esperadas', async () => {
  const sql = await readFile(
    new URL('../migrations/0020_create_pjo_review_queue.sql', import.meta.url),
    'utf8'
  );
  assert.ok(sql.includes('pjo_review_queue'));
  assert.ok(sql.includes('etiqueta_norm'));
  assert.ok(sql.includes('pregunta_generada'));
  assert.ok(sql.includes('dictamen_rector_id'));
  assert.ok(sql.includes('audit_status'));
  assert.ok(sql.includes("'pending' | 'auto_approved' | 'needs_review' | 'approved' | 'rejected'"));
});

test('migraciones PJO: pjo_curation_log tiene FK a review_queue', async () => {
  const sql = await readFile(
    new URL('../migrations/0021_create_pjo_curation_log.sql', import.meta.url),
    'utf8'
  );
  assert.ok(sql.includes('pjo_curation_log'));
  assert.ok(sql.includes('queue_id'));
  assert.ok(sql.includes('REFERENCES pjo_review_queue'));
  assert.ok(sql.includes('pregunta_curada'));
});

// ─── TEST 4: Flujo enrichment → vectorization chain ───────────────────

test('enrichmentWorkflow: cuando no hay pendientes, dispara vectorization', async () => {
  // Simular el comportamiento del workflow: si no hay dictámenes para enriquecer,
  // debe intentar crear una instancia de VECTORIZATION_WORKFLOW

  const vectorizationWorkflow = mockWorkflow();
  const env = {
    DB: mockD1([]),
    DICTAMENES_SOURCE: mockKV(),
    DICTAMENES_PASO: mockKV(),
    VECTORIZATION_WORKFLOW: vectorizationWorkflow,
    MISTRAL_MODEL: 'mistral-large-2512',
    LOG_LEVEL: 'debug'
  };

  // El workflow no existe como clase importable aquí sin el runtime de CF,
  // pero verificamos la lógica de disparo inspeccionando el código fuente.
  const source = await readFile(
    new URL('../src/workflows/enrichmentWorkflow.ts', import.meta.url),
    'utf8'
  );

  assert.ok(source.includes('VECTORIZATION_WORKFLOW'));
  assert.ok(source.includes('trigger-vectorization-workflow-no-enrichment'));
  assert.ok(source.includes('trigger-vectorization-workflow'));
  assert.ok(source.includes('ENRICHMENT_COMPLETED_TRIGGERING_VECTORIZATION'));
});

// ─── TEST 5: vectorizationWorkflow depende de enrichment previo ───────

test('vectorizationWorkflow: requiere enrichment existente para vectorizar', async () => {
  const source = await readFile(
    new URL('../src/workflows/vectorizationWorkflow.ts', import.meta.url),
    'utf8'
  );

  assert.ok(source.includes('getEnrichment'));
  assert.ok(source.includes('No existe enriquecimiento reutilizable para vectorizar'));
  assert.ok(source.includes('pinecone_sync_status'));
  assert.ok(source.includes('PINECONE_SYNC_SUCCESS'));
});

// ─── TEST 6: Endpoints HTTP críticos existen en index.ts ──────────────

test('index.ts: endpoints de workflow triggers existen', async () => {
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');

  const requiredRoutes = [
    "app.post('/api/v1/dictamenes/batch-enrich'",
    "app.post('/api/v1/dictamenes/batch-vectorize'",
    "app.post('/api/v1/trigger/doctrinal-metadata-reprocess'",
    "app.post('/api/v1/trigger/canonical-relations'",
    "app.post('/api/v1/trigger/kv-sync'",
    "app.get('/api/v1/admin/pjos'",
    "app.get('/api/v1/public/pjos'",
    "app.get('/api/v1/public/pjos/:id/freshness'",
    "app.post('/api/v1/admin/regimenes/:id/pjo'",
    "app.get('/api/v1/stats'",
    "app.get('/search'",
    "app.get('/api/v1/dictamenes/:id'",
    "app.get('/api/v1/dictamenes/:id/lineage'"
  ];

  for (const route of requiredRoutes) {
    assert.ok(source.includes(route), `Falta endpoint: ${route}`);
  }
});

// ─── TEST 7: Endpoints de régimen y PJO ──────────────────────────────

test('index.ts: endpoints de régimenes y PJO públicos existen', async () => {
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');

  assert.ok(source.includes("app.get('/api/v1/public/regimenes'"));
  assert.ok(source.includes("app.get('/api/v1/public/regimenes/:id'"));
  assert.ok(source.includes("app.get('/api/v1/public/regimenes/:id/dictamenes'"));
  assert.ok(source.includes("app.get('/api/v1/public/dictamenes/:id/regimen'"));
  assert.ok(source.includes("app.get('/api/v1/regimenes'"));
  assert.ok(source.includes("app.get('/api/v1/regimenes/:id'"));
});

// ─── TEST 8: Doctrinal metadata workflow es disparado post-enrichment ─

test('enrichmentWorkflow: dispara doctrinal-metadata para IDs enriquecidos', async () => {
  const source = await readFile(
    new URL('../src/workflows/enrichmentWorkflow.ts', import.meta.url),
    'utf8'
  );

  assert.ok(source.includes('DOCTRINAL_METADATA_WORKFLOW'));
  assert.ok(source.includes('trigger-doctrinal-metadata-from-enrichment'));
  assert.ok(source.includes('DOCTRINAL_METADATA_QUEUED'));
  assert.ok(source.includes('auto_from_enrichment_v1'));
});

// ─── TEST 9: KV namespaces correctos en wrangler ─────────────────────

test('wrangler.jsonc: KV namespaces DICTAMENES_SOURCE y PASO configurados', async () => {
  const raw = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const config = JSON.parse(raw);

  const kvBindings = config.kv_namespaces.map(kv => kv.binding);
  assert.ok(kvBindings.includes('DICTAMENES_SOURCE'));
  assert.ok(kvBindings.includes('DICTAMENES_PASO'));

  // Verificar IDs no vacíos
  for (const kv of config.kv_namespaces) {
    assert.ok(kv.id && kv.id.length > 10, `KV ${kv.binding} tiene ID inválido`);
  }
});

// ─── TEST 10: D1 database binding configurado ─────────────────────────

test('wrangler.jsonc: D1 database cgr-dictamenes configurado', async () => {
  const raw = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const config = JSON.parse(raw);

  const d1 = config.d1_databases[0];
  assert.equal(d1.binding, 'DB');
  assert.equal(d1.database_name, 'cgr-dictamenes');
  assert.ok(d1.database_id && d1.database_id.includes('-'));
});

// ─── TEST 11: Estados del pipeline definidos en types.ts ───────────────

test('types.ts: estados del pipeline incluyen enriched_pending_vectorization', async () => {
  const source = await readFile(new URL('../src/types.ts', import.meta.url), 'utf8');

  const requiredStatuses = [
    "'ingested'",
    "'enriching_ingested'",
    "'enriched_pending_vectorization'",
    "'vectorizing'",
    "'vectorized'",
    "'error'",
    "'error_quota'"
  ];

  for (const status of requiredStatuses) {
    assert.ok(source.includes(status), `Falta estado: ${status}`);
  }
});

// ─── TEST 12: embeddingProvider.ts usa modelo Nemotron correcto ───────

test('embeddingProvider.ts: default NVIDIA model es llama-nemotron-embed-1b-v2', async () => {
  const source = await readFile(
    new URL('../src/clients/embeddingProvider.ts', import.meta.url),
    'utf8'
  );

  assert.ok(source.includes('nvidia/llama-nemotron-embed-1b-v2'));
  // Verificar que el modelo antiguo no está como default
  const oldModel = 'nvidia/llama-3.2-nv-embedqa-1b-v2';
  const defaultMatch = source.match(/DEFAULT_NVIDIA_EMBEDDING_MODEL\s*=\s*['"]([^'"]+)['"]/);
  if (defaultMatch) {
    assert.notEqual(defaultMatch[1], oldModel);
  }
});

// ─── TEST 13: Pinecone sync status tabla en vectorization ──────────────

test('vectorizationWorkflow: actualiza pinecone_sync_status en D1', async () => {
  const source = await readFile(
    new URL('../src/workflows/vectorizationWorkflow.ts', import.meta.url),
    'utf8'
  );

  assert.ok(source.includes('pinecone_sync_status'));
  assert.ok(source.includes('metadata_version = 2'));
  assert.ok(source.includes('PINECONE_SYNC_SUCCESS'));
});

// ─── TEST 14: ingestWorkflow.ts existe y maneja ingestión ─────────────

test('ingestWorkflow.ts: existe y procesa dictámenes', async () => {
  const source = await readFile(
    new URL('../src/workflows/ingestWorkflow.ts', import.meta.url),
    'utf8'
  );

  assert.ok(source.includes('IngestWorkflow'));
  assert.ok(source.includes('extractDictamenId'));
  assert.ok(source.includes('INGEST_RUN_DONE'));
  assert.ok(source.includes('ENRICHMENT_WORKFLOW'));
});

// ─── TEST 15: Scripts de backfill PJO existen ────────────────────────

test('scripts PJO: backfill, curate y detect existen', async () => {
  const scripts = [
    '../scripts/backfill_pjo_dictamenes_nocopy.sql',
    '../scripts/curate_pjo_questions.ts',
    '../scripts/detect_pjo_seeds.ts'
  ];

  for (const script of scripts) {
    try {
      await readFile(new URL(script, import.meta.url), 'utf8');
      assert.ok(true, `${script} existe`);
    } catch (e) {
      assert.fail(`No existe script: ${script}`);
    }
  }
});

// ─── TEST 16: Queue repair-nulls configurada ──────────────────────────

test('wrangler.jsonc: queue repair-nulls configurada', async () => {
  const raw = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const config = JSON.parse(raw);

  assert.ok(config.queues);
  assert.ok(config.queues.producers);
  assert.ok(config.queues.consumers);
  assert.equal(config.queues.producers[0].binding, 'REPAIR_QUEUE');
  assert.equal(config.queues.consumers[0].queue, 'repair-nulls-queue');
});

// ─── TEST 17: Cron triggers configurados ───────────────────────────────

test('wrangler.jsonc: cron triggers cada 8 horas', async () => {
  const raw = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const config = JSON.parse(raw);

  assert.ok(config.triggers);
  assert.ok(config.triggers.crons);
  assert.ok(config.triggers.crons.includes('11 0,8,16 * * *'));
});

// ─── RESUMEN DE EJECUCIÓN ────────────────────────────────────────────
// Ejecutar con: node --test tests/post_update_smoke.test.mjs
