-- Migración 010: Review Workflow — matters, drafts, reviews, audit
-- Objetivo: Implementar el human-review gate del MVP legal

-- Estados del matter (catálogo)
CREATE TABLE IF NOT EXISTS cat_estado_matter (
    codigo TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    orden INTEGER NOT NULL,
    etapa TEXT NOT NULL -- 'intake' | 'drafting' | 'review' | 'approval' | 'delivery'
);

INSERT OR IGNORE INTO cat_estado_matter (codigo, nombre, descripcion, orden, etapa) VALUES
('intake',           'Intake completado',       'Formulario de intake completado, pendiente de borrador',    10, 'intake'),
('drafting',         'Generando borrador',      'AI trabajando en el borrador de respuesta',               20, 'drafting'),
('draft_generated',  'Borrador generado',       'Borrador listo, en espera de revisión humana',            30, 'review'),
('pending_review',   'En revisión humana',      'Revisor activo revisando el borrador',                    35, 'review'),
('revision_requested','Revisión solicitada',    'Revisor solicitó cambios al borrador',                     40, 'review'),
('approved',         'Aprobado',                 'Borrador aprobado, pendiente de confirmación de envío',   50, 'approval'),
('ready_to_send',    'Listo para enviar',       'Confirmado para envío al organismo solicitante',          60, 'delivery'),
('sent',             'Enviado',                  'Respuesta enviada al organismo solicitante',               70, 'delivery'),
('archived',         'Archivado',               'Matter archivado o descartado',                            80, 'delivery');

-- Matters (expedientes legales)
CREATE TABLE IF NOT EXISTS matters (
    id TEXT PRIMARY KEY,
    estado TEXT NOT NULL DEFAULT 'intake'
        REFERENCES cat_estado_matter(codigo),
    tipo_solicitud TEXT NOT NULL, -- 'interna' | 'externa'
    organismo_origen TEXT NOT NULL,
    persona_solicitante TEXT NOT NULL,
    correo_solicitante TEXT,
    materia_legal TEXT NOT NULL,
    urgencia TEXT NOT NULL, -- 'baja' | 'media' | 'alta' | 'urgente'
    antecedentes_json TEXT, -- JSON libre con antecedentes
    documentos_ref_json TEXT, -- JSON array de referencias documentales
    tipo_producto TEXT NOT NULL, -- enum de producto esperado
    observaciones_intake TEXT,
    created_by TEXT NOT NULL, -- agente o usuario que creó
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    locked_by TEXT, -- agentId o userId si está en procesamiento
    locked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_matters_estado ON matters(estado);
CREATE INDEX IF NOT EXISTS idx_matters_urgencia ON matters(urgencia);
CREATE INDEX IF NOT EXISTS idx_matters_created_at ON matters(created_at DESC);

-- Borradores (versions)
CREATE TABLE IF NOT EXISTS matter_drafts (
    id TEXT PRIMARY KEY,
    matter_id TEXT NOT NULL REFERENCES matters(id),
    version INTEGER NOT NULL DEFAULT 1,
    contenido TEXT NOT NULL DEFAULT '',
    fuentes_json TEXT, -- array de fuentes citadas
    razonamiento_json TEXT, -- pasos de razonamiento
    notas_agente_json TEXT, -- notas internas del agente
    status TEXT NOT NULL DEFAULT 'generating', -- 'generating' | 'generated' | 'failed' | 'superseded'
    error_mensaje TEXT,
    tokens_usados INTEGER,
    modelo_usado TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_drafts_matter_version ON matter_drafts(matter_id, version);
CREATE INDEX IF NOT EXISTS idx_drafts_matter ON matter_drafts(matter_id, created_at DESC);

-- Decisiones de revisión
CREATE TABLE IF NOT EXISTS matter_review_decisions (
    id TEXT PRIMARY KEY,
    matter_id TEXT NOT NULL REFERENCES matters(id),
    draft_id TEXT NOT NULL REFERENCES matter_drafts(id),
    tipo TEXT NOT NULL, -- 'approve' | 'request_revision' | 'escalate'
    observacion TEXT,
    revisor_nombre TEXT, -- nombre de quien decide
    revisor_id TEXT, -- agentId o userId
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_matter ON matter_review_decisions(matter_id, created_at DESC);

-- Historial de auditoría
CREATE TABLE IF NOT EXISTS matter_audit_events (
    id TEXT PRIMARY KEY,
    matter_id TEXT NOT NULL REFERENCES matters(id),
    event_type TEXT NOT NULL,
    actor TEXT, -- 'system' | 'agent:<id>' | 'user:<id>'
    metadata_json TEXT, -- JSON con datos adicionales
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_matter ON matter_audit_events(matter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_type ON matter_audit_events(event_type, created_at DESC);
