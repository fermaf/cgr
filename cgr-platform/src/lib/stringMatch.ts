import { D1Database } from '@cloudflare/workers-types';

export function levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    let matrix = Array(b.length + 1).fill(0).map((_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = i;
        for (let j = 1; j <= b.length; j++) {
            let val = b[j - 1] === a[i - 1] ? matrix[j - 1] : Math.min(matrix[j - 1], matrix[j], prev) + 1;
            matrix[j - 1] = prev;
            prev = val;
        }
        matrix[b.length] = prev;
    }
    return matrix[b.length];
}

export function normalizeBase(t: string): string {
    return t.toLowerCase().trim().replace(/[\.\s]+$/, '').trim();
}

export function normalizeDisplay(t: string): string {
    let norm = t.trim().replace(/[\.\s]+$/, '');
    if (norm.length > 0) {
        norm = norm.charAt(0).toUpperCase() + norm.slice(1) + '.';
    }
    return norm;
}

/**
 * Busca en la base de datos un término que sea semánticamente equivalente The term.
 * Retorna el término canónico exacto de la base de datos si existe un match, si no, retorna null.
 */
export async function findSemanticMatch(
    db: D1Database,
    table: string,
    column: string,
    term: string
): Promise<string | null> {
    const base = normalizeBase(term);
    if (base.length < 4) {
        // Para acrónimos muy cortos, exigimos match exacto tras normalizar
        const stmt = db.prepare(`SELECT ${column} FROM ${table} WHERE LOWER(REPLACE(${column}, '.', '')) = ? LIMIT 1`);
        const result = await stmt.bind(base).first<{ [key: string]: string }>();
        return result ? result[column] : null;
    }

    // Buscar todos los términos que compartan los primeros 4 caracteres para acotar búsqueda
    const prefix = base.substring(0, 4);
    const stmt = db.prepare(`SELECT ${column} FROM ${table} WHERE LOWER(${column}) LIKE ?`);
    const { results } = await stmt.bind(`${prefix}%`).all<{ [key: string]: string }>();

    let bestMatch: string | null = null;
    let minDistance = Infinity;

    for (const row of results) {
        const candidate = row[column];
        if (!candidate) continue;
        const candidateBase = normalizeBase(candidate);

        // Límite de diferencia de longitud rápida
        const lenDiff = Math.abs(candidateBase.length - base.length);
        if (lenDiff > 3) continue;

        // Validar que no difieran en su contenido numérico (ej: "Ley 20212" vs "Ley 20282")
        const extractNums = (s: string) => s.replace(/\D/g, '');
        if (extractNums(base) !== extractNums(candidateBase)) continue;

        const dist = levenshtein(base, candidateBase);
        
        let maxDist = 1;
        if (base.length > 10) maxDist = 2; // tolerar 2 errores en palabras largas

        if (dist <= maxDist && dist < minDistance) {
            minDistance = dist;
            bestMatch = candidate;
        }
    }

    // Además: si no hubo match por prefijo (ej: el error está al inicio de la palabra),
    // probamos a buscar si existe igual al original solo con/sin punto.
    if (!bestMatch) {
       const exactStmt = db.prepare(`SELECT ${column} FROM ${table} WHERE LOWER(REPLACE(${column}, '.', '')) = ? LIMIT 1`);
       const res = await exactStmt.bind(base).first<{ [key: string]: string }>();
       if (res) bestMatch = res[column];
    }

    return bestMatch;
}
