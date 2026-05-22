import type { Env } from '../types';
import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  normalizeEmbedding,
  parsePositiveInt,
  type EmbeddingInputType
} from './embeddingUtils';

type MistralEmbeddingResponse = {
  data?: Array<{
    embedding?: unknown;
  }>;
};

const DEFAULT_MISTRAL_EMBEDDING_MODEL = 'mistral-embed';
const DEFAULT_MISTRAL_EMBEDDING_RPM_LIMIT = 60;

function getMistralEmbeddingConfig(env: Env) {
  return {
    apiUrl: env.MISTRAL_EMBEDDING_API_URL || `${env.MISTRAL_API_URL.replace(/\/$/, '')}/embeddings`,
    model: env.MISTRAL_EMBEDDING_MODEL || DEFAULT_MISTRAL_EMBEDDING_MODEL,
    dimensions: parsePositiveInt(env.MISTRAL_EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_DIMENSIONS),
    rpmLimit: parsePositiveInt(env.MISTRAL_EMBEDDING_RPM_LIMIT, DEFAULT_MISTRAL_EMBEDDING_RPM_LIMIT)
  };
}

async function checkMistralEmbeddingRateLimit(env: Env, limitRPM: number) {
  const now = new Date();
  const key = `mistral:embeddings:rpm:${now.toISOString().slice(0, 16)}`;

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

async function embedText(env: Env, text: string, _inputType: EmbeddingInputType): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Mistral embedding input cannot be empty');
  }
  if (!env.MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY is not configured');
  }

  const config = getMistralEmbeddingConfig(env);
  const rateLimit = await checkMistralEmbeddingRateLimit(env, config.rpmLimit);
  if (!rateLimit.allowed) {
    throw new Error(`Mistral embedding rate limit exceeded: ${rateLimit.current}/${rateLimit.limit}. Retry after ${rateLimit.retryAfterSeconds ?? 60}s`);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.MISTRAL_API_KEY}`
  };
  if (env.CF_AIG_AUTHORIZATION) {
    headers['cf-aig-authorization'] = env.CF_AIG_AUTHORIZATION;
  }

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input: [trimmed],
      model: config.model
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Mistral embedding error: ${response.status} ${detail}`);
  }

  const data = await response.json() as MistralEmbeddingResponse;
  return normalizeEmbedding(data.data?.[0]?.embedding, config.dimensions, 'Mistral');
}

async function embedQuery(env: Env, text: string): Promise<number[]> {
  return embedText(env, text, 'query');
}

async function embedPassage(env: Env, text: string): Promise<number[]> {
  return embedText(env, text, 'passage');
}

export { embedPassage, embedQuery };
