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

export interface RegimenSimulado {
    id: string;
    nombre: string;
    estado: 'activo' | 'desplazado' | 'en_revision' | 'zona_litigiosa' | 'en_transicion';
    pjo_pregunta?: string | null;
    pjo_respuesta?: string | null;
    normas_count?: number;
}

export interface ProblemaJuridicoOperativo {
    id: string;
    regimen_id: string;
    pregunta: string;
    respuesta_sintetica: string;
    categoria?: string;
    estado: 'pendiente' | 'resuelto' | 'error';
}

export type DoctrinalRole =
  | 'nucleo_doctrinal'
  | 'aplicacion'
  | 'aclaracion'
  | 'complemento'
  | 'ajuste'
  | 'limitacion'
  | 'desplazamiento'
  | 'reactivacion'
  | 'cierre_competencial'
  | 'materia_litigiosa'
  | 'abstencion'
  | 'criterio_operativo_actual'
  | 'hito_historico'
  | 'contexto_no_central';

export type DoctrinalValidityState =
  | 'vigente_visible'
  | 'vigente_tensionado'
  | 'vigente_en_revision'
  | 'desplazado_parcialmente'
  | 'desplazado'
  | 'valor_historico'
  | 'indeterminado';

export type CgrInterventionState =
  | 'intervencion_normal'
  | 'intervencion_condicionada'
  | 'intervencion_residual'
  | 'abstencion_visible'
  | 'materia_litigiosa'
  | 'sin_senal_clara';

export type ReadingRole =
  | 'entrada_semantica'
  | 'entrada_doctrinal'
  | 'estado_actual'
  | 'ancla_historica'
  | 'pivote_de_cambio'
  | 'soporte_contextual';

export interface DoctrinalMetadata {
  rol_principal: DoctrinalRole;
  estado_vigencia: DoctrinalValidityState;
  estado_intervencion_cgr: CgrInterventionState;
  reading_role: ReadingRole;
  reading_weight: number;
  currentness_score: number;
  confidence_global: number;
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
  estado?: 'ingested' | 'ingested_importante' | 'ingested_trivial' | 'enriching_ingested' | 'enriching_importante' | 'enriching_trivial' | 'processing' | 'enriched' | 'enriched_pending_vectorization' | 'vectorizing' | 'vectorized' | 'error' | 'error_longitud' | 'error_sin_KV_source' | 'error_quota' | 'error_quota_pinecone' | null;
  origen_busqueda?: 'vectorial' | 'literal';
  genera_jurisprudencia?: boolean;
  relaciones_causa?: RelacionCausa[];
  relaciones_efecto?: RelacionEfecto[];
  fuentes_legales?: FuenteLegalDetail[];
  regimen?: RegimenSimulado | null;
  doctrinal_metadata?: DoctrinalMetadata;
}

export interface FuenteLegalDetail {
    tipo_norma: string | null;
    numero: string | null;
    articulo: string | null;
    extra: string | null;
    year: string | null;
    sector: string | null;
    mentions: number;
    canonical_name?: string | null;
    display_label?: string | null;
    confidence?: "alta" | "media" | "baja";
    review_status?: "alta_confianza" | "media_confianza" | "revisar";
    canonical_key?: string;
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
    volumetria: {
        anio: number;
        count: number;
        jurisprudencia: number;
        pending_enrichment: number;
        enriching: number;
        pending_vectorization: number;
        vectorizing: number;
        vectorized: number;
        errors: number;
    }[];
    transaccional: {
        estado: string | null;
        nombre: string;
        descripcion: string;
        orden: number;
        etapa: string;
        catalogado: 0 | 1;
        count: number;
    }[];
    operacional: { en_paso: number; en_source: number; count: number }[];
    modelos: { modelo: string; count: number }[];
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
    models: { modelo: string; count: number }[];
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
  entry_kind?: "matter_status" | "direct_hit" | "doctrinal_line";
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
  regimen?: RegimenSimulado | null;
  doctrinal_metadata?: DoctrinalMetadata;
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
    query_subtopic?: {
        intent_label: string;
        subtopic_label: string;
        confidence: number;
        matched_terms: string[];
        subtopic_terms: string[];
    } | null;
    query_mode?: {
        mode: "estado_actual_materia" | "linea_historica" | "dictamen_puntual" | "exploratoria";
        confidence: number;
        matched_terms: string[];
        rationale: string;
    } | null;
    searchMode?: "semantic" | "lexical_fallback";
}

export interface DoctrineInsightsSection {
    key: "estado_actual" | "dictamen_directo" | "doctrina_vigente" | "cambio_y_revision" | "contexto_historico";
    title: string;
    summary: string;
    representative_ids: string[];
}

export interface DoctrineInsightsResponse {
    overview: DoctrineInsightsOverview;
    lines: DoctrineLine[];
    sections?: DoctrineInsightsSection[];
}

export interface DoctrineGuidedFocus {
    dictamen_id: string;
    title: string;
    date: string | null;
    materia: string | null;
    criterio: string | null;
    numero: string | null;
    summary: string;
    why_this_focus: string;
    doctrinal_state: string;
    juridical_attributes: string[];
    incoming_relations_count: number;
    outgoing_relations_count: number;
}

