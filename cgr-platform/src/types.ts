import type { Workflow, D1Database, KVNamespace } from '@cloudflare/workers-types';

// Estados del pipeline de procesamiento de dictámenes.
// Ver tabla cat_estado_pipeline en D1.
export type DictamenStatus =
  | 'ingested'
  | 'ingested_importante'
  | 'ingested_trivial'
  | 'enriching_ingested'
  | 'enriching_importante'
  | 'enriching_trivial'
  | 'processing'
  | 'enriched'
  | 'enriched_pending_vectorization'
  | 'vectorizing'
  | 'vectorized'
  | 'error'
  | 'error_longitud'
  | 'error_sin_KV_source'
  | 'error_quota'
  | 'error_quota_pinecone';

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
  is_accion?: unknown;
  'acción'?: unknown;
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
}

// Fila de la tabla historial_cambios (Mantenida por compatibilidad temporal).
export interface HistorialCambiosRow {
  id: number;
  dictamen_id: string;
  campo_modificado: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  origen: string;
  fecha_cambio: string;
}

// Tipos de Eventos para la trazabilidad transaccional.
export type DictamenEventType =
  | 'INGESTION_COMPLETED'
  | 'BACKFILL_LOTE_CHECKOUT'
  | 'AI_INFERENCE_START'
  | 'AI_INFERENCE_SUCCESS'
  | 'AI_INFERENCE_ERROR'
  | 'KV_SYNC_PASO_SUCCESS'
  | 'PINECONE_SYNC_SUCCESS'
  | 'AI_LENGTH_EXCEEDED'
  | 'MANUAL_UPDATE'
  | 'SYSTEM_ERROR'
  | 'KV_SOURCE_MISSING'
  | 'AI_QUOTA_EXCEEDED'
  | 'RETRO_UPDATE_APPLIED'
  | 'BACKFILL_QUOTA_ABORT_REVERT'
  | 'RECOVERY_GEMINI_KEY_SWAP'
  | 'RECOVERY_MISTRAL_KEY_SWAP'
  | 'RELATION_BACKFILL_SUCCESS'
  | 'PINECONE_QUOTA_EXCEEDED'
  | 'NVIDIA_EMBEDDING_RATE_LIMITED'
  | 'NVIDIA_EMBEDDING_ERROR'
  | 'DOCTRINAL_METADATA_QUEUED'
  | 'DOCTRINAL_METADATA_SUCCESS'
  | 'DOCTRINAL_METADATA_ERROR';

// Fila de la nueva tabla dictamen_events.
export interface DictamenEventRow {
  id: number;
  dictamen_id: string;
  event_type: DictamenEventType;
  status_from: string | null;
  status_to: string | null;
  metadata: string | null; // JSON string
  created_at: string;
}

