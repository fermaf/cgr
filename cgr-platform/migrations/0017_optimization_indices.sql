-- Migración 0017: Optimización de Índices para Queries Index-Friendly (V3)
-- Foco: Alineación exacta con las queries del motor de clustering y descubrimiento.

-- 1. Índice compuesto integral para listCandidateRows (Cura el hot path de candidatos)
-- Incluye estado, materia normalizada y fecha calculada para permitir INDEX SEARCH + INDEX SORT (no temp b-tree).
CREATE INDEX IF NOT EXISTS idx_dictamenes_clustering_v2 ON dictamenes (
  estado, 
  COALESCE(NULLIF(TRIM(materia), ''), 'Sin materia'), 
  COALESCE(fecha_documento, created_at) DESC
);

-- 2. Índice para acelerar resolveTargetMateria (Agrupación por materia)
-- Ayuda a la agrupación y conteo cuando filtramos por estado y fechas.
CREATE INDEX IF NOT EXISTS idx_dictamenes_materia_stats ON dictamenes (
  estado,
  COALESCE(NULLIF(TRIM(materia), ''), 'Sin materia'),
  fecha_documento DESC
);

-- 3. Índice compuesto para fetchSeedDictamenes (Cura el hot path de semillas)
-- Alineación total con los filtros de rol y el ordenamiento de centralidad y vigencia.
CREATE INDEX IF NOT EXISTS idx_metadata_doctrinal_rol_centrality ON dictamen_metadata_doctrinal (
  rol_principal, 
  doctrinal_centrality_score DESC, 
  currentness_score DESC
);

-- 4. Índice para relaciones jurídicas (Hot path de aggregateClusterSignals)
CREATE INDEX IF NOT EXISTS idx_dictamen_relaciones_origen_tipo ON dictamen_relaciones_juridicas (
  dictamen_origen_id, 
  tipo_accion
);
