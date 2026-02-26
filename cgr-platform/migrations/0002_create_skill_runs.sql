CREATE TABLE IF NOT EXISTS skill_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  incident_fingerprint TEXT NOT NULL,
  incident_code TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_skill_runs_incident_fingerprint ON skill_runs(incident_fingerprint);
CREATE INDEX IF NOT EXISTS idx_skill_runs_skill_name ON skill_runs(skill_name);
CREATE INDEX IF NOT EXISTS idx_skill_runs_created_at ON skill_runs(created_at);
