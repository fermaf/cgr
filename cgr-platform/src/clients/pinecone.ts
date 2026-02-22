import type { Env } from '../types';

type PineconeRecord = { id: string; text: string; metadata?: Record<string, unknown> | null };

async function upsertRecord(env: Env, record: PineconeRecord) {
  // Endpoint HTTP directo de Pinecone para Integrated Inference
  const baseUrl = env.PINECONE_INDEX_HOST.endsWith('/') ? env.PINECONE_INDEX_HOST.slice(0, -1) : env.PINECONE_INDEX_HOST;
  const url = new URL(`/records/namespaces/${env.PINECONE_NAMESPACE}/upsert`, baseUrl);

  // Payload: un solo registro como objeto (no array) según API Pinecone Integrated Inference
  const payload = {
    _id: record.id,
    analisis: record.text, // Pinecone vectoriza internamente via field_map
    ...(record.metadata || {})
  };

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": env.PINECONE_API_KEY
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Pinecone upsert error: ${response.status} ${text}`);
  }
}

async function queryRecords(env: Env, query: string, limit: number = 10, filter?: Record<string, any>) {
  const baseUrl = env.PINECONE_INDEX_HOST.endsWith('/') ? env.PINECONE_INDEX_HOST.slice(0, -1) : env.PINECONE_INDEX_HOST;
  const url = new URL(`/records/namespaces/${env.PINECONE_NAMESPACE}/search`, baseUrl);

  const payload = {
    query: {
      inputs: { text: query },
      top_k: limit,
      filter: filter
    }
  };

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": env.PINECONE_API_KEY
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Pinecone search error: ${response.status} ${text}`);
  }

  const data = await response.json() as any;

  return {
    matches: (data.result?.hits || []).map((hit: any) => ({
      id: hit._id || hit.id,
      score: hit._score || hit.score,
      metadata: hit.fields || hit.metadata || {}
    }))
  };
}

async function fetchRecords(env: Env, ids: string[]) {
  if (!ids || ids.length === 0) return { vectors: {} };

  const baseUrl = env.PINECONE_INDEX_HOST.endsWith('/') ? env.PINECONE_INDEX_HOST.slice(0, -1) : env.PINECONE_INDEX_HOST;
  const queryString = ids.map(id => `ids=${encodeURIComponent(id)}`).join('&');
  const url = new URL(`/records/namespaces/${env.PINECONE_NAMESPACE}/records?${queryString}`, baseUrl);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Api-Key": env.PINECONE_API_KEY
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Pinecone fetch error: ${response.status} ${text}`);
  }

  const data = await response.json() as any;
  const vectors: Record<string, any> = {};

  if (Array.isArray(data.records)) {
    for (const rec of data.records) {
      const recId = rec._id || rec.id;
      vectors[recId] = { id: recId, metadata: rec.fields || rec.metadata };
    }
  }

  return { vectors };
}

export { upsertRecord, queryRecords, fetchRecords };
