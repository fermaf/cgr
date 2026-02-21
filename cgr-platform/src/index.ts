import { Hono } from 'hono';
import { queryRecords } from './clients/pinecone';
import { getLatestEnrichment } from './storage/d1';
import type { Env } from './types';
import { IngestWorkflow } from './workflows/ingestWorkflow';

// Export Workflow class so it can be bound
export { IngestWorkflow };

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.text('CGR Platform API'));

// --- STATS ENDPOINT ---
app.get('/api/v1/stats', async (c) => {
  const db = c.env.DB;
  try {
    const totalRes = await db.prepare("SELECT COUNT(*) as count FROM dictamen").first<{ count: number }>();
    const lastUpdatedRes = await db.prepare("SELECT MAX(updated_at) as last_updated FROM dictamen").first<{ last_updated: string }>();
    const byYearRes = await db.prepare("SELECT strftime('%Y', fecha_documento) as anio, COUNT(*) as count FROM dictamen WHERE fecha_documento IS NOT NULL GROUP BY anio ORDER BY anio DESC").all<{ anio: string, count: number }>();

    return c.json({
      total: totalRes?.count ?? 0,
      last_updated: lastUpdatedRes?.last_updated ?? new Date().toISOString(),
      by_year: (byYearRes.results ?? []).map(r => ({ anio: parseInt(r.anio, 10), count: r.count })).filter(r => !isNaN(r.anio))
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- LIST / SEARCH ENDPOINT ---
app.get('/api/v1/dictamenes', async (c) => {
  const query = c.req.query('q') || '';
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = 10;
  const offset = (page - 1) * limit;
  const db = c.env.DB;

  try {
    let dataToReturn: any[] | null = null;
    let totalToReturn = 0;

    if (query.trim() !== '') {
      try {
        // Pinecone Search
        const pcRes = await queryRecords(c.env, query, limit * 2);
        const matches = pcRes.matches || [];
        const data = matches.map((m: any) => ({
          id: m.id,
          numero: m.id.substring(0, 8), // aproximación si no hay número en metadata
          anio: parseInt(m.metadata?.fecha?.split('-')?.[0] || '2024', 10),
          fecha_documento: m.metadata?.fecha || '',
          materia: m.metadata?.titulo || m.metadata?.materia || 'Materia Reservada o Sin título',
          resumen: m.metadata?.analisis || m.metadata?.resumen || '',
          es_enriquecido: 1,
          origen_busqueda: 'vectorial'
        }));

        if (data.length > 0) {
          dataToReturn = data.slice(0, limit);
          totalToReturn = data.length;
        }
      } catch (err) {
        console.error("Vector search exception, falling back to SQL.", err);
      }
    }

    if (!dataToReturn) {
      // D1 List (Fallback o default)
      let condition = "";
      let binds: any[] = [];

      if (query.trim() !== '') {
        const words = query.trim().split(/\s+/).filter(w => w.length > 2).slice(0, 5);

        if (words.length > 0) {
          const conditions = words.map(() => "(materia LIKE ? OR n_dictamen LIKE ?)");
          condition = "WHERE " + conditions.join(" AND ");

          words.forEach(w => {
            const safeW = w.substring(0, 40);
            binds.push(`%${safeW}%`, `%${safeW}%`);
          });
        } else {
          condition = "WHERE materia LIKE ? OR n_dictamen LIKE ?";
          const safeQ = query.trim().substring(0, 40);
          binds.push(`%${safeQ}%`, `%${safeQ}%`);
        }
      }

      const totalRes = await db.prepare(`SELECT COUNT(*) as count FROM dictamen ${condition}`).bind(...binds).first<{ count: number }>();
      totalToReturn = totalRes?.count ?? 0;

      const listQuery = `SELECT id, n_dictamen, fecha_documento, materia, estado FROM dictamen ${condition} ORDER BY fecha_documento DESC LIMIT ? OFFSET ?`;
      const list = await db.prepare(listQuery).bind(...binds, limit, offset).all<any>();

      dataToReturn = (list.results ?? []).map(r => {
        const es_enriquecido = r.estado === 'vectorized' || r.estado === 'enriched' ? 1 : 0;
        return {
          id: r.id,
          numero: r.n_dictamen || r.id.substring(0, 8),
          anio: r.fecha_documento ? parseInt(r.fecha_documento.split('-')[0], 10) : new Date().getFullYear(),
          fecha_documento: r.fecha_documento || '',
          materia: r.materia || 'Sin materia especificada',
          resumen: '',
          es_enriquecido,
          origen_busqueda: 'literal'
        };
      });
    }

    return c.json({
      data: dataToReturn,
      meta: { page, limit, total: totalToReturn, totalPages: Math.ceil(totalToReturn / limit) }
    });

  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- DETAIL ENDPOINT ---
app.get('/api/v1/dictamenes/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  try {
    const doc = await db.prepare("SELECT * FROM dictamen WHERE id = ?").bind(id).first<any>();
    if (!doc) return c.json({ error: 'Documento no encontrado' }, 404);

    const enrichment = await getLatestEnrichment(db, id);
    let raw = await c.env.DICTAMENES_SOURCE.get(id, 'json').catch(() => null) || {};

    return c.json({
      meta: {
        id: doc.id,
        numero: doc.n_dictamen || id.substring(0, 8),
        anio: doc.fecha_documento ? parseInt(doc.fecha_documento.split('-')[0], 10) : new Date().getFullYear(),
        fecha_documento: doc.fecha_documento || '',
        materia: doc.materia || 'Sin materia',
        es_enriquecido: (doc.estado === 'enriched' || doc.estado === 'vectorized') ? 1 : 0,
        abogados: doc.abogados ? doc.abogados.split(',') : [],
        descriptores: doc.descriptores ? doc.descriptores.split(',') : (enrichment?.etiquetas_json ? JSON.parse(enrichment.etiquetas_json) : []),
        division_nombre: doc.origen || 'Contraloría General de la República',
      },
      raw: raw,
      intelligence: enrichment ? {
        extrae_jurisprudencia: {
          resumen: enrichment.resumen,
          analisis: enrichment.analisis,
          titulo: enrichment.titulo,
          etiquetas: enrichment.etiquetas_json ? JSON.parse(enrichment.etiquetas_json) : []
        }
      } : null
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- LEGACY SEARCH ---
app.get('/search', async (c) => {
  const query = c.req.query('q');
  if (!query) return c.json({ error: 'Missing q parameter' }, 400);

  const limit = Number(c.req.query('limit')) || 10;

  try {
    const results = await queryRecords(c.env, query, limit);
    return c.json(results);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- WORKFLOW TRIGGER ---
app.post('/ingest/trigger', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const search = body.search;

    const instance = await c.env.WORKFLOW.create({
      params: {
        search: search,
        limit: body.limit || 10,
        options: body.options
      }
    });

    return c.json({
      success: true,
      workflowId: instance.id,
      message: 'Ingest workflow triggered'
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

export default app;
