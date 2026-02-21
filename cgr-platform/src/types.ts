import type { Workflow, D1Database, KVNamespace } from '@cloudflare/workers-types';

export type DictamenStatus = 'ingested' | 'enriched' | 'vectorized' | 'error' | 'invalid_input';

export interface DictamenBooleanos {
  nuevo: number;
  aclarado: number;
  relevante: number;
  confirmado: number;
  boletin: number;
  alterado: number;
  complementado: number;
  reconsiderado_parcialmente: number;
  reconsiderado: number;
  aplicado: number;
  reactivado: number;
  recurso_proteccion: number;
}


export interface DictamenSource {
  documento_completo?: unknown;
  fecha_documento?: unknown;
  fecha_indexacion?: unknown;
  nuevo?: unknown;
  aclarado?: unknown;
  alterado?: unknown;
  aplicado?: unknown;
  complementado?: unknown;
  confirmado?: unknown;
  reconsiderado?: unknown;
  reconsiderado_parcialmente?: unknown;
  reactivado?: unknown;
  relevante?: unknown;
  boletin?: unknown;
  recurso_proteccion?: unknown;
  doc_id?: string;
  n_dictamen?: unknown;
  numeric_doc_id?: unknown;
  year_doc_id?: unknown;
  materia?: unknown;
  criterio?: unknown;
  origen?: unknown;
  origenes?: unknown;
  descriptores?: unknown;
  abogados?: unknown;
  destinatarios?: unknown;
  genera_jurisprudencia?: unknown;
  fuentes_legales?: unknown;
  accion?: unknown;
}

export type DictamenRaw = {
  _source?: DictamenSource;
  source?: DictamenSource;
  raw_data?: DictamenSource;
  _id?: string;
  id?: string;
  [key: string]: unknown;
};

export interface EnrichmentRow {
  id: string;
  dictamen_id: string;
  titulo: string | null;
  resumen: string | null;
  analisis: string | null;
  etiquetas_json: string | null;
  genera_jurisprudencia_llm: number | null;
  fuentes_legales_missing: number | null;
  booleanos_json: string | null;
  fuentes_legales_json: string | null;
  model: string | null;
  migrated_from_mongo: number | null;
  created_at: string;
}

export interface DictamenBooleanosLLMRow extends DictamenBooleanos {
  id: string;
  dictamen_id: string;
  enrichment_id: string;
  created_at: string;
}

export interface HistorialCambiosRow {
  id: string;
  dictamen_id: string;
  campo_modificado: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  origen: string;
  created_at: string;
}


export interface RawRefRow {
  id: string;
  dictamen_id: string;
  raw_key: string;
  sha256: string;
  bytes: number;
  created_at: string;
}

export interface RunLogRow {
  id: string;
  run_type: string;
  status: string;
  detail_json: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface Env {
  // Bindings
  WORKFLOW: Workflow;
  DB: D1Database;
  DICTAMENES_SOURCE: KVNamespace;


  // Vars
  APP_TIMEZONE: string;
  CGR_BASE_URL: string;
  MISTRAL_API_URL: string;
  MISTRAL_MODEL: string;
  PINECONE_INDEX_HOST: string;
  PINECONE_NAMESPACE: string;
  MISTRAL_RETRY_MAX?: string;
  MISTRAL_RETRY_BASE_MS?: string;
  MISTRAL_MIN_INTERVAL_MS?: string;
  MISTRAL_429_BACKOFF_MS?: string;
  MISTRAL_429_THRESHOLD?: string;

  // Secrets
  PINECONE_API_KEY: string;
  MISTRAL_API_KEY: string;
  CF_AIG_AUTHORIZATION?: string;
}
