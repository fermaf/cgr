CREATE TABLE IF NOT EXISTS dictamen_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dictamen_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status_from TEXT,
    status_to TEXT,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dictamen_events_id ON dictamen_events(dictamen_id);

INSERT OR IGNORE INTO cat_estado_pipeline (codigo, nombre, descripcion, orden) 
VALUES ('processing', 'Procesando', 'Dictamen siendo analizado por el LLM. Evita colisiones.', 1.5);
