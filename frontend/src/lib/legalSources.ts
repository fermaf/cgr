import type { FuenteLegalDetail } from "../types";

type LegalSourceCard = {
    key: string;
    primary: string;
    articleLabels: string[];
    secondary: string | null;
    contextCompleteness: "alta" | "media" | "baja";
    caution: string | null;
    mentions: number;
};

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

function normalizeArticle(value: string | null | undefined): string | null {
    const article = compact(value);
    if (!article) return null;
    const normalized = article
        .replace(/^art(?:[íi]culo)?\.?\s*/i, "")
        .replace(/\s+/g, " ")
        .trim();
    return normalized ? `art. ${normalized}` : null;
}

function looksDubiousSubdivision(value: string | null | undefined): boolean {
    const note = compact(value);
    if (!note) return false;
    return /\binc(?:iso)?\.?\s*(primero|segundo|tercero|cuarto|quinto|[ivx]+|1|2|3|4|5)?\b/i.test(note)
        || /\bletra\b/i.test(note)
        || /\bn[uú]mero\b/i.test(note);
}

function pickContextParts(source: FuenteLegalDetail): string[] {
    return [compact(source.sector), compact(source.year)].filter((value): value is string => Boolean(value));
}

function maybeDisplayNote(source: FuenteLegalDetail, normType: string | null, articleLabel: string | null): string | null {
    const note = compact(source.extra);
    if (!note) return null;
    if (looksDubiousSubdivision(note)) return null;
    if (articleLabel && /^art/i.test(note)) return null;
    if (isSelfIdentifyingNorm(normType) && note.length <= 18) return null;
    return note;
}

function buildPrimaryLabel(source: FuenteLegalDetail, normType: string | null, note: string | null): string {
    const number = compact(source.numero);
    if (normType && number) return `${normType} ${number}`;
    if (normType) return normType;
    if (note) return note;
    return "Referencia normativa";
}

function mergeCompleteness(left: LegalSourceCard["contextCompleteness"], right: LegalSourceCard["contextCompleteness"]) {
    const order: Record<LegalSourceCard["contextCompleteness"], number> = { alta: 3, media: 2, baja: 1 };
    return order[left] >= order[right] ? left : right;
}

export function buildLegalSourceCards(sources: FuenteLegalDetail[]): LegalSourceCard[] {
    const grouped = new Map<string, LegalSourceCard>();

    for (const source of sources) {
        const normType = normalizeNormType(source.tipo_norma);
        const articleLabel = normalizeArticle(source.articulo);
        const note = maybeDisplayNote(source, normType, articleLabel);
        const primary = buildPrimaryLabel(source, normType, note);
        const contextParts = pickContextParts(source);
        const secondary = [note, ...contextParts].filter(Boolean).join(" · ") || null;
        const contextCompleteness: LegalSourceCard["contextCompleteness"] = isSelfIdentifyingNorm(normType)
            ? "alta"
            : contextParts.length >= 2
                ? "alta"
                : contextParts.length === 1 || note
                    ? "media"
                    : "baja";
        const caution = contextCompleteness === "baja"
            ? "Identificación parcial: conviene revisar año y órgano emisor."
            : null;
        const key = [
            normType ?? "",
            compact(source.numero) ?? "",
            compact(source.year) ?? "",
            compact(source.sector) ?? ""
        ].join("::");

        const existing = grouped.get(key);
        if (!existing) {
            grouped.set(key, {
                key,
                primary,
                articleLabels: articleLabel ? [articleLabel] : [],
                secondary,
                contextCompleteness,
                caution,
                mentions: source.mentions
            });
            continue;
        }

        existing.mentions += source.mentions;
        existing.contextCompleteness = mergeCompleteness(existing.contextCompleteness, contextCompleteness);
        existing.caution = existing.contextCompleteness === "baja"
            ? "Identificación parcial: conviene revisar año y órgano emisor."
            : null;
        if (articleLabel && !existing.articleLabels.includes(articleLabel)) {
            existing.articleLabels.push(articleLabel);
        }
        if (!existing.secondary && secondary) {
            existing.secondary = secondary;
        }
    }

    return [...grouped.values()]
        .map((entry) => ({
            ...entry,
            articleLabels: entry.articleLabels.sort((left, right) => left.localeCompare(right, "es")),
        }))
        .sort((left, right) => (
            right.mentions - left.mentions
            || left.primary.localeCompare(right.primary, "es")
        ));
}
