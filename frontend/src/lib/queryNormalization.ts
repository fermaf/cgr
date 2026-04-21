const KNOWN_QUERY_CORRECTIONS: Record<string, string> = {
    cofirnza: "confianza",
    confirnza: "confianza",
    confanza: "confianza",
    cofianza: "confianza",
    legitma: "legitima",
    legitmia: "legitima",
    leigitima: "legitima",
    leigtima: "legitima",
    adminsitrativa: "administrativa",
    invalidacon: "invalidacion",
    invaldiacion: "invalidacion",
    subrogasion: "subrogacion",
    renobacion: "renovacion",
};

const CANONICAL_QUERY_TERMS = [
    "confianza",
    "legitima",
    "contrata",
    "administrativa",
    "invalidacion",
    "responsabilidad",
    "sumario",
    "jurisprudencia",
    "doctrinal",
    "doctrina",
    "empleo",
    "publico",
    "municipal",
    "reconsideracion",
    "competencia",
    "abstencion",
];

function normalizeTokenForCompare(value: string) {
    return value
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .trim();
}

function editDistanceWithin(a: string, b: string, maxDistance: number): boolean {
    if (Math.abs(a.length - b.length) > maxDistance) return false;
    const rows = a.length + 1;
    const cols = b.length + 1;
    const dp = Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => (
        row === 0 ? col : col === 0 ? row : 0
    )));

    for (let row = 1; row < rows; row += 1) {
        let rowMin = Number.MAX_SAFE_INTEGER;
        for (let col = 1; col < cols; col += 1) {
            const cost = a[row - 1] === b[col - 1] ? 0 : 1;
            dp[row][col] = Math.min(
                dp[row - 1][col] + 1,
                dp[row][col - 1] + 1,
                dp[row - 1][col - 1] + cost
            );
            rowMin = Math.min(rowMin, dp[row][col]);
        }
        if (rowMin > maxDistance) return false;
    }

    return dp[a.length][b.length] <= maxDistance;
}

function autocorrectQueryToken(token: string) {
    const normalized = normalizeTokenForCompare(token);
    const known = KNOWN_QUERY_CORRECTIONS[normalized];
    if (known) return known;
    if (normalized.length < 5 || /\d/.test(normalized)) return token;

    for (const candidate of CANONICAL_QUERY_TERMS) {
        const maxDistance = candidate.length >= 9 ? 3 : candidate.length >= 7 ? 2 : 1;
        if (editDistanceWithin(normalized, candidate, maxDistance)) {
            return candidate;
        }
    }

    return token;
}

export function normalizeQueryForRequest(query: string) {
    return query
        .trim()
        .split(/\s+/)
        .map((token) => autocorrectQueryToken(token))
        .join(" ");
}
