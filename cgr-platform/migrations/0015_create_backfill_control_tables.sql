-- Migration: Create backfill control tables
-- Description: Table to track backfill runs for canonical derived data
-- Created at: 2026-04-18

CREATE TABLE IF NOT EXISTS backfill_canonical_derivatives_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  legacy_offset INTEGER NOT NULL,
  legacy_limit INTEGER NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  legacy_rows_read INTEGER NOT NULL DEFAULT 0,
  catalog_candidates INTEGER NOT NULL DEFAULT 0,
  catalog_unique INTEGER NOT NULL DEFAULT 0,
  relation_candidates INTEGER NOT NULL DEFAULT 0,
  relation_unique INTEGER NOT NULL DEFAULT 0,
  duplicates_detected INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  sql_file TEXT,
  apply_status TEXT,
  apply_error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(kind, legacy_offset, legacy_limit, mode)
);

CREATE INDEX IF NOT EXISTS idx_backfill_canonical_runs_kind_status
  ON backfill_canonical_derivatives_runs(kind, status);

CREATE INDEX IF NOT EXISTS idx_backfill_canonical_runs_started
  ON backfill_canonical_derivatives_runs(started_at DESC);
