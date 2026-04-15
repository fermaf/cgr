import type { Env } from '../types';

type NvidiaInputType = 'query' | 'passage';

type NvidiaEmbeddingResponse = {
  data?: Array<{
    embedding?: unknown;
  }>;
};

const DEFAULT_NVIDIA_EMBEDDING_API_URL = 'https://integrate.api.nvidia.com/v1/embeddings';
const DEFAULT_NVIDIA_EMBEDDING_MODEL = 'nvidia/llama-3.2-nv-embedqa-1b-v2';
const DEFAULT_NVIDIA_EMBEDDING_DIMENSIONS = 1024;
const DEFAULT_NVIDIA_EMBEDDING_RPM_LIMIT = 18;

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getEmbeddingConfig(env: Env) {
  return {
    apiUrl: env.NVIDIA_EMBEDDING_API_URL || DEFAULT_NVIDIA_EMBEDDING_API_URL,
    model: env.NVIDIA_EMBEDDING_MODEL || DEFAULT_NVIDIA_EMBEDDING_MODEL,
    dimensions: parsePositiveInt(env.NVIDIA_EMBEDDING_DIMENSIONS, DEFAULT_NVIDIA_EMBEDDING_DIMENSIONS),
    rpmLimit: parsePositiveInt(env.NVIDIA_EMBEDDING_RPM_LIMIT, DEFAULT_NVIDIA_EMBEDDING_RPM_LIMIT)
  };
}

async function checkNvidiaEmbeddingRateLimit(env: Env, limitRPM: number) {
  const now = new Date();
  const key = `nvidia:embeddings:rpm:${now.toISOString().slice(0, 16)}`;

  try {
    const row = await env.DB.prepare(`
      INSERT INTO rate_limits (key, current_value, limit_value, reset_at)
      VALUES (?, 1, ?, datetime('now', '+1 minute'))
      ON CONFLICT(key) DO UPDATE SET current_value = current_value + 1
      RETURNING current_value;
    `).bind(key, limitRPM).first<{ current_value: number }>();

    const current = Number(row?.current_value ?? 0);
    if (current > limitRPM) {
      return { allowed: false, current, limit: limitRPM, retryAfterSeconds: 60 };
    }

    return { allowed: true, current, limit: limitRPM };
  } catch {
    return { allowed: false, current: 0, limit: limitRPM, retryAfterSeconds: 30 };
  }
}

function normalizeEmbedding(value: unknown, expectedDimensions: number): number[] {
  if (!Array.isArray(value)) {
    throw new Error('NVIDIA embedding response missing embedding array');
  }

  const embedding = value.map((item) => Number(item));
  if (embedding.length !== expectedDimensions) {
    throw new Error(`NVIDIA embedding dimension mismatch: expected ${expectedDimensions}, got ${embedding.length}`);
  }

  if (embedding.some((item) => !Number.isFinite(item))) {
    throw new Error('NVIDIA embedding contains non-finite values');
  }

  return embedding;
}

async function embedText(env: Env, text: string, inputType: NvidiaInputType): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('NVIDIA embedding input cannot be empty');
  }
  if (!env.NVIDIA_API_KEY) {
    throw new Error('NVIDIA_API_KEY is not configured');
  }

  const config = getEmbeddingConfig(env);
  const rateLimit = await checkNvidiaEmbeddingRateLimit(env, config.rpmLimit);
  if (!rateLimit.allowed) {
    throw new Error(`NVIDIA embedding rate limit exceeded: ${rateLimit.current}/${rateLimit.limit}. Retry after ${rateLimit.retryAfterSeconds ?? 60}s`);
  }

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.NVIDIA_API_KEY}`
    },
    body: JSON.stringify({
      input: [trimmed],
      model: config.model,
      input_type: inputType,
      encoding_format: 'float',
      truncate: 'END',
      dimensions: config.dimensions
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`NVIDIA embedding error: ${response.status} ${detail}`);
  }

  const data = await response.json() as NvidiaEmbeddingResponse;
  return normalizeEmbedding(data.data?.[0]?.embedding, config.dimensions);
}

async function embedQuery(env: Env, text: string): Promise<number[]> {
  return embedText(env, text, 'query');
}

async function embedPassage(env: Env, text: string): Promise<number[]> {
  return embedText(env, text, 'passage');
}

export { embedPassage, embedQuery };
