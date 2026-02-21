import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

export interface Env {
    DICTAMENES_DB: D1Database;
    DICTAMENES_SOURCE: KVNamespace;
    DICTAMENES_PASO: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
    const { params, env } = context;
    const id = params.id as string;

    if (!id) {
        return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });
    }

    try {
        // 1. Obtención en paralelo: Metadatos de D1, Fuente de KV y Enriquecimiento de KV
        const [metaResult, sourceRaw, pasoRaw] = await Promise.all([
            // Metadatos desde D1
            env.DICTAMENES_DB.prepare(`
        SELECT 
          d.*,
          e.titulo as titulo_ia, 
          e.resumen as resumen_ia,
          e.analisis as analisis_ia,
          cd.nombre as division_nombre
        FROM dictamenes d
        LEFT JOIN enriquecimiento e ON d.id = e.dictamen_id
        LEFT JOIN cat_divisiones cd ON d.division_id = cd.id
        WHERE d.id = ?
      `).bind(id).first(),

            // JSON original desde KV
            env.DICTAMENES_SOURCE.get(id, { type: 'json' }),

            // JSON enriquecido desde KV (para detalles extra no presentes en D1)
            env.DICTAMENES_PASO.get(id, { type: 'json' })
        ]);

        if (!metaResult) {
            return new Response(JSON.stringify({ error: 'Dictamen not found' }), { status: 404 });
        }

        // 2. Obtener entidades relacionadas (Relaciones muchos-a-muchos)
        // Realizamos esto en un segundo paso; las consultas separadas suelen ser más limpias y rápidas en D1 para listas.
        const [abogados, descriptores, referencias] = await Promise.all([
            env.DICTAMENES_DB.prepare(`
        SELECT a.iniciales 
        FROM dictamen_abogados da
        JOIN cat_abogados a ON da.abogado_id = a.id
        WHERE da.dictamen_id = ?
      `).bind(id).all(),

            env.DICTAMENES_DB.prepare(`
        SELECT des.termino
        FROM dictamen_descriptores dd
        JOIN cat_descriptores des ON dd.descriptor_id = des.id
        WHERE dd.dictamen_id = ?
      `).bind(id).all(),

            env.DICTAMENES_DB.prepare(`
         SELECT dictamen_ref_nombre, year, url
         FROM dictamen_referencias
         WHERE dictamen_id = ?
      `).bind(id).all()
        ]);

        const responseData = {
            meta: {
                ...metaResult,
                abogados: abogados.results.map(r => r.iniciales),
                descriptores: descriptores.results.map(r => r.termino),
                referencias: referencias.results
            },
            raw: sourceRaw || {},
            intelligence: pasoRaw || {}
        };

        return new Response(JSON.stringify(responseData), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300' // Caché de 5 minutos
            }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
