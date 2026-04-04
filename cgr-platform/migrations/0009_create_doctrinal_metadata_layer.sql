-- Migration: 0009_create_doctrinal_metadata_layer.sql

CREATE TABLE IF NOT EXISTS dictamen_metadata_doctrinal (
    dictamen_id TEXT NOT NULL REFERENCES dictamenes(id),
    pipeline_version TEXT NOT NULL,
    computed_at TEXT NOT NULL DEFAULT (datetime('now')),
    materia_base TEXT,
    tema_canonico TEXT,
    subtema_canonico TEXT,
    rol_principal TEXT NOT NULL,
    roles_secundarios_json TEXT,
    estado_intervencion_cgr TEXT NOT NULL,
    estado_vigencia TEXT NOT NULL,
    reading_role TEXT NOT NULL,
    reading_weight REAL NOT NULL DEFAULT 0,
    currentness_score REAL NOT NULL DEFAULT 0,
    historical_significance_score REAL NOT NULL DEFAULT 0,
    doctrinal_centrality_score REAL NOT NULL DEFAULT 0,
    shift_intensity_score REAL NOT NULL DEFAULT 0,
    family_eligibility_score REAL NOT NULL DEFAULT 0,
    drift_risk_score REAL NOT NULL DEFAULT 0,
    supports_state_current INTEGER NOT NULL DEFAULT 0,
    signals_litigious_matter INTEGER NOT NULL DEFAULT 0,
    signals_abstention INTEGER NOT NULL DEFAULT 0,
    signals_competence_closure INTEGER NOT NULL DEFAULT 0,
    signals_operational_rule INTEGER NOT NULL DEFAULT 0,
    anchor_norma_principal TEXT,
    anchor_dictamen_referido TEXT,
    evidence_summary_json TEXT,
    confidence_global REAL NOT NULL DEFAULT 0,
    manual_review_status TEXT NOT NULL DEFAULT 'auto_pending',
    source_snapshot_version TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (dictamen_id, pipeline_version)
);

CREATE TABLE IF NOT EXISTS dictamen_metadata_doctrinal_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dictamen_id TEXT NOT NULL REFERENCES dictamenes(id),
    pipeline_version TEXT NOT NULL,
    evidence_type TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    signal_value TEXT,
    score REAL NOT NULL DEFAULT 0,
    confidence REAL NOT NULL DEFAULT 0,
    source_table TEXT,
    source_locator TEXT,
    snippet TEXT,
    detected_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metadata_doctrinal_reading
  ON dictamen_metadata_doctrinal(pipeline_version, reading_role, reading_weight DESC);

CREATE INDEX IF NOT EXISTS idx_metadata_doctrinal_currentness
  ON dictamen_metadata_doctrinal(pipeline_version, currentness_score DESC);

CREATE INDEX IF NOT EXISTS idx_metadata_doctrinal_validity
  ON dictamen_metadata_doctrinal(pipeline_version, estado_vigencia);

CREATE INDEX IF NOT EXISTS idx_metadata_doctrinal_dictamen
  ON dictamen_metadata_doctrinal(dictamen_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_metadata_doctrinal_evidence_dictamen
  ON dictamen_metadata_doctrinal_evidence(dictamen_id, pipeline_version, created_at DESC);
