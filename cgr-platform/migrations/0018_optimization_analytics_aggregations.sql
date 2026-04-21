-- Migración 0018: Optimización de Analytics y Señales (Final Depurada)
-- Foco: Indices de expresión y cubrientes probados para hot paths reales.

-- 1. Índice de expresión para Topics Trends (Elimina SCAN y apoya GROUP BY)
CREATE INDEX IF NOT EXISTS idx_dictamenes_materia_anio_canon ON dictamenes (
  anio, 
  COALESCE(NULLIF(TRIM(materia), ''), 'Sin materia')
);

-- 2. Índice para Atributos Jurídicos (Acelera cálculo de Relevantes en Trends)
-- Ayuda al SUM(CASE WHEN a.es_relevante = 1...) sin leer la tabla completa.
CREATE INDEX IF NOT EXISTS idx_atributos_juridicos_relevancia ON atributos_juridicos (dictamen_id, es_relevante);

-- 3. Índice cubriente para dictamen_fuentes (Heatmap y Signals)
-- Evita ir a la tabla de datos principal en el join N:M.
CREATE INDEX IF NOT EXISTS idx_analytics_heatmap_covering ON dictamen_fuentes (dictamen_id, fuente_id);

-- 4. Índice cubriente para Relaciones Jurídicas Destino (Cluster Signals)
CREATE INDEX IF NOT EXISTS idx_relaciones_destino_covering ON dictamen_relaciones_juridicas (dictamen_destino_id, dictamen_origen_id, tipo_accion);
