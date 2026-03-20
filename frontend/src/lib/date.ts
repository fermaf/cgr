/**
 * Formatea una fecha de manera robusta, extrayendo el componente YYYY-MM-DD
 * incluso si el string es irregular o contiene horas no deseadas.
 */
export function formatRobustDate(dateStr: string | null | undefined): string {
    if (!dateStr) return 'Fecha no disponible';

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

    return dateStr; // Devolver original como último recurso
}
