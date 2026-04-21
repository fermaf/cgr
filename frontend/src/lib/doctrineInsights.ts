import type { DoctrineGuidedFamilyResponse, DoctrineGuidedResponse, DoctrineInsightsResponse } from "../types";
import { normalizeQueryForRequest } from "./queryNormalization";

export const DOCTRINE_SEARCH_EXAMPLES = [
    "contrata confianza legítima",
    "responsabilidad administrativa sumario",
    "invalidación administrativa plazo",
    "acoso laboral sector público"
];

const DEMO_RESPONSE: DoctrineInsightsResponse = {
    overview: {
        totalLines: 2,
        dominantTheme: "confianza legítima en empleo a contrata",
        periodCovered: {
            from: "2018-01-12",
            to: "2025-03-05"
        },
        materiaEvaluated: "Empleo público",
        query: "contrata confianza legítima",
        query_interpreted: "confianza legítima empleo a contrata no renovación",
        query_intent: {
            intent_label: "confianza legítima",
            confidence: 0.82
        },
        query_subtopic: {
            intent_label: "confianza legítima",
            subtopic_label: "no renovación de contrata",
            confidence: 0.74,
            matched_terms: ["no renovación", "contrata"],
            subtopic_terms: ["no renovación", "término contrata"]
        },
        query_mode: {
            mode: "exploratoria",
            confidence: 0.62,
            matched_terms: [],
            rationale: "La consulta combina un problema jurisprudencial amplio con una necesidad de navegación profesional."
        },
        searchMode: "semantic"
    },
    sections: [
        {
            key: "doctrina_vigente",
            title: "Jurisprudencia vigente o dominante",
            summary: "Líneas que todavía organizan la lectura principal de la materia.",
            representative_ids: ["012345N21", "034567N20"]
        }
    ],
    lines: [
        {
            title: "Confianza legítima",
            importance_level: "high",
            change_risk_level: "medium",
            summary: "Línea jurisprudencial sobre confianza legítima en empleo a contrata, con referencias reiteradas a Ley 18.834 y continuidad jurídica en el período consultado.",
            query_match_reason: "Esta línea aparece porque concentra dictámenes sobre contrata y confianza legítima dentro del empleo público.",
            doctrinal_state: "en_evolucion",
            doctrinal_state_reason: "La línea evoluciona en el tiempo y su hito más visible es 045612N22.",
            graph_doctrinal_status: {
                status: "criterio_en_evolucion",
                summary: "El criterio mantiene una base reconocible, pero ha sido desarrollado o ajustado en el tiempo.",
                relation_inventory: { fortalece: 4, desarrolla: 2, ajusta: 1, limita: 0, desplaza: 0 },
                recent_destabilizing_count: 1
            },
            reading_priority_reason: "Se prioriza la lectura de los dictámenes que siguen siendo retomados por decisiones posteriores de la línea.",
            pivot_dictamen: {
                id: "045612N22",
                titulo: "Confirmación de criterio en término de contrata",
                fecha: "2022-11-04",
                signal: "hito_de_evolucion",
                reason: "Aparece como hito reciente que consolida o proyecta la línea."
            },
            relation_dynamics: {
                consolida: 4,
                desarrolla: 2,
                ajusta: 1,
                dominant_bucket: "consolida",
                summary: "Predominan dictámenes que aplican o confirman criterio previo, lo que sugiere una línea con apoyo jurisprudencial acumulado."
            },
            coherence_signals: {
                cluster_cohesion_score: 0.74,
                semantic_dispersion: 0.26,
                outlier_probability: 0.11,
                descriptor_noise_score: 0.22,
                fragmentation_risk: 0.19,
                coherence_status: "cohesiva",
                summary: "La línea muestra cohesión suficiente entre sus dictámenes visibles."
            },
            representative_dictamen_id: "012345N21",
            core_dictamen_ids: ["012345N21", "067890N19"],
            key_dictamenes: [
                {
                    id: "012345N21",
                    titulo: "Confianza legítima en renovaciones sucesivas",
                    fecha: "2021-08-12",
                    rol_en_linea: "representativo"
                },
                {
                    id: "067890N19",
                    titulo: "Alcance de la confianza legítima en contratas",
                    fecha: "2019-03-14",
                    rol_en_linea: "núcleo doctrinal"
                },
                {
                    id: "045612N22",
                    titulo: "Confirmación de criterio en término de contrata",
                    fecha: "2022-11-04",
                    rol_en_linea: "pivote de cambio"
                }
            ],
            top_fuentes_legales: [
                { tipo_norma: "Ley", numero: "18.834", count: 4 }
            ],
            top_descriptores_AI: ["confianza legítima", "contrata", "renovación"],
            time_span: {
                from: "2018-01-12",
                to: "2025-03-05"
            },
            technical: {
                doctrinal_importance_score: 0.81,
                doctrinal_change_risk_score: 0.36,
                cluster_density_score: 0.76,
                temporal_spread_years: 7
            }
        },
        {
            title: "Término de contrata y motivación del acto",
            importance_level: "medium",
            change_risk_level: "low",
            summary: "Línea jurisprudencial sobre término de contrata con foco en motivación suficiente del acto administrativo y revisión de legalidad en empleo público.",
            query_match_reason: "Se prioriza por coincidencia alta con descriptores AI y por la reiteración de la normativa estatutaria aplicable.",
            doctrinal_state: "consolidado",
            doctrinal_state_reason: "La línea muestra un núcleo estable y señales de reiteración consistentes.",
            graph_doctrinal_status: {
                status: "criterio_estable",
                summary: "Predominan decisiones posteriores que mantienen o fortalecen el criterio visible.",
                relation_inventory: { fortalece: 3, desarrolla: 1, ajusta: 0, limita: 0, desplaza: 0 },
                recent_destabilizing_count: 0
            },
            reading_priority_reason: "Se prioriza la lectura de los dictámenes que mejor concentran el criterio visible.",
            pivot_dictamen: null,
            relation_dynamics: {
                consolida: 3,
                desarrolla: 1,
                ajusta: 0,
                dominant_bucket: "consolida",
                summary: "Predominan dictámenes que aplican o confirman criterio previo, lo que sugiere una línea con apoyo jurisprudencial acumulado."
            },
            coherence_signals: {
                cluster_cohesion_score: 0.63,
                semantic_dispersion: 0.37,
                outlier_probability: 0.21,
                descriptor_noise_score: 0.33,
                fragmentation_risk: 0.34,
                coherence_status: "mixta",
                summary: "La línea mantiene un eje jurisprudencial visible, pero algunos dictámenes tratan temas relacionados y no exactamente idénticos."
            },
            representative_dictamen_id: "034567N20",
            core_dictamen_ids: ["034567N20"],
            key_dictamenes: [
                {
                    id: "034567N20",
                    titulo: "Motivación del cese de contrata en empleo público",
                    fecha: "2020-07-18",
                    rol_en_linea: "representativo"
                },
                {
                    id: "098765N23",
                    titulo: "Exigencia reforzada de fundamentación en no renovación",
                    fecha: "2023-04-09",
                    rol_en_linea: "apoyo relevante"
                }
            ],
            top_fuentes_legales: [
                { tipo_norma: "Ley", numero: "18.834", count: 3 }
            ],
            top_descriptores_AI: ["cese de contrata", "motivación", "empleo público"],
            time_span: {
                from: "2020-07-18",
                to: "2023-04-09"
            },
            technical: {
                doctrinal_importance_score: 0.61,
                doctrinal_change_risk_score: 0.19,
                cluster_density_score: 0.58,
                temporal_spread_years: 3
            }
        }
    ]
};

