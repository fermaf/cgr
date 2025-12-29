// Tipado de bindings y variables de entorno del Worker.
// Cada variable incluye contexto y ejemplo de uso.

interface Env {
  /** KV con el RAW completo del dictamen. Ej: raw/2025-12-31/<sha>.json */
  RAW_KV: KVNamespace;
  /** KV de estado: cursores, throttling, conteos diarios. */
  STATE_KV: KVNamespace;
  /** Cola principal del pipeline (crawl -> enrich -> fuentes -> vectorize). */
  PIPELINE_QUEUE: Queue;
  /** Base de datos D1: tablas dictamen, enrichment, run_log. */
  DB: D1Database;

  /** Base URL de la CGR. Ej: https://www.contraloria.cl */
  CGR_BASE_URL: string;
  /** Cuota diaria maxima (string numerico). Ej: "30000" */
  DAILY_QUOTA: string;
  /** Ratio de reserva para no usar el 100% de la cuota. Ej: "0.8" */
  QUOTA_RESERVE_RATIO: string;

  /** Timezone para reportes y fechas visibles. Ej: "America/Santiago" */
  APP_TIMEZONE: string;

  /** Pausa del cron de ingesta. "true" o "false" */
  CRON_PAUSED: string;
  /** Pausa del consumo de la cola. "true" o "false" */
  PIPELINE_PAUSED: string;

  /** Backfill automatico de canonical. "true" o "false" */
  BACKFILL_CANONICAL: string;
  /** Limite por corrida de backfill canonical. Ej: "100" */
  BACKFILL_CANONICAL_LIMIT: string;
  /** Backfill automatico de documento_completo_missing. "true" o "false" */
  BACKFILL_DOCUMENTO_MISSING: string;
  /** Limite por corrida de backfill documento missing. Ej: "200" */
  BACKFILL_DOCUMENTO_MISSING_LIMIT: string;

  /** Umbral de paginas estables para auto-detener crawl. Ej: "2" */
  STABLE_PAGE_THRESHOLD: string;
  /** Ratio minimo de estabilidad para detener crawl. Ej: "1.0" */
  STABLE_PAGE_RATIO: string;

  /** Host del index Pinecone. Ej: https://<index>.svc.<region>.pinecone.io */
  PINECONE_INDEX_HOST: string;
  /** Namespace Pinecone para el modelo. Ej: "mistralLarge2411" */
  PINECONE_NAMESPACE: string;

  /** URL base API Mistral. Ej: https://api.mistral.ai/v1/chat/completions */
  MISTRAL_API_URL: string;
  /** Modelo Mistral. Ej: "mistral-large-2411" */
  MISTRAL_MODEL: string;
  /** Max reintentos Mistral (string numerico). Ej: "3" */
  MISTRAL_RETRY_MAX: string;
  /** Base ms para backoff. Ej: "500" */
  MISTRAL_RETRY_BASE_MS: string;
  /** Intervalo minimo entre llamadas. Ej: "6000" */
  MISTRAL_MIN_INTERVAL_MS: string;
  /** Backoff ms ante 429 repetidos. Ej: "30000" */
  MISTRAL_429_BACKOFF_MS: string;
  /** Umbral de 429 para activar backoff. Ej: "2" */
  MISTRAL_429_THRESHOLD: string;

  /** Secret Mistral API Key */
  MISTRAL_API_KEY: string;
  /** Secret Pinecone API Key */
  PINECONE_API_KEY: string;
  /** Token interno para endpoints operativos */
  IMPORT_TOKEN: string;
}
