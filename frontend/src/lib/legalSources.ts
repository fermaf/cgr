import type { FuenteLegalDetail } from "../types";

function compact(value: string | null | undefined): string | null {
    if (!value) return null;
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length > 0 ? normalized : null;
}

function titleCaseLabel(value: string): string {
    return value
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function normalizeNormType(value: string | null | undefined): string | null {
    const normalized = compact(value);
    if (!normalized) return null;

    const upper = normalized.toUpperCase();
    if (upper === "DL") return "DL";
    if (upper === "DFL") return "DFL";
    if (upper === "DS") return "DS";
    if (upper === "DTO") return "Decreto";
    if (upper === "CPR") return "Constitución";

    const lower = normalized.toLowerCase();
    if (lower === "ley") return "Ley";
    if (lower.includes("constitución")) return "Constitución";
    if (lower.includes("oficio circular")) return "Oficio Circular";
    if (lower.includes("resolución")) return "Resolución";
    if (lower === "res") return "Resolución";

    return titleCaseLabel(normalized);
}

function isSelfIdentifyingNorm(normType: string | null): boolean {
    if (!normType) return false;
    const normalized = normType.toLowerCase();
    return normalized === "constitución" || normalized === "ley" || normalized === "dl";
}

function pickContextParts(source: FuenteLegalDetail): string[] {
    const parts = [compact(source.sector), compact(source.year)].filter((value): value is string => Boolean(value));
    return parts;
}

export function describeLegalSource(source: FuenteLegalDetail) {
    const normType = normalizeNormType(source.tipo_norma);
    const number = compact(source.numero);
    const article = compact(source.articulo);
    const note = compact(source.extra);
    const contextParts = pickContextParts(source);
    const primary = [normType, number].filter(Boolean).join(" ") || note || "Referencia normativa";
    const secondary = [note, ...contextParts].filter(Boolean).join(" · ") || null;
    const contextCompleteness = isSelfIdentifyingNorm(normType)
        ? "alta"
        : contextParts.length >= 2
            ? "alta"
            : contextParts.length === 1 || note
                ? "media"
                : "baja";

    return {
        primary,
        articleLabel: article ? `art. ${article}` : null,
        secondary,
        contextCompleteness,
        caution: contextCompleteness === "baja"
            ? "Identificación parcial: conviene revisar año y órgano emisor."
            : null
    } as const;
}
