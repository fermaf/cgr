CREATE TABLE IF NOT EXISTS pjo_curation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id INTEGER NOT NULL REFERENCES pjo_review_queue(id),
  etiqueta_norm TEXT NOT NULL,
  pregunta_original TEXT NOT NULL,
  pregunta_curada TEXT,
  score_original INTEGER NOT NULL DEFAULT 0,
  score_curada INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | curated | needs_expert | approved | rejected
  curator TEXT,
  curated_at TEXT DEFAULT (datetime('now')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_pjo_curation_log_status ON pjo_curation_log(status);
CREATE INDEX IF NOT EXISTS idx_pjo_curation_log_queue ON pjo_curation_log(queue_id);
