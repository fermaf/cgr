import type { D1Database } from "@cloudflare/workers-types";

export interface Env {
    DICTAMENES_DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
    const { params, request, env } = context;
    const tipo = params.tipo as string;
    const url = new URL(request.url);
    const q = url.searchParams.get('q'); // Término de búsqueda opcional

    try {
        if (q) {
            return await handleSearch(env, tipo, q);
        }

        let query = '';

        switch (tipo) {
            case 'divisiones':
                query = 'SELECT id, nombre, codigo FROM cat_divisiones ORDER BY nombre';
                break;
            case 'abogados':
                query = 'SELECT id, iniciales FROM cat_abogados ORDER BY iniciales LIMIT 100';
                break;
            case 'descriptores':
                query = 'SELECT id, termino FROM cat_descriptores ORDER BY termino LIMIT 100';
                break;
            default:
                return new Response(JSON.stringify({ error: 'Ayuda de catálogo: usa divisiones, abogados o descriptores' }), { status: 404 });
        }

        const { results } = await env.DICTAMENES_DB.prepare(query).all();

        return new Response(JSON.stringify(results), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600'
            }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

async function handleSearch(env: Env, tipo: string, q: string) {
    let query = '';
    const cleanQ = q.replace(/[^a-zA-Z0-9 áéíóúñÁÉÍÓÚÑ]/g, ''); // Sanitización básica

    if (tipo === 'descriptores') {
        query = `SELECT id, termino FROM cat_descriptores WHERE termino LIKE ? LIMIT 20`;
    } else if (tipo === 'abogados') {
        query = `SELECT id, iniciales FROM cat_abogados WHERE iniciales LIKE ? LIMIT 20`;
    } else {
        return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
    }

    const { results } = await env.DICTAMENES_DB.prepare(query).bind(`%${cleanQ}%`).all();
    return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
}
