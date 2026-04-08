-- Auditoría rápida de consistencia del pipeline de ingesta, enrichment y vectorización.

-- 1. Resumen por estado actual.
SELECT estado, COUNT(*) AS total
FROM dictamenes
GROUP BY estado
ORDER BY total DESC, estado ASC;

-- 2. Dictámenes 2026 enriquecidos con un modelo que no corresponde.
SELECT d.id, d.anio, d.estado, e.modelo_llm, e.fecha_enriquecimiento
FROM dictamenes d
JOIN enriquecimiento e ON e.dictamen_id = d.id
WHERE d.anio = 2026
  AND e.modelo_llm IS NOT NULL
  AND e.modelo_llm != 'mistral-large-2512'
ORDER BY e.fecha_enriquecimiento DESC, d.id ASC;

-- 3. Dictámenes pre-2026 marcados como importantes, pero enriquecidos con modelo distinto de Gemini.
SELECT d.id,
       d.anio,
       d.estado,
       COALESCE(a.es_relevante, 0) AS es_relevante,
       COALESCE(a.en_boletin, 0) AS en_boletin,
       e.modelo_llm,
       e.fecha_enriquecimiento
FROM dictamenes d
LEFT JOIN atributos_juridicos a ON a.dictamen_id = d.id
JOIN enriquecimiento e ON e.dictamen_id = d.id
WHERE d.anio < 2026
  AND (COALESCE(a.es_relevante, 0) = 1 OR COALESCE(a.en_boletin, 0) = 1)
  AND e.modelo_llm != 'gemini-3.1-flash-lite-preview'
ORDER BY e.fecha_enriquecimiento DESC, d.id ASC;

-- 4. Dictámenes pre-2026 triviales enriquecidos con modelo distinto de Mistral 2411.
SELECT d.id,
       d.anio,
       d.estado,
       COALESCE(a.es_relevante, 0) AS es_relevante,
       COALESCE(a.en_boletin, 0) AS en_boletin,
       e.modelo_llm,
       e.fecha_enriquecimiento
FROM dictamenes d
LEFT JOIN atributos_juridicos a ON a.dictamen_id = d.id
JOIN enriquecimiento e ON e.dictamen_id = d.id
WHERE d.anio < 2026
  AND COALESCE(a.es_relevante, 0) = 0
  AND COALESCE(a.en_boletin, 0) = 0
  AND e.modelo_llm != 'mistral-large-2411'
ORDER BY e.fecha_enriquecimiento DESC, d.id ASC;

-- 5. Estados inconsistentes con enrichment/vectorización.
SELECT d.id, d.estado, e.modelo_llm, e.fecha_enriquecimiento
FROM dictamenes d
LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
WHERE (d.estado IN ('enriched', 'vectorized', 'enriched_pending_vectorization') AND e.dictamen_id IS NULL)
   OR (d.estado = 'vectorized' AND e.dictamen_id IS NULL)
ORDER BY d.estado, d.id;

-- 6. Estados legacy que conviene vaciar.
SELECT d.id, d.estado, d.updated_at, e.modelo_llm
FROM dictamenes d
LEFT JOIN enriquecimiento e ON e.dictamen_id = d.id
WHERE d.estado IN ('error_quota', 'error_quota_pinecone')
ORDER BY d.updated_at DESC, d.id ASC;

-- 7. Procesamientos trabados.
SELECT id, estado, updated_at
FROM dictamenes
WHERE estado = 'processing'
  AND updated_at < datetime('now', '-2 hours')
ORDER BY updated_at ASC;
