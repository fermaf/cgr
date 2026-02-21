import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

export interface Env {
    DICTAMENES_DB: D1Database;
    DICTAMENES_SOURCE: KVNamespace;
    DICTAMENES_PASO: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
    const { request, env } = context;
    const url = new URL(request.url);
    const q = url.searchParams.get('q');
    const anio = url.searchParams.get('anio');
    const division = url.searchParams.get('division'); // ¿ID o Código? Asumimos ID por ahora.
    const materia = url.searchParams.get('materia');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
    const offset = (page - 1) * limit;

    try {
        let query = `
      SELECT 
        d.id, 
        d.numero, 
        d.anio, 
        d.fecha_documento, 
        d.materia, 
        d.resumen, 
        d.division_id,
        cd.nombre as division_nombre
      FROM dictamenes d
      LEFT JOIN cat_divisiones cd ON d.division_id = cd.id
      WHERE 1=1
    `;

        const params: any[] = [];

        if (q) {
            // Lógica de búsqueda básica: LIKE simple (D1 soporta FTS5, pero usamos SQL estándar por ahora).
            query += ` AND (d.materia LIKE ? OR d.resumen LIKE ?)`;
            params.push(`%${q}%`, `%${q}%`);
        }

        if (anio) {
            query += ` AND d.anio = ?`;
            params.push(parseInt(anio));
        }

        if (division) {
            query += ` AND d.division_id = ?`;
            params.push(parseInt(division));
        }

        if (materia) {
            query += ` AND d.materia LIKE ?`;
            params.push(`%${materia}%`);
        }

        // Ordenar por fecha descendente
        query += ` ORDER BY d.fecha_documento DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const { results } = await env.DICTAMENES_DB.prepare(query).bind(...params).all();

        // También obtener el conteo total para la paginación (simplificado por rendimiento).
        // Para conjuntos de datos grandes, el conteo exacto puede ser lento.
        let countQuery = `SELECT COUNT(*) as total FROM dictamenes d WHERE 1=1`;
        const countParams: any[] = [];
        if (q) {
            countQuery += ` AND (d.materia LIKE ? OR d.resumen LIKE ?)`;
            countParams.push(`%${q}%`, `%${q}%`);
        }
        if (anio) {
            countQuery += ` AND d.anio = ?`;
            countParams.push(parseInt(anio));
        }
        if (division) {
            countQuery += ` AND d.division_id = ?`;
            countParams.push(parseInt(division));
        }
        if (materia) {
            countQuery += ` AND d.materia LIKE ?`;
            countParams.push(`%${materia}%`);
        }

        const countResult = await env.DICTAMENES_DB.prepare(countQuery).bind(...countParams).first<{ total: number }>();
        const total = countResult?.total || 0;

        return new Response(JSON.stringify({
            data: results,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60' // Caché por 1 minuto
            }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
