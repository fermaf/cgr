CREATE TABLE _cf_KV (
        key TEXT PRIMARY KEY,
        value BLOB
      ) WITHOUT ROWID;

CREATE TABLE cat_divisiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nombre_completo TEXT NOT NULL
);

CREATE TABLE sqlite_sequence(name,seq);

CREATE TABLE cat_abogados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    iniciales TEXT UNIQUE NOT NULL
);

CREATE TABLE cat_descriptores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    termino TEXT UNIQUE NOT NULL
);

CREATE TABLE dictamenes (
    id TEXT PRIMARY KEY,
    numero TEXT,
    anio INTEGER,
    fecha_documento TEXT,
    fecha_indexacion TEXT,
    division_id INTEGER REFERENCES cat_divisiones(id),
    criterio TEXT,
    destinatarios TEXT,
    materia TEXT,
    old_url TEXT,
    origen_importacion TEXT DEFAULT 'mongoDb',
    created_at TEXT DEFAULT (datetime('now'))
, estado TEXT DEFAULT 'ingested', updated_at TEXT);

CREATE TABLE atributos_juridicos (
    dictamen_id TEXT PRIMARY KEY REFERENCES dictamenes(id),
    es_nuevo INTEGER DEFAULT 0,
    es_relevante INTEGER DEFAULT 0,
    en_boletin INTEGER DEFAULT 0,
    recurso_proteccion INTEGER DEFAULT 0,
    aclarado INTEGER DEFAULT 0,
    alterado INTEGER DEFAULT 0,
    aplicado INTEGER DEFAULT 0,
    complementado INTEGER DEFAULT 0,
    confirmado INTEGER DEFAULT 0,
    reactivado INTEGER DEFAULT 0,
    reconsiderado INTEGER DEFAULT 0,
    reconsiderado_parcialmente INTEGER DEFAULT 0,
    caracter TEXT
);

CREATE TABLE enriquecimiento (
    dictamen_id TEXT PRIMARY KEY REFERENCES dictamenes(id),
    modelo_llm TEXT,
    fecha_enriquecimiento TEXT,
    titulo TEXT,
    resumen TEXT,
    analisis TEXT,
    genera_jurisprudencia INTEGER DEFAULT 0
, etiquetas_json TEXT, booleanos_json TEXT, fuentes_legales_json TEXT);

CREATE TABLE dictamen_abogados (
    dictamen_id TEXT NOT NULL REFERENCES dictamenes(id),
    abogado_id INTEGER NOT NULL REFERENCES cat_abogados(id),
    PRIMARY KEY (dictamen_id, abogado_id)
);

CREATE TABLE dictamen_descriptores (
    dictamen_id TEXT NOT NULL REFERENCES dictamenes(id),
    descriptor_id INTEGER NOT NULL REFERENCES cat_descriptores(id),
    PRIMARY KEY (dictamen_id, descriptor_id)
);

CREATE TABLE dictamen_fuentes_legales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dictamen_id TEXT NOT NULL REFERENCES dictamenes(id),
    tipo_norma TEXT,
    numero TEXT,
    articulo TEXT,
    extra TEXT,
    year TEXT,
    sector TEXT
);

CREATE TABLE dictamen_referencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dictamen_id TEXT NOT NULL REFERENCES dictamenes(id),
    dictamen_ref_nombre TEXT,
    year TEXT,
    url TEXT
);

CREATE TABLE dictamen_etiquetas_llm (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dictamen_id TEXT NOT NULL REFERENCES dictamenes(id),
    etiqueta TEXT NOT NULL
);

CREATE INDEX idx_dictamenes_anio ON dictamenes(anio);

CREATE INDEX idx_dictamenes_division ON dictamenes(division_id);

CREATE INDEX idx_dictamenes_criterio ON dictamenes(criterio);

CREATE INDEX idx_atributos_recurso ON atributos_juridicos(recurso_proteccion);

CREATE INDEX idx_enriquecimiento_modelo ON enriquecimiento(modelo_llm);

CREATE INDEX idx_fuentes_tipo_numero ON dictamen_fuentes_legales(tipo_norma, numero);

CREATE INDEX idx_referencias_ref ON dictamen_referencias(dictamen_ref_nombre);

CREATE INDEX idx_etiquetas_etiqueta ON dictamen_etiquetas_llm(etiqueta);

CREATE TABLE historial_cambios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dictamen_id TEXT NOT NULL REFERENCES dictamenes(id),
    campo_modificado TEXT NOT NULL,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    fecha_cambio TEXT DEFAULT (datetime('now')),
    origen TEXT DEFAULT 'migracion'
);

CREATE INDEX idx_historial_dictamen ON historial_cambios(dictamen_id);

CREATE INDEX idx_historial_fecha ON historial_cambios(fecha_cambio);

CREATE TABLE cat_estado_pipeline (codigo TEXT PRIMARY KEY, nombre TEXT NOT NULL, descripcion TEXT NOT NULL, orden INTEGER NOT NULL);

CREATE TABLE kv_sync_status (dictamen_id TEXT PRIMARY KEY, en_source INTEGER NOT NULL DEFAULT 0, en_paso INTEGER NOT NULL DEFAULT 0, source_written_at TEXT, paso_written_at TEXT, source_error TEXT, paso_error TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (dictamen_id) REFERENCES dictamenes(id));

CREATE TABLE kv_trash (id TEXT PRIMARY KEY, type TEXT, deleted_at TEXT);
