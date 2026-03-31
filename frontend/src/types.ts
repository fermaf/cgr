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

export interface RelacionCausa {
    origen_id: string;
    tipo_accion: string;
    created_at?: string;
    titulo?: string | null;
    fecha_documento?: string | null;
    bucket?: "consolida" | "desarrolla" | "ajusta";
}

export interface RelacionEfecto {
    destino_id: string;
    tipo_accion: string;
    titulo?: string | null;
    fecha_documento?: string | null;
    bucket?: "consolida" | "desarrolla" | "ajusta";
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
    genera_jurisprudencia?: boolean;
    relaciones_causa?: RelacionCausa[];
    relaciones_efecto?: RelacionEfecto[];
    fuentes_legales?: FuenteLegalDetail[];
}

export interface FuenteLegalDetail {
    tipo_norma: string | null;
    numero: string | null;
    articulo: string | null;
    extra: string | null;
    year: string | null;
    sector: string | null;
    mentions: number;
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
    volumetria: { anio: number; count: number; jurisprudencia: number; vectorized: number }[];
    transaccional: { estado: string; count: number }[];
    operacional: { en_paso: number; en_source: number; count: number }[];
    semantica: {
        topMaterias: { materia: string; count: number }[];
        impacto: { relevantes: number; recursos: number; jurisprudencia: number };
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

export interface DoctrineKeyDictamen {
    id: string;
    titulo: string;
    fecha: string | null;
    rol_en_linea: 'representativo' | 'núcleo doctrinal' | 'pivote de cambio' | 'apoyo relevante';
}

export interface DoctrineFuenteLegal {
    tipo_norma: string;
    numero: string | null;
    count: number;
}

export interface DoctrineTimeSpan {
    from: string | null;
    to: string | null;
}

export interface DoctrineLineTechnical {
    representative_score?: number;
    cluster_density_score?: number;
    doctrinal_importance_score?: number;
    doctrinal_change_risk_score?: number;
    temporal_spread_years?: number;
    influential_dictamen_ids?: string[];
    query_match_signals?: string[];
}

export interface DoctrineRelationDynamics {
    consolida: number;
    desarrolla: number;
    ajusta: number;
    dominant_bucket: "consolida" | "desarrolla" | "ajusta" | null;
    summary: string;
}

export interface DoctrineCoherenceSignals {
    cluster_cohesion_score: number;
    semantic_dispersion: number;
    outlier_probability: number;
    descriptor_noise_score: number;
    fragmentation_risk: number;
    coherence_status: "cohesiva" | "mixta" | "fragmentada";
    summary: string;
}

export interface DoctrinePivotDictamen {
    id: string;
    titulo: string;
    fecha: string | null;
    signal: 'pivote_de_cambio' | 'hito_de_evolucion';
    reason: string;
}

export interface DoctrineGraphDoctrinalStatus {
    status: "criterio_estable" | "criterio_en_evolucion" | "criterio_fragmentado" | "criterio_tensionado" | "criterio_en_revision";
    summary: string;
    relation_inventory: {
        fortalece: number;
        desarrolla: number;
        ajusta: number;
        limita: number;
        desplaza: number;
    };
    recent_destabilizing_count: number;
}

export interface DoctrineSemanticAnchorDictamen {
    id: string;
    titulo: string;
    fecha: string | null;
    score: number;
    reason: string;
}

export interface DoctrineStructureAdjustment {
    action: 'merge_clusters';
    merged_cluster_count: number;
    merged_representative_ids: string[];
    confidence: number;
    rationale: string;
    note: string;
}

export interface DoctrineLine {
    title: string;
    importance_level: 'low' | 'medium' | 'high';
    change_risk_level: 'low' | 'medium' | 'high';
    summary: string;
    query_match_reason?: string;
    doctrinal_state: 'consolidado' | 'en_evolucion' | 'bajo_tension';
    doctrinal_state_reason: string;
    graph_doctrinal_status?: DoctrineGraphDoctrinalStatus | null;
    reading_priority_reason?: string;
    pivot_dictamen?: DoctrinePivotDictamen | null;
    semantic_anchor_dictamen?: DoctrineSemanticAnchorDictamen | null;
    relation_dynamics: DoctrineRelationDynamics;
    coherence_signals: DoctrineCoherenceSignals;
    representative_dictamen_id: string;
    core_dictamen_ids: string[];
    key_dictamenes: DoctrineKeyDictamen[];
    top_fuentes_legales: DoctrineFuenteLegal[];
    top_descriptores_AI: string[];
    time_span: DoctrineTimeSpan;
    technical?: DoctrineLineTechnical;
    structure_adjustments?: DoctrineStructureAdjustment;
}

export interface DoctrineInsightsOverview {
    totalLines: number;
    dominantTheme: string | null;
    periodCovered: DoctrineTimeSpan;
    materiaEvaluated: string | null;
    query?: string;
    query_interpreted?: string | null;
    query_intent?: {
        intent_label: string;
        confidence: number;
    } | null;
    searchMode?: "semantic" | "lexical_fallback";
}

export interface DoctrineInsightsResponse {
    overview: DoctrineInsightsOverview;
    lines: DoctrineLine[];
}
