import type { D1Database } from "@cloudflare/workers-types";

export interface Env {
    DICTAMENES_DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
    const { env } = context;

    try {
        // 1. Conteo Total
        const totalResult = await env.DICTAMENES_DB.prepare('SELECT COUNT(*) as total FROM dictamenes').first<{ total: number }>();

        // 2. Última Actualización
        const lastResult = await env.DICTAMENES_DB.prepare('SELECT fecha_documento FROM dictamenes ORDER BY fecha_documento DESC LIMIT 1').first<{ fecha_documento: string }>();

        // 3. Conteo por Año (Top 5)
        const { results: years } = await env.DICTAMENES_DB.prepare('SELECT anio, COUNT(*) as count FROM dictamenes GROUP BY anio ORDER BY anio DESC LIMIT 5').all();

        return new Response(JSON.stringify({
            total: totalResult?.total || 0,
            last_updated: lastResult?.fecha_documento,
            by_year: years
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=600' // Caché de 10 minutos
            }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
