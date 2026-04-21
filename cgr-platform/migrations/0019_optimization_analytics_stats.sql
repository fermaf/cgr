-- 0019_optimization_analytics_stats.sql
-- Optimiza agregaciones masivas en refreshAnalyticsSnapshots mediante índices de expresión.

-- 1. Índice de expresión para materias normalizadas (Trends)
CREATE INDEX IF NOT EXISTS idx_dictamenes_stats_materia 
ON dictamenes (anio, COALESCE(NULLIF(TRIM(materia), ''), 'Sin materia'));
