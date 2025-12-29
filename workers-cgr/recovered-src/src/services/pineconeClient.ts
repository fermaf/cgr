// src/services/pineconeClient.ts
async function upsertRecord(env, record) {
  const url = new URL(`/records/namespaces/${env.PINECONE_NAMESPACE}/upsert`, env.PINECONE_INDEX_HOST);
  const payloadRecord = {
    id: record.id,
    analisis: record.text,
    ...record.metadata ?? {}
  };
  const filtered = Object.fromEntries(
    Object.entries(payloadRecord).filter(([, value]) => value !== null)
  );
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-ndjson",
      "Api-Key": env.PINECONE_API_KEY
    },
    body: `${JSON.stringify(filtered)}
`
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Pinecone error: ${response.status} ${text}`);
  }
  await response.text().catch(() => "");
}
__name(upsertRecord, "upsertRecord");
