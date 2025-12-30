// Cliente Pinecone: upsert de vectores y metadata.
type PineconeRecord = { id: string; text: string; metadata?: Record<string, unknown> | null };

async function upsertRecord(env: Env, record: PineconeRecord & { values: number[] }) {
  const url = new URL(`/vectors/upsert`, env.PINECONE_INDEX_HOST);
  if (env.PINECONE_NAMESPACE) {
    url.searchParams.set("namespace", env.PINECONE_NAMESPACE);
  }

  const payload = {
    vectors: [
      {
        id: record.id,
        values: record.values,
        metadata: {
          ...record.metadata,
          text: record.text // Guardamos el texto en metadata para recuperarlo después
        }
      }
    ]
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

async function queryRecords(env: Env, vector: number[], limit: number = 10, filter?: Record<string, any>) {
  const url = new URL(`/query`, env.PINECONE_INDEX_HOST);

  const payload = {
    namespace: env.PINECONE_NAMESPACE,
    vector: vector,
    topK: limit,
    includeMetadata: true,
    filter: filter
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
    matches: (data.matches || []).map((match: any) => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata || {}
    }))
  };
}

async function fetchRecords(env: Env, ids: string[]) {
  // Para Integrated Inference, usamos el endpoint de records
  const url = new URL(`/records/namespaces/${env.PINECONE_NAMESPACE}/records?ids=${ids.join(',')}`, env.PINECONE_INDEX_HOST);

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

  // Normalizamos al formato esperado por el indexer: { vectors: { [id]: { id, fields } } }
  const vectors: Record<string, any> = {};
  if (Array.isArray(data.records)) {
    for (const rec of data.records) {
      vectors[rec.id] = rec;
    }
  }

  return { vectors };
}

export { upsertRecord, queryRecords, fetchRecords };