export interface DoctrineGuidedMatterStatus {
    dictamen_id: string;
    title: string;
    date: string | null;
    numero: string | null;
    materia: string | null;
    criterio: string | null;
    status_category: "materia_litigiosa" | "abstencion_competencial" | "cambio_de_regimen" | "criterio_operativo_actual";
    status_label: string;
    summary: string;
    why_this_status: string;
    confidence: number;
    matched_terms: string[];
}

export interface DoctrineGuidedFamilyCandidate {
    family_id: string;
    label: string;
    representative_dictamen_id: string;
    representative_title: string;
    representative_date: string | null;
    doctrinal_status: DoctrineGraphDoctrinalStatus["status"];
    doctrinal_status_summary: string;
    relation_summary: string;
    visible_time_span: DoctrineTimeSpan;
    key_dictamenes_count: number;
    why_this_family: string;
    next_step: string;
}

export interface DoctrineGuidedTimelineEvent {
    related_id: string;
    related_title: string;
    related_date: string | null;
    relation_type: string;
    relation_effect: "fortalece" | "desarrolla" | "ajusta" | "limita" | "desplaza";
    relation_label: string;
    direction: "antecedente" | "posterior";
    chronology_hint: string;
}

export interface DoctrineGuidedTemporalRoute {
    root_dictamen_id: string;
    currentness_label: string;
    relation_inventory: DoctrineGraphDoctrinalStatus["relation_inventory"];
    events: DoctrineGuidedTimelineEvent[];
}

export interface DoctrineGuidedOverview {
    query: string;
    query_interpreted?: string | null;
    query_intent?: DoctrineInsightsOverview["query_intent"];
    query_subtopic?: DoctrineInsightsOverview["query_subtopic"];
    searchMode?: "semantic" | "lexical_fallback";
    navigation_mode: "guided" | "guided_family";
    recommended_entry?: "focus_directo" | "estado_actual_materia";
    ambiguity_visible?: boolean;
    total_families?: number;
    family_found?: boolean;
}

export interface DoctrineGuidedResponse {
    overview: DoctrineGuidedOverview;
    focus_directo: DoctrineGuidedFocus | null;
    estado_actual_materia?: DoctrineGuidedMatterStatus | null;
    familias_candidatas: DoctrineGuidedFamilyCandidate[];
    ruta_temporal_inicial: DoctrineGuidedTemporalRoute | null;
    suggested_steps: string[];
}

export interface DoctrineGuidedBreadcrumbStep {
    step: "consulta" | "foco_directo" | "familia";
    label: string;
    dictamen_id?: string;
    family_id?: string;
}

export interface DoctrineGuidedFamilySummary {
    family_id: string;
    label: string;
    representative_dictamen_id: string;
    representative_title: string;
    doctrinal_status: DoctrineGraphDoctrinalStatus["status"];
    doctrinal_status_summary: string;
    visible_time_span: DoctrineTimeSpan;
    why_this_family: string;
    reading_priority_reason: string;
    pivot_dictamen: DoctrinePivotDictamen | null;
}

export interface DoctrineGuidedFamilyTimelineNode {
    dictamen_id: string;
    title: string;
    date: string | null;
    rol_en_linea: DoctrineKeyDictamen["rol_en_linea"];
    summary: string | null;
    juridical_attributes: string[];
    doctrinal_state: string;
    incoming_relations_count: number;
    outgoing_relations_count: number;
}

export interface DoctrineGuidedFamilyRelationEdge {
    source_id: string;
    source_title: string;
    target_id: string;
    target_title: string;
    relation_type: string;
    relation_effect: "fortalece" | "desarrolla" | "ajusta" | "limita" | "desplaza";
    relation_label: string;
    source_date: string | null;
    inside_family: boolean;
}

export interface DoctrineGuidedFamilyResponse {
    overview: DoctrineGuidedOverview;
    breadcrumb: DoctrineGuidedBreadcrumbStep[];
    family: DoctrineGuidedFamilySummary | null;
    timeline: {
        dictamenes: DoctrineGuidedFamilyTimelineNode[];
        relation_edges: DoctrineGuidedFamilyRelationEdge[];
    };
    sibling_families: DoctrineGuidedFamilyCandidate[];
}

export interface Boletin {
    id: string;
    fecha_inicio: string;
    fecha_fin: string;
    filtro_boletin: number;
    filtro_relevante: number;
    filtro_recurso_prot: number;
    status: 'PENDING' | 'MISTRAL_REDUCING' | 'MEDIA_GENERATING' | 'COMPLETED' | 'ERROR';
    original_ids?: string | null;
    synthesis?: string | null;
    created_at: string;
    updated_at: string;
    entregables?: BoletinEntregable[];
}

export interface BoletinEntregable {
    id: number;
    boletin_id: string;
    canal: string;
    status: 'DRAFT' | 'GENERATING_MEDIA' | 'READY';
    content_text: string | null;
    media_urls: string | null;
    prompts?: string | null;
    metadata?: string | null;
    created_at: string;
    updated_at: string;
}
