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
    es_enriquecido: number;
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
    intelligence: any; // El JSON completo del enriquecimiento por IA
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
