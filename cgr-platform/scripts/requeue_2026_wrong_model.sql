-- Reencola dictámenes 2026 enriquecidos con modelo distinto a Mistral Large 2512.
-- Se resetean a ingested y se registra el cambio de estado en dictamen_events.

INSERT INTO dictamen_events (dictamen_id, event_type, status_from, status_to, metadata, created_at)
SELECT d.id,
       'MANUAL_UPDATE',
       d.estado,
       'ingested',
       json_object(
         'origen', 'requeue_2026_wrong_model',
         'modelo_llm_anterior', e.modelo_llm,
         'anio', d.anio
       ),
       CURRENT_TIMESTAMP
FROM dictamenes d
JOIN enriquecimiento e ON e.dictamen_id = d.id
WHERE d.anio = 2026
  AND e.modelo_llm IS NOT NULL
  AND e.modelo_llm != 'mistral-large-2512';

UPDATE dictamenes
SET estado = 'ingested',
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT d.id
  FROM dictamenes d
  JOIN enriquecimiento e ON e.dictamen_id = d.id
  WHERE d.anio = 2026
    AND e.modelo_llm IS NOT NULL
    AND e.modelo_llm != 'mistral-large-2512'
);
