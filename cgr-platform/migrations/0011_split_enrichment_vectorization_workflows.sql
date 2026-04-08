INSERT OR IGNORE INTO cat_estado_pipeline (codigo, nombre, descripcion, orden) VALUES
  ('enriching_ingested', 'Enriqueciendo 2026', 'Dictamen 2026 en ejecución de enrichment con la cola principal.', 17),
  ('enriching_importante', 'Enriqueciendo importante', 'Dictamen pre-2026 relevante o en boletín en ejecución de enrichment prioritario.', 18),
  ('enriching_trivial', 'Enriqueciendo trivial', 'Dictamen pre-2026 no prioritario en ejecución de enrichment económico.', 19),
  ('vectorizing', 'Vectorizando', 'Dictamen ya enriquecido y actualmente en ejecución de upsert hacia Pinecone.', 36);

INSERT INTO dictamen_events (dictamen_id, event_type, status_from, status_to, metadata, created_at)
SELECT id,
       'MANUAL_UPDATE',
       estado,
       'enriched_pending_vectorization',
       json_object('origen', 'migracion_0011', 'razon', 'normalizacion_estado_enriched_legacy'),
       CURRENT_TIMESTAMP
FROM dictamenes
WHERE estado = 'enriched';

UPDATE dictamenes
SET estado = 'enriched_pending_vectorization',
    updated_at = CURRENT_TIMESTAMP
WHERE estado = 'enriched';
