-- 1. Insertar nuevos estados temporales del pipeline si no existen
INSERT OR IGNORE INTO cat_estado_pipeline (codigo, nombre, descripcion, orden) VALUES
('ingested_importante', 'Ingresado (Importante)', 'Pendiente de enrichment prioritario (Gemini)', 15),
('ingested_trivial', 'Ingresado (Trivial)', 'Pendiente de enrichment estándar (Mistral)', 16);

-- 2. Regla temporal prioritaria: Año 2026 -> 'ingested'
-- Guardar historial antes de modificar los dictámenes de 2026 
INSERT INTO historial_cambios (dictamen_id, campo_modificado, valor_anterior, valor_nuevo, origen)
SELECT id, 'estado', estado, 'ingested', 'backfill_reclasificacion'
FROM dictamenes
WHERE anio = 2026 AND estado IN ('error_quota', 'ingested') AND estado != 'ingested';

INSERT INTO dictamen_events (dictamen_id, event_type, status_from, status_to, metadata, created_at)
SELECT id, 'MANUAL_UPDATE', estado, 'ingested', json_object('origen', 'backfill_reclasificacion', 'regla', 'anio_2026'), CURRENT_TIMESTAMP
FROM dictamenes
WHERE anio = 2026 AND estado IN ('error_quota', 'ingested') AND estado != 'ingested';

-- Actualizar estados a 'ingested' para 2026
UPDATE dictamenes 
SET estado = 'ingested'
WHERE anio = 2026 AND estado IN ('error_quota', 'ingested');


-- 3. Regla de relevancia jurídica: Dictámenes importantes
-- Guardar historial para importantes
INSERT INTO historial_cambios (dictamen_id, campo_modificado, valor_anterior, valor_nuevo, origen)
SELECT d.id, 'estado', d.estado, 'ingested_importante', 'backfill_reclasificacion'
FROM dictamenes d
LEFT JOIN atributos_juridicos a ON d.id = a.dictamen_id
WHERE d.anio != 2026 AND d.estado IN ('error_quota', 'ingested') 
AND (COALESCE(a.es_relevante, 0) = 1 OR COALESCE(a.en_boletin, 0) = 1)
AND d.estado != 'ingested_importante';

INSERT INTO dictamen_events (dictamen_id, event_type, status_from, status_to, metadata, created_at)
SELECT d.id, 'MANUAL_UPDATE', d.estado, 'ingested_importante',
       json_object('origen', 'backfill_reclasificacion', 'regla', 'pre_2026_importante', 'es_relevante', COALESCE(a.es_relevante, 0), 'en_boletin', COALESCE(a.en_boletin, 0)),
       CURRENT_TIMESTAMP
FROM dictamenes d
LEFT JOIN atributos_juridicos a ON d.id = a.dictamen_id
WHERE d.anio != 2026 AND d.estado IN ('error_quota', 'ingested')
AND (COALESCE(a.es_relevante, 0) = 1 OR COALESCE(a.en_boletin, 0) = 1)
AND d.estado != 'ingested_importante';

-- Actualizar a 'ingested_importante'
UPDATE dictamenes
SET estado = 'ingested_importante'
WHERE id IN (
  SELECT d.id FROM dictamenes d
  LEFT JOIN atributos_juridicos a ON d.id = a.dictamen_id
  WHERE d.anio != 2026 AND d.estado IN ('error_quota', 'ingested') 
  AND (COALESCE(a.es_relevante, 0) = 1 OR COALESCE(a.en_boletin, 0) = 1)
);


-- 4. Regla de relevancia jurídica: Dictámenes triviales
-- Guardar historial para triviales
INSERT INTO historial_cambios (dictamen_id, campo_modificado, valor_anterior, valor_nuevo, origen)
SELECT d.id, 'estado', d.estado, 'ingested_trivial', 'backfill_reclasificacion'
FROM dictamenes d
LEFT JOIN atributos_juridicos a ON d.id = a.dictamen_id
WHERE d.anio != 2026 AND d.estado IN ('error_quota', 'ingested') 
AND (COALESCE(a.es_relevante, 0) = 0 AND COALESCE(a.en_boletin, 0) = 0)
AND d.estado != 'ingested_trivial';

INSERT INTO dictamen_events (dictamen_id, event_type, status_from, status_to, metadata, created_at)
SELECT d.id, 'MANUAL_UPDATE', d.estado, 'ingested_trivial',
       json_object('origen', 'backfill_reclasificacion', 'regla', 'pre_2026_trivial', 'es_relevante', COALESCE(a.es_relevante, 0), 'en_boletin', COALESCE(a.en_boletin, 0)),
       CURRENT_TIMESTAMP
FROM dictamenes d
LEFT JOIN atributos_juridicos a ON d.id = a.dictamen_id
WHERE d.anio != 2026 AND d.estado IN ('error_quota', 'ingested')
AND (COALESCE(a.es_relevante, 0) = 0 AND COALESCE(a.en_boletin, 0) = 0)
AND d.estado != 'ingested_trivial';

-- Actualizar a 'ingested_trivial'
UPDATE dictamenes
SET estado = 'ingested_trivial'
WHERE id IN (
  SELECT d.id FROM dictamenes d
  LEFT JOIN atributos_juridicos a ON d.id = a.dictamen_id
  WHERE d.anio != 2026 AND d.estado IN ('error_quota', 'ingested') 
  AND (COALESCE(a.es_relevante, 0) = 0 AND COALESCE(a.en_boletin, 0) = 0)
);
