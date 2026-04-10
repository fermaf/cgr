-- 0010_regimen_dictamenes_puente.sql
-- Tabla puente entre regimenes_jurisprudenciales y los dictámenes miembros.
--
-- Elimina la necesidad de recalcular el grafo para listar los dictámenes
-- de un régimen jurisprudencial. Se rellena desde regimenBuilder.ts.
--
-- rol:
--   'semilla'             → dictamen fundante del régimen
--   'miembro'             → vecino saliente en el grafo
--   'referencia_entrante' → vecino entrante en el grafo
-- distancia:
--   0 = semilla, 1 = vecino directo (solo se usa 0 y 1 por ahora)

CREATE TABLE IF NOT EXISTS regimen_dictamenes (
  regimen_id     TEXT NOT NULL REFERENCES regimenes_jurisprudenciales(id) ON DELETE CASCADE,
  dictamen_id    TEXT NOT NULL,
  rol            TEXT NOT NULL DEFAULT 'miembro',
  distancia      INTEGER NOT NULL DEFAULT 1,
  estado_vigencia TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (regimen_id, dictamen_id)
);

CREATE INDEX IF NOT EXISTS idx_regimen_dictamenes_regimen
  ON regimen_dictamenes(regimen_id);

CREATE INDEX IF NOT EXISTS idx_regimen_dictamenes_dictamen
  ON regimen_dictamenes(dictamen_id);
