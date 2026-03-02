export interface Division {
    id: number;
    nombre: string;
    codigo: string;
}

export interface Abogado {
    id: number;
    iniciales: string;
}

export interface Descriptor {
    id: number;
    termino: string;
}

export interface DictamenMeta {
    id: string;
    numero: string | null;
    anio: number;
    fecha_documento: string;
    materia: string;
    resumen: string;
    division_id: number;
    division_nombre?: string;
    criterio?: string;
    estado?: 'ingested' | 'enriched' | 'vectorized' | 'error' | null;
    origen_busqueda?: 'vectorial' | 'literal';
}

export interface DictamenDetail extends DictamenMeta {
    titulo_ia?: string;
    resumen_ia?: string;
    analisis_ia?: string;
    abogados?: string[];
    descriptores?: string[];
    referencias?: {
        dictamen_ref_nombre: string;
        year: string;
        url: string;
    }[];
}

export interface DictamenResponse {
    meta: DictamenDetail;
    raw: any; // El JSON original de la fuente
    extrae_jurisprudencia: any; // Enriquecimiento por IA (resumen/análisis/etiquetas)
}

export interface SearchResponse {
    data: DictamenMeta[];
    meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    }
}

export interface StatsResponse {
    total: number;
    last_updated: string;
    by_year: { anio: number; count: number }[];
}

export interface MultidimensionalResponse {
    volumetria: { anio: number; estado: string; count: number }[];
    transaccional: { estado: string; count: number }[];
    operacional: { en_paso: number; en_source: number; count: number }[];
    semantica: {
        topMaterias: { materia: string; count: number }[];
        impacto: { relevantes: number; recursos: number; genera_juris: number };
    };
}

export interface DictamenHistoryRow {
    id: number;
    dictamen_id: string;
    campo_modificado: string;
    valor_anterior: string | null;
    valor_nuevo: string | null;
    fecha_cambio: string;
    origen: string;
}

export interface DictamenHistoryResponse {
    dictamen: { id: string; estado: string; created_at: string; updated_at: string };
    history: DictamenHistoryRow[];
}
export interface MigrationStats {
    total: number;
    migrated: number;
    legacy: number;
    errors: number;
    pending: number;
}

export interface MigrationEvent {
    timestamp: string;
    type: 'skill_event' | 'data_change';
    service?: string;
    workflow?: string;
    code: string;
    message: string;
    matched?: number;
    extra?: string;
}

export interface MigrationInfoResponse {
    stats: MigrationStats;
    evolution: { date: string; count: number; model: string }[];
    events: MigrationEvent[];
    modelTarget: string;
}
