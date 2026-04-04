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

CREATE TABLE relation_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_entity_type TEXT NOT NULL,
    source_entity_id TEXT NOT NULL,
    target_entity_type TEXT NOT NULL,
    target_entity_id TEXT,
    relation_type TEXT NOT NULL,
    evidence_type TEXT NOT NULL,
    source_locator TEXT,
    snippet TEXT,
    extractor_version TEXT,
    detected_by TEXT NOT NULL,
    confidence_score REAL NOT NULL DEFAULT 0.0,
    observed_at TEXT,
    payload_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE relation_assertions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_entity_type TEXT NOT NULL,
    source_entity_id TEXT NOT NULL,
    target_entity_type TEXT NOT NULL,
    target_entity_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    assertion_status TEXT NOT NULL DEFAULT 'asserted',
    confidence_score REAL NOT NULL DEFAULT 0.0,
    effective_date TEXT,
    detected_by TEXT NOT NULL,
    canonical_evidence_id INTEGER REFERENCES relation_evidence(id),
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE relation_assertion_evidence (
    assertion_id INTEGER NOT NULL REFERENCES relation_assertions(id),
    evidence_id INTEGER NOT NULL REFERENCES relation_evidence(id),
    evidence_role TEXT NOT NULL DEFAULT 'supporting',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (assertion_id, evidence_id)
);

CREATE TABLE doctrine_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dictamen_id TEXT NOT NULL REFERENCES dictamenes(id),
    event_type TEXT NOT NULL,
    related_dictamen_id TEXT,
    assertion_id INTEGER REFERENCES relation_assertions(id),
    effective_date TEXT,
    payload_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_dictamenes_anio ON dictamenes(anio);

CREATE INDEX idx_dictamenes_division ON dictamenes(division_id);

CREATE INDEX idx_dictamenes_criterio ON dictamenes(criterio);

CREATE INDEX idx_atributos_recurso ON atributos_juridicos(recurso_proteccion);

CREATE INDEX idx_enriquecimiento_modelo ON enriquecimiento(modelo_llm);

CREATE INDEX idx_fuentes_tipo_numero ON dictamen_fuentes_legales(tipo_norma, numero);

CREATE INDEX idx_referencias_ref ON dictamen_referencias(dictamen_ref_nombre);

CREATE INDEX idx_etiquetas_etiqueta ON dictamen_etiquetas_llm(etiqueta);

CREATE INDEX idx_relation_evidence_source ON relation_evidence(source_entity_type, source_entity_id);

CREATE INDEX idx_relation_evidence_target ON relation_evidence(target_entity_type, target_entity_id);

CREATE INDEX idx_relation_evidence_relation ON relation_evidence(relation_type, evidence_type);

CREATE INDEX idx_relation_evidence_confidence ON relation_evidence(confidence_score DESC);

CREATE UNIQUE INDEX idx_relation_assertions_unique ON relation_assertions(source_entity_type, source_entity_id, target_entity_type, target_entity_id, relation_type);

CREATE INDEX idx_relation_assertions_status ON relation_assertions(assertion_status, confidence_score DESC);

CREATE INDEX idx_relation_assertions_source ON relation_assertions(source_entity_type, source_entity_id);

CREATE INDEX idx_relation_assertions_target ON relation_assertions(target_entity_type, target_entity_id);

CREATE INDEX idx_relation_assertion_evidence_role ON relation_assertion_evidence(evidence_role);

CREATE INDEX idx_doctrine_events_dictamen ON doctrine_events(dictamen_id, created_at DESC);

CREATE INDEX idx_doctrine_events_assertion ON doctrine_events(assertion_id);

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

CREATE TABLE tabla_boletines (
    id TEXT PRIMARY KEY,
    fecha_inicio TEXT NOT NULL,
    fecha_fin TEXT NOT NULL,
    filtro_boletin INTEGER DEFAULT 1,
    filtro_relevante INTEGER DEFAULT 0,
    filtro_recurso_prot INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE tabla_boletines_entregables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    boletin_id TEXT NOT NULL REFERENCES tabla_boletines(id),
    canal TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    content_text TEXT,
    media_urls TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_boletines_fecha ON tabla_boletines(fecha_inicio, fecha_fin);
CREATE INDEX idx_entregables_boletin ON tabla_boletines_entregables(boletin_id);

CREATE TABLE dictamen_metadata_doctrinal (
    dictamen_id TEXT NOT NULL REFERENCES dictamenes(id),
    pipeline_version TEXT NOT NULL,
    computed_at TEXT NOT NULL DEFAULT (datetime('now')),
    materia_base TEXT,
    tema_canonico TEXT,
    subtema_canonico TEXT,
    rol_principal TEXT NOT NULL,
    roles_secundarios_json TEXT,
    estado_intervencion_cgr TEXT NOT NULL,
    estado_vigencia TEXT NOT NULL,
    reading_role TEXT NOT NULL,
    reading_weight REAL NOT NULL DEFAULT 0,
    currentness_score REAL NOT NULL DEFAULT 0,
    historical_significance_score REAL NOT NULL DEFAULT 0,
    doctrinal_centrality_score REAL NOT NULL DEFAULT 0,
    shift_intensity_score REAL NOT NULL DEFAULT 0,
    family_eligibility_score REAL NOT NULL DEFAULT 0,
    drift_risk_score REAL NOT NULL DEFAULT 0,
    supports_state_current INTEGER NOT NULL DEFAULT 0,
    signals_litigious_matter INTEGER NOT NULL DEFAULT 0,
    signals_abstention INTEGER NOT NULL DEFAULT 0,
    signals_competence_closure INTEGER NOT NULL DEFAULT 0,
    signals_operational_rule INTEGER NOT NULL DEFAULT 0,
    anchor_norma_principal TEXT,
    anchor_dictamen_referido TEXT,
    evidence_summary_json TEXT,
    confidence_global REAL NOT NULL DEFAULT 0,
    manual_review_status TEXT NOT NULL DEFAULT 'auto_pending',
    source_snapshot_version TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (dictamen_id, pipeline_version)
);

CREATE TABLE dictamen_metadata_doctrinal_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dictamen_id TEXT NOT NULL REFERENCES dictamenes(id),
    pipeline_version TEXT NOT NULL,
    evidence_type TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    signal_value TEXT,
    score REAL NOT NULL DEFAULT 0,
    confidence REAL NOT NULL DEFAULT 0,
    source_table TEXT,
    source_locator TEXT,
    snippet TEXT,
    detected_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_metadata_doctrinal_reading ON dictamen_metadata_doctrinal(pipeline_version, reading_role, reading_weight DESC);
CREATE INDEX idx_metadata_doctrinal_currentness ON dictamen_metadata_doctrinal(pipeline_version, currentness_score DESC);
CREATE INDEX idx_metadata_doctrinal_validity ON dictamen_metadata_doctrinal(pipeline_version, estado_vigencia);
CREATE INDEX idx_metadata_doctrinal_dictamen ON dictamen_metadata_doctrinal(dictamen_id, updated_at DESC);
CREATE INDEX idx_metadata_doctrinal_evidence_dictamen ON dictamen_metadata_doctrinal_evidence(dictamen_id, pipeline_version, created_at DESC);
