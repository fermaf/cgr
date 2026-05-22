CREATE TABLE IF NOT EXISTS pjo_review_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etiqueta_norm TEXT NOT NULL,
  pregunta_generada TEXT NOT NULL,
  respuesta_sintetica TEXT,
  dictamen_rector_id TEXT NOT NULL,
  miembros_json TEXT NOT NULL,
  miembros_count INTEGER NOT NULL DEFAULT 0,
  audit_status TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'auto_approved' | 'needs_review' | 'approved' | 'rejected'
  audit_reason TEXT,
  auditor TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pjo_review_queue_status ON pjo_review_queue(audit_status);
CREATE INDEX IF NOT EXISTS idx_pjo_review_queue_etiqueta ON pjo_review_queue(etiqueta_norm);
