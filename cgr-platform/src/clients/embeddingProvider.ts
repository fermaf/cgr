import type { Env } from '../types';
import { embedPassage as embedMistralPassage, embedQuery as embedMistralQuery } from './mistralEmbeddings';
import { embedPassage as embedNvidiaPassage, embedQuery as embedNvidiaQuery } from './nvidiaEmbeddings';
import type { EmbeddingInputType } from './embeddingUtils';

type EmbeddingProvider = 'mistral' | 'nvidia';

type EmbeddingTraceMetadata = {
  embedding_provider: EmbeddingProvider;
  embedding_model: string;
  embedding_dimensions: number;
  embedding_vector_schema: string;
  embedding_created_at: string;
};

type EmbeddingResult = {
  values: number[];
  metadata: EmbeddingTraceMetadata;
};

const HISTORICAL_NVIDIA_NAMESPACES = new Set(['mistralLarge2512']);
const MISTRAL_NAMESPACES = new Set(['cgr-mistral-embed-1024']);
const DEFAULT_MISTRAL_EMBEDDING_MODEL = 'mistral-embed';
const DEFAULT_NVIDIA_EMBEDDING_MODEL = 'nvidia/llama-nemotron-embed-1b-v2';
const DEFAULT_EMBEDDING_VECTOR_SCHEMA = 'embedding:v1';

function normalizeProvider(value: unknown, fallback: EmbeddingProvider): EmbeddingProvider {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'mistral' || normalized === 'nvidia') return normalized;
  return fallback;
}

function getPrimaryEmbeddingProvider(env: Env): EmbeddingProvider {
  return normalizeProvider(env.EMBEDDING_PROVIDER, 'nvidia');
}

function getFallbackEmbeddingProvider(env: Env, primary: EmbeddingProvider): EmbeddingProvider | null {
  const rawFallback = String(env.EMBEDDING_FALLBACK_PROVIDER ?? '').trim().toLowerCase();
  if (!rawFallback || rawFallback === 'none' || rawFallback === 'disabled') return null;

  const fallback = normalizeProvider(rawFallback, primary);
  return fallback === primary ? null : fallback;
}

function shouldFallback(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? '');
  return message.includes('is not configured') || message.includes('embedding error: 401') || message.includes('embedding error: 403');
}

function getEmbeddingDimensions(env: Env, provider: EmbeddingProvider): number {
  const rawDimensions = provider === 'mistral' ? env.MISTRAL_EMBEDDING_DIMENSIONS : env.NVIDIA_EMBEDDING_DIMENSIONS;
  const parsed = Number.parseInt(String(rawDimensions ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1024;
}

function getEmbeddingModel(env: Env, provider: EmbeddingProvider): string {
  return provider === 'mistral'
    ? (env.MISTRAL_EMBEDDING_MODEL || DEFAULT_MISTRAL_EMBEDDING_MODEL)
    : (env.NVIDIA_EMBEDDING_MODEL || DEFAULT_NVIDIA_EMBEDDING_MODEL);
}

function getEmbeddingTraceMetadata(env: Env, provider: EmbeddingProvider, createdAt: Date = new Date()): EmbeddingTraceMetadata {
  return {
    embedding_provider: provider,
    embedding_model: getEmbeddingModel(env, provider),
    embedding_dimensions: getEmbeddingDimensions(env, provider),
    embedding_vector_schema: env.EMBEDDING_VECTOR_SCHEMA || DEFAULT_EMBEDDING_VECTOR_SCHEMA,
    embedding_created_at: createdAt.toISOString()
  };
}

function assertProviderNamespaceCompatibility(env: Env, provider: EmbeddingProvider) {
  const namespace = String(env.PINECONE_NAMESPACE || '').trim();
  if (provider === 'mistral' && HISTORICAL_NVIDIA_NAMESPACES.has(namespace)) {
    throw new Error(`Unsafe embedding configuration: provider '${provider}' cannot use historical NVIDIA Pinecone namespace '${namespace}'. Use provider 'nvidia' for this namespace or configure a dedicated Mistral namespace.`);
  }
  if (provider === 'nvidia' && MISTRAL_NAMESPACES.has(namespace)) {
    throw new Error(`Unsafe embedding configuration: provider '${provider}' cannot use Mistral Pinecone namespace '${namespace}'. Use provider 'mistral' for this namespace or configure a dedicated NVIDIA namespace.`);
  }
}

async function embedWithProvider(env: Env, text: string, inputType: EmbeddingInputType, provider: EmbeddingProvider): Promise<EmbeddingResult> {
  assertProviderNamespaceCompatibility(env, provider);
  const values = provider === 'nvidia'
    ? (inputType === 'query' ? await embedNvidiaQuery(env, text) : await embedNvidiaPassage(env, text))
    : (inputType === 'query' ? await embedMistralQuery(env, text) : await embedMistralPassage(env, text));

  return {
    values,
    metadata: getEmbeddingTraceMetadata(env, provider)
  };
}

async function embedTextWithMetadata(env: Env, text: string, inputType: EmbeddingInputType): Promise<EmbeddingResult> {
  const primary = getPrimaryEmbeddingProvider(env);
  try {
    return await embedWithProvider(env, text, inputType, primary);
  } catch (error) {
    const fallback = getFallbackEmbeddingProvider(env, primary);
    if (!fallback || !shouldFallback(error)) {
      throw error;
    }

    return embedWithProvider(env, text, inputType, fallback);
  }
}

async function embedText(env: Env, text: string, inputType: EmbeddingInputType): Promise<number[]> {
  const result = await embedTextWithMetadata(env, text, inputType);
  return result.values;
}

async function embedQueryWithMetadata(env: Env, text: string): Promise<EmbeddingResult> {
  return embedTextWithMetadata(env, text, 'query');
}

async function embedPassageWithMetadata(env: Env, text: string): Promise<EmbeddingResult> {
  return embedTextWithMetadata(env, text, 'passage');
}

async function embedQuery(env: Env, text: string): Promise<number[]> {
  return embedText(env, text, 'query');
}

async function embedPassage(env: Env, text: string): Promise<number[]> {
  return embedText(env, text, 'passage');
}

function isEmbeddingRateLimitError(error: unknown): boolean {
  const message = String((error as any)?.message ?? '');
  return (
    message.includes('Mistral embedding rate limit exceeded') ||
    message.includes('Mistral embedding error: 429') ||
    message.includes('NVIDIA embedding rate limit exceeded') ||
    message.includes('NVIDIA embedding error: 429')
  );
}

function isEmbeddingError(error: unknown): boolean {
  const message = String((error as any)?.message ?? '');
  return message.includes('Mistral embedding') || message.includes('NVIDIA embedding');
}

export { embedPassage, embedPassageWithMetadata, embedQuery, embedQueryWithMetadata, getPrimaryEmbeddingProvider, isEmbeddingError, isEmbeddingRateLimitError };
export type { EmbeddingProvider, EmbeddingTraceMetadata };
