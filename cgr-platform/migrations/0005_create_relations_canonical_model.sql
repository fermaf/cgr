CREATE TABLE IF NOT EXISTS relation_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT,
  relation_type TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  source_locator TEXT,
  snippet TEXT,
  extractor_version TEXT,
  detected_by TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.0,
  observed_at TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_relation_evidence_source
  ON relation_evidence(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relation_evidence_target
  ON relation_evidence(target_entity_type, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relation_evidence_relation
  ON relation_evidence(relation_type, evidence_type);
CREATE INDEX IF NOT EXISTS idx_relation_evidence_confidence
  ON relation_evidence(confidence_score DESC);

CREATE TABLE IF NOT EXISTS relation_assertions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  assertion_status TEXT NOT NULL DEFAULT 'asserted',
  confidence_score REAL NOT NULL DEFAULT 0.0,
  effective_date TEXT,
  detected_by TEXT NOT NULL,
  canonical_evidence_id INTEGER,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (canonical_evidence_id) REFERENCES relation_evidence(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_relation_assertions_unique
  ON relation_assertions(
    source_entity_type,
    source_entity_id,
    target_entity_type,
    target_entity_id,
    relation_type
  );
CREATE INDEX IF NOT EXISTS idx_relation_assertions_status
  ON relation_assertions(assertion_status, confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_relation_assertions_source
  ON relation_assertions(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relation_assertions_target
  ON relation_assertions(target_entity_type, target_entity_id);

CREATE TABLE IF NOT EXISTS relation_assertion_evidence (
  assertion_id INTEGER NOT NULL,
  evidence_id INTEGER NOT NULL,
  evidence_role TEXT NOT NULL DEFAULT 'supporting',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (assertion_id, evidence_id),
  FOREIGN KEY (assertion_id) REFERENCES relation_assertions(id),
  FOREIGN KEY (evidence_id) REFERENCES relation_evidence(id)
);

CREATE INDEX IF NOT EXISTS idx_relation_assertion_evidence_role
  ON relation_assertion_evidence(evidence_role);

CREATE TABLE IF NOT EXISTS doctrine_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dictamen_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  related_dictamen_id TEXT,
  assertion_id INTEGER,
  effective_date TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (assertion_id) REFERENCES relation_assertions(id)
);

CREATE INDEX IF NOT EXISTS idx_doctrine_events_dictamen
  ON doctrine_events(dictamen_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doctrine_events_assertion
  ON doctrine_events(assertion_id);
