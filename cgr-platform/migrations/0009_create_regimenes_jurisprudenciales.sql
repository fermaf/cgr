-- Migración 0009: Tablas de Regímenes Jurisprudenciales (Fase 1)
--
-- Estas tablas implementan la arquitectura de 4 capas para organizar
-- la jurisprudencia administrativa de la CGR:
--
--   Capa 1: dictamenes (ya existe)
--   Capa 2: problemas_juridicos_operativos (PJO) — nueva
--   Capa 3: regimenes_jurisprudenciales — nueva
--   Capa 4: norma_regimen (topología normativa) — nueva
--
-- Principio de supremacía temporal:
--   El dictamen más reciente dentro de un Régimen gobierna la lectura.
--   Un cambio de criterio degrada todo lo anterior a antecedente histórico.
--
-- Nota de naming: el sistema usa "jurisprudencia", no "doctrina",
-- porque la CGR emite jurisprudencia administrativa, no doctrina académica.

-- ── CAPA 3: Régimen Jurisprudencial ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS regimenes_jurisprudenciales (
  id TEXT PRIMARY KEY,               -- slug generado: "confianza-legitima-contratas"
  pipeline_version TEXT NOT NULL,    -- version del pipeline que los generó

  -- Identidad del régimen
  nombre TEXT NOT NULL,              -- "Confianza legítima en contratas"
  nombre_normalizado TEXT NOT NULL,  -- para búsqueda case-insensitive
  descripcion TEXT,                  -- oración explicativa para usuarios

  -- Clasificación por tipo de potestad CGR (cerrada, ~8 valores)
  tipo_potestad TEXT,
  -- 'control_legalidad' | 'control_financiero' | 'interpretacion' |
  -- 'organizacion_publica' | 'contratacion_publica' | 'personal_publico' |
  -- 'patrimonio_publico' | 'seguridad_social'

  -- Ámbito orgánico (quién aplica el régimen)
  ambito_organico TEXT,
  -- 'administracion_central' | 'municipal' | 'ffaa' | 'universidades' |
  -- 'salud' | 'educacion' | 'transversal'

  -- Estado actual del régimen
  estado TEXT NOT NULL DEFAULT 'activo',
  -- 'activo' | 'en_transicion' | 'fragmentado' | 'zona_abstencion' |
  -- 'zona_litigiosa' | 'desplazado'
  estado_razon TEXT,                 -- explicación opcional del estado

  -- Dictámenes estructurales del régimen
  dictamen_rector_id TEXT,           -- gobierna la lectura actual
  dictamen_fundante_id TEXT,         -- originó el criterio
  dictamen_pivote_id TEXT,           -- marcó un cambio de criterio (nullable)

  -- Scores de calidad
  estabilidad REAL NOT NULL DEFAULT 0,     -- 0..1, qué tan estable es el criterio
  cobertura_corpus REAL NOT NULL DEFAULT 0, -- % del corpus que cubre
  confianza REAL NOT NULL DEFAULT 0,        -- confianza del sistema en el régimen

  -- Temporal
  fecha_criterio_fundante TEXT,      -- fecha del dictamen que originó el criterio
  fecha_ultimo_pronunciamiento TEXT, -- fecha del dictamen más reciente en el régimen

  -- Construcción
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_regimenes_estado
  ON regimenes_jurisprudenciales(estado);
CREATE INDEX IF NOT EXISTS idx_regimenes_tipo_potestad
  ON regimenes_jurisprudenciales(tipo_potestad);
CREATE INDEX IF NOT EXISTS idx_regimenes_nombre_norm
  ON regimenes_jurisprudenciales(nombre_normalizado);

-- ── CAPA 2: Problema Jurídico Operativo (PJO) ───────────────────────────────

CREATE TABLE IF NOT EXISTS problemas_juridicos_operativos (
  id TEXT PRIMARY KEY,               -- slug: "confianza-legitima-contratas-no-renovacion"
  regimen_id TEXT NOT NULL REFERENCES regimenes_jurisprudenciales(id) ON DELETE CASCADE,
  pipeline_version TEXT NOT NULL,

  -- La pregunta jurídica (nivel de abstracción correcto: NO fact pattern)
  pregunta TEXT NOT NULL,            -- "¿Debe fundarse la no renovación de contrata?"
  pregunta_normalizada TEXT NOT NULL,

  -- Estado del PJO dentro del régimen
  estado TEXT NOT NULL DEFAULT 'resuelto',
  -- 'resuelto' | 'en_tension' | 'sin_pronunciamiento_claro' | 'desplazado'
  respuesta_sintetica TEXT,          -- "Sí, mediante acto fundado (E156769N21)"

  -- Dictamen que mejor responde el PJO
  dictamen_rector_id TEXT,

  -- Búsqueda y matching
  embedding_anchor TEXT,             -- texto para matching semántico futuro
  keywords_json TEXT,                -- ["confianza legítima", "contrata", "renovación"]

  -- Construcción
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pjo_regimen
  ON problemas_juridicos_operativos(regimen_id);
CREATE INDEX IF NOT EXISTS idx_pjo_estado
  ON problemas_juridicos_operativos(estado);

-- ── Membresía: dictamen → PJO ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pjo_dictamenes (
  pjo_id TEXT NOT NULL REFERENCES problemas_juridicos_operativos(id) ON DELETE CASCADE,
  dictamen_id TEXT NOT NULL,

  -- Rol del dictamen dentro del PJO
  rol TEXT NOT NULL DEFAULT 'aplicativo',
  -- 'rector' | 'fundante' | 'aplicativo' | 'contextual' | 'historico'

  relevancia REAL NOT NULL DEFAULT 0,     -- 0..1
  reading_order INTEGER,                   -- orden sugerido de lectura
  explicacion TEXT,                        -- por qué pertenece a este PJO

  PRIMARY KEY (pjo_id, dictamen_id)
);

CREATE INDEX IF NOT EXISTS idx_pjo_dictamenes_dictamen
  ON pjo_dictamenes(dictamen_id);

-- ── CAPA 4: Topología normativa (norma ↔ régimen) ───────────────────────────

CREATE TABLE IF NOT EXISTS norma_regimen (
  -- Clave canónica de la norma según buildNormaCanonicalKey()
  -- Formato según tipo:
  --   Leyes/DL:    "Ley|18834|10"
  --   DFL/Decreto: "DFL|1|2005|salud|153"
  --   Códigos:     "Código del Trabajo|159"
  norma_key TEXT NOT NULL,
  regimen_id TEXT NOT NULL REFERENCES regimenes_jurisprudenciales(id) ON DELETE CASCADE,

  -- Descomposición para presentación
  tipo_norma TEXT NOT NULL,
  numero TEXT,
  articulo TEXT,
  year TEXT,
  sector TEXT,

  -- Peso de esta norma en el régimen
  centralidad REAL NOT NULL DEFAULT 0,   -- qué % de dictámenes del régimen la citan
  dictamenes_count INTEGER NOT NULL DEFAULT 0,

  PRIMARY KEY (norma_key, regimen_id)
);

CREATE INDEX IF NOT EXISTS idx_norma_regimen_regimen
  ON norma_regimen(regimen_id);
CREATE INDEX IF NOT EXISTS idx_norma_regimen_norma
  ON norma_regimen(norma_key);

-- ── CAPA Temporal: timeline del régimen ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS regimen_timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regimen_id TEXT NOT NULL REFERENCES regimenes_jurisprudenciales(id) ON DELETE CASCADE,
  dictamen_id TEXT NOT NULL,

  fecha TEXT NOT NULL,
  tipo_evento TEXT NOT NULL,
  -- 'fundacion' | 'consolidacion' | 'ajuste' | 'tension' |
  -- 'desplazamiento' | 'abstencion' | 'reactivacion'

  descripcion TEXT,
  impacto TEXT NOT NULL DEFAULT 'medio',
  -- 'alto' | 'medio' | 'bajo'

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_regimen_timeline_regimen
  ON regimen_timeline(regimen_id);
CREATE INDEX IF NOT EXISTS idx_regimen_timeline_dictamen
  ON regimen_timeline(dictamen_id);
