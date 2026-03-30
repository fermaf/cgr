CREATE TABLE IF NOT EXISTS doctrine_structure_remediations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_type TEXT NOT NULL,
  action_status TEXT NOT NULL DEFAULT 'applied',
  normalized_title TEXT NOT NULL,
  canonical_title TEXT NOT NULL,
  canonical_representative_id TEXT NOT NULL,
  merged_representative_ids_json TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.0,
  rationale TEXT,
  metadata_json TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_doctrine_structure_remediations_unique
  ON doctrine_structure_remediations(action_type, normalized_title, canonical_representative_id);

CREATE INDEX IF NOT EXISTS idx_doctrine_structure_remediations_status
  ON doctrine_structure_remediations(action_status, action_type, updated_at DESC);
