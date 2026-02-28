CREATE TABLE IF NOT EXISTS skill_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  env TEXT NOT NULL,
  service TEXT NOT NULL,
  workflow TEXT NOT NULL,
  kind TEXT NOT NULL,
  system TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  decision_skill TEXT,
  matched INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  incident_json TEXT NOT NULL,
  decision_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_skill_events_fingerprint ON skill_events(fingerprint);
CREATE INDEX IF NOT EXISTS idx_skill_events_code ON skill_events(code);
CREATE INDEX IF NOT EXISTS idx_skill_events_service_workflow ON skill_events(service, workflow);
CREATE INDEX IF NOT EXISTS idx_skill_events_created_at ON skill_events(created_at);
