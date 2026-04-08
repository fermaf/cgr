-- Resetea dictámenes trabados en processing a su estado operativo correcto
-- y deja trazabilidad en dictamen_events.

INSERT INTO dictamen_events (dictamen_id, event_type, status_from, status_to, metadata, created_at)
SELECT d.id,
       'MANUAL_UPDATE',
       d.estado,
       CASE
         WHEN e.dictamen_id IS NOT NULL THEN 'enriched_pending_vectorization'
         WHEN d.anio = 2026 THEN 'ingested'
         WHEN COALESCE(a.es_relevante, 0) = 1 OR COALESCE(a.en_boletin, 0) = 1 THEN 'ingested_importante'
         ELSE 'ingested_trivial'
       END,
       json_object(
         'origen', 'reset_processing_to_correct_state',
         'anio', d.anio,
         'es_relevante', COALESCE(a.es_relevante, 0),
         'en_boletin', COALESCE(a.en_boletin, 0),
         'tenia_enriquecimiento', CASE WHEN e.dictamen_id IS NOT NULL THEN 1 ELSE 0 END
       ),
       CURRENT_TIMESTAMP
FROM dictamenes d
LEFT JOIN atributos_juridicos a ON a.dictamen_id = d.id
LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
WHERE d.estado = 'processing';

UPDATE dictamenes
SET estado = CASE
      WHEN EXISTS (SELECT 1 FROM enriquecimiento e WHERE e.dictamen_id = dictamenes.id) THEN 'enriched_pending_vectorization'
      WHEN anio = 2026 THEN 'ingested'
      WHEN EXISTS (
        SELECT 1
        FROM atributos_juridicos a
        WHERE a.dictamen_id = dictamenes.id
          AND (COALESCE(a.es_relevante, 0) = 1 OR COALESCE(a.en_boletin, 0) = 1)
      ) THEN 'ingested_importante'
      ELSE 'ingested_trivial'
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE estado = 'processing';
