import type { DoctrineLine } from "../types";

const DOCTRINE_REPLACEMENTS: Array<[RegExp, string]> = [
    [/ruido semántico/gi, "mezcla de criterios"],
    [/fragmentación doctrinal/gi, "criterio dividido"],
    [/encaje débil/gi, "relación poco clara"],
    [/coherencia semántica/gi, "claridad del criterio"],
    [/estructura doctrinal/gi, "criterio"],
    [/dinámica relacional/gi, "cómo se aplica el criterio"],
    [/coherencia del corpus/gi, "claridad de la línea"],
];

export function simplifyDoctrineLanguage(text: string | null | undefined): string {
    if (!text) return "";

    return DOCTRINE_REPLACEMENTS.reduce((current, [pattern, replacement]) => (
        current.replace(pattern, replacement)
    ), text).replace(/\s+/g, " ").trim();
}

export function doctrinalStateNarrative(state: DoctrineLine["doctrinal_state"]) {
    if (state === "consolidado") return "el criterio se aplica de forma estable";
    if (state === "bajo_tension") return "existen decisiones que aplican el criterio de forma distinta";
    return "el criterio ha cambiado en el tiempo";
}

export function relationPatternNarrative(line: DoctrineLine) {
    if (line.relation_dynamics.dominant_bucket === "consolida") return "predominan decisiones que reafirman este criterio";
    if (line.relation_dynamics.dominant_bucket === "desarrolla") return "predominan decisiones que desarrollan este criterio";
    if (line.relation_dynamics.dominant_bucket === "ajusta") return "predominan decisiones que ajustan este criterio";
    return "no hay un patrón claro";
}

export function groupingHint(line: DoctrineLine) {
    if (line.structure_adjustments?.action === "merge_clusters") return "criterio ya consolidado";
    if (line.coherence_signals.coherence_status === "fragmentada") return "criterio dividido";
    if (line.coherence_signals.outlier_probability >= 0.22) return "hay decisiones con relación poco clara";
    if (line.coherence_signals.descriptor_noise_score >= 0.4) return "conviene ordenar mejor los nombres del criterio";
    return null;
}

export function lineClarityLabel(line: DoctrineLine) {
    if (line.coherence_signals.coherence_status === "fragmentada") return "mezcla de criterios";
    if (line.coherence_signals.coherence_status === "mixta") return "hay dictámenes relacionados, pero no idénticos";
    return "criterio consistente";
}
