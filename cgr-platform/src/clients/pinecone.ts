import type { Env } from '../types';

type PineconeMetadata = {
  Resumen: string;
  aclarado: boolean;
  alterado: boolean;
  analisis: string;
  aplicado: boolean;
  boletin: boolean;
  complementado: boolean;
  confirmado: boolean;
  created_at: string;
  descriptores_AI: string[];
  descriptores_originales: string[];
  fecha: string;
  materia: string;
  model: string;
  nuevo: boolean;
  reactivado: boolean;
  reconsiderado: boolean;
  reconsideradoParcialmente: boolean;
  recursoProteccion: boolean;
  relevante: boolean;
  titulo: string;
  u_time: number;
};

type PineconeRecord = {
  id: string;
  metadata: Partial<PineconeMetadata> & Record<string, unknown>
};

/**
 * Normaliza la metadata según el Estándar de la Arquitectura 14 (v8).
 * El cliente centraliza la "Comunicación Enriquecida": construye el campo 'analisis'
 * concatenando Título + Resumen + Análisis para optimizar la búsqueda semántica.
 */
function normalizePineconeMetadata(env: Env, input: Partial<PineconeMetadata> & Record<string, unknown>): PineconeMetadata {
  const now = new Date();
  const createdAt = now.toLocaleString("sv-SE", { timeZone: "America/Santiago" }).replace('T', ' ').substring(0, 19);

  let uTime = Number(input.u_time) || 0;
  if (uTime === 0 && input.fecha) {
    const parsedDate = Date.parse(String(input.fecha));
    if (!isNaN(parsedDate)) {
      uTime = Math.floor(parsedDate / 1000);
    }
  }

  if (uTime === 0) {
    throw new Error(`Invalid u_time: metadata must have a valid date to calculate timestamp.`);
  }

  // Centralización de la Lógica de Concatenación (v8)
  const rawTitulo = String(input.titulo || "");
  const rawResumen = String(input.Resumen || input.resumen || "");
  const rawAnalisis = String(input.analisis || "");

  const enrichedAnalisis = `
      Título: ${rawTitulo}
      Resumen: ${rawResumen}
      Análisis: ${rawAnalisis}
  `.trim();

  const metadata: PineconeMetadata = {
    Resumen: rawResumen,
    aclarado: !!input.aclarado,
    alterado: !!input.alterado,
    analisis: enrichedAnalisis, // Campo enriquecido centralizado
    aplicado: !!input.aplicado,
    boletin: !!input.boletin,
    complementado: !!input.complementado,
    confirmado: !!input.confirmado,
    created_at: String(input.created_at || createdAt),
    descriptores_AI: Array.isArray(input.descriptores_AI) ? input.descriptores_AI.map(String) : [],
    descriptores_originales: Array.isArray(input.descriptores_originales) ? input.descriptores_originales.map(String) : [],
    fecha: String(input.fecha || ""),
    materia: String(input.materia || ""),
    model: String(input.model || env.MISTRAL_MODEL || ""),
    nuevo: !!input.nuevo,
    reactivado: !!input.reactivado,
    reconsiderado: !!input.reconsiderado,
    reconsideradoParcialmente: !!(input.reconsideradoParcialmente ?? input.reconsiderado_parcialmente),
    recursoProteccion: !!(input.recursoProteccion ?? input.recurso_proteccion),
    relevante: !!input.relevante,
    titulo: rawTitulo,
    u_time: uTime,
  };

  return metadata;
}

async function upsertRecord(env: Env, record: PineconeRecord) {
  // Endpoint HTTP directo de Pinecone para Integrated Inference
  const baseUrl = env.PINECONE_INDEX_HOST.endsWith('/') ? env.PINECONE_INDEX_HOST.slice(0, -1) : env.PINECONE_INDEX_HOST;
  const url = new URL(`/records/namespaces/${env.PINECONE_NAMESPACE}/upsert`, baseUrl);

  // El cliente solo normaliza. El contrato (Analisis concatenado y descriptores) se resuelve en el Origen.
  const normalizedMetadata = normalizePineconeMetadata(env, record.metadata);

  // Payload: un solo registro como objeto (no array) según API Pinecone Integrated Inference
  const payload = {
    _id: record.id,
    ...normalizedMetadata
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
