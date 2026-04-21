-- Migración 0016: Extensión de trazabilidad para Cursor-based Backfill
-- Objetivo: Permitir el registro de lotes migrados mediante Keyset Pagination (Cursor)
-- Fecha: 2026-04-18

-- 1. Agregar columnas para control de paginación
ALTER TABLE backfill_canonical_derivatives_runs ADD COLUMN pagination_mode TEXT DEFAULT 'offset' CHECK (pagination_mode IN ('offset', 'cursor'));
ALTER TABLE backfill_canonical_derivatives_runs ADD COLUMN cursor_after_id INTEGER;
ALTER TABLE backfill_canonical_derivatives_runs ADD COLUMN cursor_start_id INTEGER;
ALTER TABLE backfill_canonical_derivatives_runs ADD COLUMN cursor_end_id INTEGER;

-- 2. Índice para acelerar auditorías de solapamiento y trazabilidad por cursor
CREATE INDEX idx_backfill_runs_cursor ON backfill_canonical_derivatives_runs (kind, pagination_mode, cursor_start_id, cursor_end_id);

-- Nota: Se mantiene legacy_offset como NOT NULL para compatibilidad con registros offset existentes.
-- En modo cursor, legacy_offset deberá ser registrado con un valor centinela (ej. -1) para satisfacer el esquema.
