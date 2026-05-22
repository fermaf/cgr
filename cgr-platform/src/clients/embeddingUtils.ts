type EmbeddingInputType = 'query' | 'passage';

const DEFAULT_EMBEDDING_DIMENSIONS = 1024;

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeEmbedding(value: unknown, expectedDimensions: number, providerLabel: string): number[] {
  if (!Array.isArray(value)) {
    throw new Error(`${providerLabel} embedding response missing embedding array`);
  }

  const embedding = value.map((item) => Number(item));
  if (embedding.length !== expectedDimensions) {
    throw new Error(`${providerLabel} embedding dimension mismatch: expected ${expectedDimensions}, got ${embedding.length}`);
  }

  if (embedding.some((item) => !Number.isFinite(item))) {
    throw new Error(`${providerLabel} embedding contains non-finite values`);
  }

  return embedding;
}

export { DEFAULT_EMBEDDING_DIMENSIONS, parsePositiveInt, normalizeEmbedding };
export type { EmbeddingInputType };
