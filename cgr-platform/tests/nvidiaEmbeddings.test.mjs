import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { embedPassage, embedQuery } from '../src/clients/nvidiaEmbeddings.ts';

const OLD_MODEL = 'nvidia/llama-3.2-nv-embedqa-1b-v2';
const NEW_MODEL = 'nvidia/llama-nemotron-embed-1b-v2';
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/embeddings';

function buildEnv(overrides = {}) {
  const db = {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              return { current_value: 1 };
            }
          };
        }
      };
    }
  };

  return {
    NVIDIA_API_KEY: 'test-nvidia-key',
    DB: db,
    ...overrides
  };
}

function vector1024() {
  return Array.from({ length: 1024 }, (_, index) => index / 1024);
}

async function captureNvidiaRequest(run) {
  const requests = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? '{}'))
    });

    return new Response(JSON.stringify({ data: [{ embedding: vector1024() }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const embedding = await run();
    return { requests, embedding };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('config NVIDIA por defecto usa el modelo renombrado y conserva endpoint/dimensiones', async () => {
  const { requests, embedding } = await captureNvidiaRequest(() => embedQuery(buildEnv(), 'consulta jurídica'));

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, NVIDIA_API_URL);
  assert.equal(requests[0].body.model, NEW_MODEL);
  assert.notEqual(requests[0].body.model, OLD_MODEL);
  assert.equal(requests[0].body.dimensions, 1024);
  assert.equal(requests[0].body.encoding_format, 'float');
  assert.equal(requests[0].body.truncate, 'END');
  assert.equal(embedding.length, 1024);
});

test('embedQuery envía input_type query', async () => {
  const { requests } = await captureNvidiaRequest(() => embedQuery(buildEnv(), 'consulta'));

  assert.equal(requests[0].body.input_type, 'query');
});

test('embedPassage envía input_type passage', async () => {
  const { requests } = await captureNvidiaRequest(() => embedPassage(buildEnv(), 'pasaje del dictamen'));

  assert.equal(requests[0].body.input_type, 'passage');
});

test('embeddingProvider no mantiene el modelo antiguo como default NVIDIA activo', async () => {
  const source = await readFile(new URL('../src/clients/embeddingProvider.ts', import.meta.url), 'utf8');

  assert.ok(source.includes(`DEFAULT_NVIDIA_EMBEDDING_MODEL = '${NEW_MODEL}'`));
  assert.ok(!source.includes(`DEFAULT_NVIDIA_EMBEDDING_MODEL = '${OLD_MODEL}'`));
});

test('wrangler mantiene NVIDIA productivo, namespace histórico y modelo nuevo', async () => {
  const raw = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const config = JSON.parse(raw);
  const productionVars = config.env.production.vars;

  assert.equal(productionVars.EMBEDDING_PROVIDER, 'nvidia');
  assert.notEqual(productionVars.EMBEDDING_PROVIDER, 'mistral');
  assert.equal(productionVars.PINECONE_NAMESPACE, 'mistralLarge2512');
  assert.equal(productionVars.NVIDIA_EMBEDDING_API_URL, NVIDIA_API_URL);
  assert.equal(productionVars.NVIDIA_EMBEDDING_MODEL, NEW_MODEL);
  assert.notEqual(productionVars.NVIDIA_EMBEDDING_MODEL, OLD_MODEL);
  assert.equal(productionVars.NVIDIA_EMBEDDING_DIMENSIONS, '1024');

  assert.ok(raw.includes(NEW_MODEL));
});