const DOCTRINE_CACHE_PREFIX = "indubia:doctrine-insights:v2";

function buildDoctrineCacheKey(query: string, limit: number) {
    return `${DOCTRINE_CACHE_PREFIX}:q:${normalizeQueryForRequest(query) || "__home__"}:l:${limit}`;
}

export function readCachedDoctrineInsights(query: string, limit = 4): { mode: "live" | "demo"; data: DoctrineInsightsResponse } | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.sessionStorage.getItem(buildDoctrineCacheKey(query, limit));
        if (!raw) return null;
        return JSON.parse(raw) as { mode: "live" | "demo"; data: DoctrineInsightsResponse };
    } catch {
        return null;
    }
}

function writeCachedDoctrineInsights(query: string, limit: number, payload: { mode: "live" | "demo"; data: DoctrineInsightsResponse }) {
    if (typeof window === "undefined") return;
    try {
        window.sessionStorage.setItem(buildDoctrineCacheKey(query, limit), JSON.stringify(payload));
    } catch {
        // noop
    }
}

export function buildDoctrineFallback(query = "") {
    return {
        mode: "demo" as const,
        data: {
            ...DEMO_RESPONSE,
            overview: {
                ...DEMO_RESPONSE.overview,
                dominantTheme: "Confianza legítima",
                materiaEvaluated: "Jurisprudencia sobre Confianza legítima",
                query: query.trim() || undefined
            }
        }
    };
}

export async function fetchDoctrineInsights(query: string, limit = 4) {
    const trimmed = query.trim();
    const normalized = normalizeQueryForRequest(trimmed);
    const versionTag = "web-v2";
    const endpoint = trimmed.length > 0
        ? `/api/v1/insights/doctrine-search?q=${encodeURIComponent(normalized)}&limit=${limit}&client=${versionTag}`
        : `/api/v1/insights/doctrine-lines?limit=${limit}&client=${versionTag}`;

    try {
        const response = await fetch(endpoint);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json() as DoctrineInsightsResponse;
        writeCachedDoctrineInsights(trimmed, limit, {
            mode: "live",
            data
        });
        return {
            mode: "live" as const,
            data
        };
    } catch {
        if (trimmed.length > 0) {
            throw new Error("DOCTRINE_INSIGHTS_SEARCH_FAILED");
        }

        return {
            ...buildDoctrineFallback(trimmed)
        };
    }
}

export async function fetchDoctrineGuided(query: string, limit = 4) {
    const trimmed = query.trim();
    const normalized = normalizeQueryForRequest(trimmed);
    const response = await fetch(`/api/v1/insights/doctrine-guided?q=${encodeURIComponent(normalized)}&limit=${limit}`);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return await response.json() as DoctrineGuidedResponse;
}

export async function fetchDoctrineGuidedFamily(query: string, familyId: string, limit = 4) {
    const trimmed = query.trim();
    const normalized = normalizeQueryForRequest(trimmed);
    const response = await fetch(
        `/api/v1/insights/doctrine-guided/family?q=${encodeURIComponent(normalized)}&family_id=${encodeURIComponent(familyId)}&limit=${limit}`
    );
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return await response.json() as DoctrineGuidedFamilyResponse;
}
