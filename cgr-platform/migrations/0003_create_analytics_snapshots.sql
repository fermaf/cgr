CREATE TABLE IF NOT EXISTS stats_snapshot_normative_heatmap (
  snapshot_date TEXT NOT NULL,
  year INTEGER,
  tipo_norma TEXT NOT NULL,
  numero TEXT,
  total_refs INTEGER NOT NULL,
  total_dictamenes INTEGER NOT NULL,
  last_source_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (snapshot_date, year, tipo_norma, numero)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_heatmap_date
  ON stats_snapshot_normative_heatmap(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_snapshot_heatmap_year
  ON stats_snapshot_normative_heatmap(year);
CREATE INDEX IF NOT EXISTS idx_snapshot_heatmap_refs
  ON stats_snapshot_normative_heatmap(total_refs DESC);

CREATE TABLE IF NOT EXISTS stats_snapshot_topic_trends (
  snapshot_date TEXT NOT NULL,
  year INTEGER,
  materia TEXT NOT NULL,
  total_dictamenes INTEGER NOT NULL,
  relevantes INTEGER NOT NULL,
  last_source_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (snapshot_date, year, materia)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_topic_date
  ON stats_snapshot_topic_trends(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_snapshot_topic_year
  ON stats_snapshot_topic_trends(year);
CREATE INDEX IF NOT EXISTS idx_snapshot_topic_total
  ON stats_snapshot_topic_trends(total_dictamenes DESC);