export interface DictamenMetadataDoctrinalRow {
  dictamen_id: string;
  pipeline_version: string;
  computed_at: string;
  materia_base: string | null;
  tema_canonico: string | null;
  subtema_canonico: string | null;
  rol_principal: string;
  roles_secundarios_json: string | null;
  estado_intervencion_cgr: string;
  estado_vigencia: string;
  reading_role: string;
  reading_weight: number;
  currentness_score: number;
  historical_significance_score: number;
  doctrinal_centrality_score: number;
  shift_intensity_score: number;
  family_eligibility_score: number;
  drift_risk_score: number;
  supports_state_current: number;
  signals_litigious_matter: number;
  signals_abstention: number;
  signals_competence_closure: number;
  signals_operational_rule: number;
  anchor_norma_principal: string | null;
  anchor_dictamen_referido: string | null;
  evidence_summary_json: string | null;
  confidence_global: number;
  manual_review_status: string;
  source_snapshot_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccionJuridicaEmitida {
  accion: 'aplicado' | 'aclarado' | 'alterado' | 'complementado' | 'confirmado' | 'reactivado' | 'reconsiderado' | 'reconsiderado_parcialmente';
  numero_destino: string;
  anio_destino: string;
  evidencia_textual?: string | null;
}



// Fila de la nueva tabla tabla_boletines.
export interface BoletinRow {
  id: string;
  fecha_inicio: string;
  fecha_fin: string;
  filtro_boletin: number;
  filtro_relevante: number;
  filtro_recurso_prot: number;
  status: 'PENDING' | 'MISTRAL_REDUCING' | 'MEDIA_GENERATING' | 'COMPLETED' | 'ERROR';
  original_ids?: string | null; // JSON array
  synthesis?: string | null;    // Síntesis doctrinal maestra
  created_at: string;
  updated_at: string;
}

// Fila de la nueva tabla tabla_boletines_entregables.
export interface BoletinEntregableRow {
  id: number;
  boletin_id: string;
  canal: string;
  status: 'DRAFT' | 'GENERATING_MEDIA' | 'READY';
  content_text: string | null;
  media_urls: string | null; // JSON string (array)
  prompts: string | null;    // Prompts de Gemini
  metadata: string | null;   // Metadatos adicionales (JSON)
  created_at: string;
  updated_at: string;
}

// Bindings y variables de entorno del Worker.
export interface Env {
  // Bindings
  WORKFLOW: Workflow;
  BACKFILL_WORKFLOW?: Workflow;
  ENRICHMENT_WORKFLOW: Workflow;
  VECTORIZATION_WORKFLOW: Workflow;
  KV_SYNC_WORKFLOW: Workflow;
  CANONICAL_RELATIONS_WORKFLOW: Workflow;
  DOCTRINAL_METADATA_WORKFLOW: Workflow;
  BOLETIN_WORKFLOW: Workflow;
  REGIMEN_BACKFILL_WORKFLOW: Workflow;
  DB: D1Database;
  DICTAMENES_SOURCE: KVNamespace;
  DICTAMENES_PASO: KVNamespace;
  REPAIR_QUEUE: Queue;

  // Vars
  ENVIRONMENT?: string;
  APP_TIMEZONE: string;
  CGR_BASE_URL: string;
  MISTRAL_API_URL: string;
  MISTRAL_MODEL: string;
  PINECONE_INDEX_HOST: string;
  PINECONE_NAMESPACE: string;
  NVIDIA_EMBEDDING_API_URL?: string;
  NVIDIA_EMBEDDING_MODEL?: string;
  NVIDIA_EMBEDDING_DIMENSIONS?: string;
  NVIDIA_EMBEDDING_RPM_LIMIT?: string;
  MISTRAL_RETRY_MAX?: string;
  MISTRAL_RETRY_BASE_MS?: string;
  MISTRAL_MIN_INTERVAL_MS?: string;
  MISTRAL_429_BACKOFF_MS?: string;
  MISTRAL_429_THRESHOLD?: string;
  MISTRAL_API_KEYS?: string;
  MISTRAL_2512_MONTHLY_RESET_DAY?: string;
  MISTRAL_QUOTA_COOLDOWN_HOURS?: string;
  CRAWL_DAYS_LOOKBACK?: string;
  BACKFILL_BATCH_SIZE?: string;
  BACKFILL_DELAY_MS?: string;
  ANALYTICS_CACHE_TTL_SECONDS?: string;
  LOG_LEVEL?: string;
  SKILL_TEST_ERROR?: string;
  SKILL_EXECUTION_ENABLED?: string;
  GEMINI_API_KEYS?: string;
  GEMINI_BLOCKED_API_KEYS?: string;
  GEMINI_RPM_LIMIT_PER_KEY?: string;
  GEMINI_DAILY_RESET_HOUR?: string;

  // Secrets
  PINECONE_API_KEY: string;
  NVIDIA_API_KEY: string;
  MISTRAL_API_KEY: string;
  MISTRAL_API_KEY_CRAWLER_ALE: string;
  MISTRAL_API_KEY_IMPORTANTES_OLGA: string;
  GEMINI_API_KEY: string;
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_TOOL_SECRET: string;

  INGEST_TRIGGER_TOKEN?: string;
  CF_AIG_AUTHORIZATION?: string;
  GEMINI_API_URL?: string;
}
