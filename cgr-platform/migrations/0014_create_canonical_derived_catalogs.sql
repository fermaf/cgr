-- 0014_create_canonical_derived_catalogs.sql
-- Crea catalogos canonicos para etiquetas LLM y fuentes legales.
-- No modifica tablas legacy ni cambia rutas productivas.

-- Catalogo canonico de etiquetas LLM
CREATE TABLE IF NOT EXISTS etiquetas_catalogo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etiqueta_display TEXT NOT NULL,
  etiqueta_norm TEXT NOT NULL UNIQUE,
  etiqueta_slug TEXT NOT NULL,
  origen TEXT NOT NULL DEFAULT 'llm',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dictamen_etiquetas (
  dictamen_id TEXT NOT NULL,
  etiqueta_id INTEGER NOT NULL,
  raw_etiqueta TEXT,
  modelo_llm TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (dictamen_id, etiqueta_id),
  FOREIGN KEY (dictamen_id) REFERENCES dictamenes(id),
  FOREIGN KEY (etiqueta_id) REFERENCES etiquetas_catalogo(id)
);

CREATE TABLE IF NOT EXISTS etiquetas_alias (
  alias_norm TEXT PRIMARY KEY,
  etiqueta_id INTEGER NOT NULL,
  razon TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (etiqueta_id) REFERENCES etiquetas_catalogo(id)
);

CREATE INDEX IF NOT EXISTS idx_dictamen_etiquetas_etiqueta
  ON dictamen_etiquetas(etiqueta_id);

-- Catalogo canonico de fuentes legales
CREATE TABLE IF NOT EXISTS fuentes_legales_catalogo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  norma_key TEXT NOT NULL UNIQUE,
  tipo_norma TEXT NOT NULL,
  numero TEXT,
  articulo TEXT,
  year TEXT,
  sector TEXT,
  display_label TEXT NOT NULL,
  confianza_normalizacion REAL NOT NULL DEFAULT 1.0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dictamen_fuentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dictamen_id TEXT NOT NULL,
  fuente_id INTEGER NOT NULL,
  raw_tipo_norma TEXT,
  raw_numero TEXT,
  raw_articulo TEXT,
  raw_extra TEXT,
  modelo_llm TEXT,
  mention_key TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (dictamen_id) REFERENCES dictamenes(id),
  FOREIGN KEY (fuente_id) REFERENCES fuentes_legales_catalogo(id)
);

CREATE TABLE IF NOT EXISTS fuentes_legales_alias (
  alias_key TEXT PRIMARY KEY,
  fuente_id INTEGER NOT NULL,
  razon TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (fuente_id) REFERENCES fuentes_legales_catalogo(id)
);

CREATE INDEX IF NOT EXISTS idx_dictamen_fuentes_fuente
  ON dictamen_fuentes(fuente_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dictamen_fuentes_unique_mention
  ON dictamen_fuentes(dictamen_id, fuente_id, mention_key);

CREATE INDEX IF NOT EXISTS idx_fuentes_catalogo_tipo_numero
  ON fuentes_legales_catalogo(tipo_norma, numero);
