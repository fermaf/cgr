import type { Workflow, D1Database, KVNamespace } from '@cloudflare/workers-types';

// Estados del pipeline de procesamiento de dictámenes.
// Ver tabla cat_estado_pipeline en D1.
export type DictamenStatus = 'ingested' | 'enriched' | 'vectorized' | 'error';

export type OrigenImportacion = 'mongoDb' | 'worker_cron_crawl' | 'worker_batch_ai' | 'worker_manual' | 'crawl_contraloria';

// Booleanos jurídicos (tabla atributos_juridicos).
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

// JSON crudo de la fuente CGR.
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

// Fila de la tabla enriquecimiento (PK = dictamen_id, relación 1:1).
export interface EnrichmentRow {
  dictamen_id: string;
  titulo: string | null;
  resumen: string | null;
  analisis: string | null;
  etiquetas_json: string | null;
  genera_jurisprudencia: number | null;
  booleanos_json: string | null;
  fuentes_legales_json: string | null;
  modelo_llm: string | null;
  fecha_enriquecimiento: string | null;
  procesado: number | null;
}

// Fila de la tabla historial_cambios.
export interface HistorialCambiosRow {
  id: number;
  dictamen_id: string;
  campo_modificado: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  origen: string;
  fecha_cambio: string;
}

// Fila de la tabla registro_ejecucion (ex run_log).
export interface RegistroEjecucionRow {
  id: string;
  tipo: string;
  estado: string;
  detalle_json: string | null;
  inicio: string;
  fin: string | null;
}

// Bindings y variables de entorno del Worker.
export interface Env {
  // Bindings
  WORKFLOW: Workflow;
  BACKFILL_WORKFLOW: Workflow;
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
  CRAWL_DAYS_LOOKBACK?: string;
  BACKFILL_BATCH_SIZE?: string;
  BACKFILL_DELAY_MS?: string;

  // Secrets
  PINECONE_API_KEY: string;
  MISTRAL_API_KEY: string;
  CF_AIG_AUTHORIZATION?: string;
}
