/**
 * Devuelve una fecha simple en formato YYYY-MM-DD.
 * Elimina horas y offsets para evitar ruido visual en la UI jurídica.
 */
export function formatSimpleDate(dateStr: string | null | undefined, fallback = 'Fecha no disponible'): string {
    if (!dateStr) return fallback;

    // Intenta extraer el patrón YYYY-MM-DD del inicio del string
    const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];

    // Si no calza el inicio, intenta buscarlo en cualquier parte del string
    const fallbackMatch = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
    if (fallbackMatch) return fallbackMatch[1];

    // Si nada funciona, intenta parsear con Date y devolver ISO date part
    try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
            return d.toISOString().split('T')[0];
        }
    } catch (e) {
        // Ignorar error
    }

    return dateStr;
}

export function formatDisplayDate(dateStr: string | null | undefined, fallback = 'Fecha no disponible'): string {
    return formatSimpleDate(dateStr, fallback);
}

export function formatRobustDate(dateStr: string | null | undefined): string {
    return formatSimpleDate(dateStr);
}
