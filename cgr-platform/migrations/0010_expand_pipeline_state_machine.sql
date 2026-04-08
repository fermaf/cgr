INSERT OR IGNORE INTO cat_estado_pipeline (codigo, nombre, descripcion, orden) VALUES
  ('ingested_importante', 'Ingresado (Importante)', 'Pendiente de enrichment prioritario con Gemini.', 15),
  ('ingested_trivial', 'Ingresado (Trivial)', 'Pendiente de enrichment económico con Mistral Large 2411.', 16),
  ('enriched_pending_vectorization', 'Enriquecido pendiente de vectorización', 'El dictamen ya fue enriquecido, pero Pinecone no pudo procesarlo todavía.', 35);

CREATE TABLE IF NOT EXISTS api_key_state (
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  key_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  exhausted_until TEXT,
  last_used_at TEXT,
  last_error_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, model, key_id)
);

CREATE TABLE IF NOT EXISTS api_key_usage_window (
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  key_id TEXT NOT NULL,
  window_type TEXT NOT NULL,
  window_key TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, model, key_id, window_type, window_key)
);

CREATE INDEX IF NOT EXISTS idx_api_key_state_status
  ON api_key_state(provider, model, status, exhausted_until);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_window_lookup
  ON api_key_usage_window(provider, model, key_id, window_type, window_key);

INSERT INTO dictamen_events (dictamen_id, event_type, status_from, status_to, metadata, created_at)
SELECT id,
       'PINECONE_QUOTA_EXCEEDED',
       estado,
       'enriched_pending_vectorization',
       json_object('origen', 'migracion_0010', 'legacy_status', estado),
       CURRENT_TIMESTAMP
FROM dictamenes
WHERE estado = 'error_quota_pinecone';

UPDATE dictamenes
SET estado = 'enriched_pending_vectorization',
    updated_at = CURRENT_TIMESTAMP
WHERE estado = 'error_quota_pinecone';
