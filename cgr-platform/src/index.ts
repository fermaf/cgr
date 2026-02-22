import { Hono } from 'hono';
import { queryRecords } from './clients/pinecone';
import { getLatestEnrichment, getLatestRawRef, updateDictamenStatus, insertEnrichment, insertDictamenBooleanosLLM, insertDictamenEtiquetaLLM, insertDictamenFuenteLegal } from './storage/d1';
import type { Env, DictamenRaw } from './types';
import { IngestWorkflow } from './workflows/ingestWorkflow';
import { BackfillWorkflow } from './workflows/backfillWorkflow';
import { analyzeDictamen } from './clients/mistral';
import { upsertRecord } from './clients/pinecone';

// Exportamos las clases Workflow para que Cloudflare pueda asociarlas (bind)
export { IngestWorkflow, BackfillWorkflow };

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.text('CGR Platform API'));

// --- ESTADÍSTICAS ---
app.get('/api/v1/stats', async (c) => {
  const db = c.env.DB;
  try {
    const totalRes = await db.prepare("SELECT COUNT(*) as count FROM dictamenes").first<{ count: number }>();
    const lastUpdatedRes = await db.prepare("SELECT MAX(updated_at) as last_updated FROM dictamenes").first<{ last_updated: string }>();
    const byYearRes = await db.prepare(
      "SELECT anio, COUNT(*) as count FROM dictamenes WHERE anio IS NOT NULL GROUP BY anio ORDER BY anio DESC"
    ).all<{ anio: number, count: number }>();

    return c.json({
      total: totalRes?.count ?? 0,
      last_updated: lastUpdatedRes?.last_updated ?? new Date().toISOString(),
      by_year: (byYearRes.results ?? []).map(r => ({ anio: r.anio, count: r.count }))
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- BÚSQUEDA CON FALLBACK ---
// 1. Intenta búsqueda vectorial (Pinecone).
// 2. Si falla, recurre a SQL LIKE en D1.
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
        // Búsqueda Vectorial (Pinecone)
        const pcRes = await queryRecords(c.env, query, limit * 2);
        const matches = pcRes.matches || [];
        const data = matches.map((m: any) => ({
          id: m.id,
          numero: m.id.substring(0, 8),
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
        console.error("Excepción en búsqueda vectorial, recurriendo a SQL (Fallback).", err);
      }
    }

    if (!dataToReturn) {
      // Búsqueda SQL (Fallback)
      let condition = "";
      let binds: any[] = [];

      if (query.trim() !== '') {
        const words = query.trim().split(/\s+/).filter(w => w.length > 2).slice(0, 5);

        if (words.length > 0) {
          const conditions = words.map(() => "(materia LIKE ? OR numero LIKE ?)");
          condition = "WHERE " + conditions.join(" AND ");
          words.forEach(w => {
            const safeW = w.substring(0, 40);
            binds.push(`%${safeW}%`, `%${safeW}%`);
          });
        } else {
          condition = "WHERE materia LIKE ? OR numero LIKE ?";
          const safeQ = query.trim().substring(0, 40);
          binds.push(`%${safeQ}%`, `%${safeQ}%`);
        }
      }

      const totalRes = await db.prepare(`SELECT COUNT(*) as count FROM dictamenes ${condition}`).bind(...binds).first<{ count: number }>();
      totalToReturn = totalRes?.count ?? 0;

      const listQuery = `SELECT id, numero, anio, fecha_documento, materia, estado FROM dictamenes ${condition} ORDER BY fecha_documento DESC LIMIT ? OFFSET ?`;
      const list = await db.prepare(listQuery).bind(...binds, limit, offset).all<any>();

      dataToReturn = (list.results ?? []).map((r: any) => ({
        id: r.id,
        numero: r.numero || r.id.substring(0, 8),
        anio: r.anio || (r.fecha_documento ? parseInt(r.fecha_documento.split('-')[0], 10) : new Date().getFullYear()),
        fecha_documento: r.fecha_documento || '',
        materia: r.materia || 'Sin materia especificada',
        resumen: '',
        es_enriquecido: (r.estado === 'vectorized' || r.estado === 'enriched') ? 1 : 0,
        origen_busqueda: 'literal'
      }));
    }

    return c.json({
      data: dataToReturn,
      meta: { page, limit, total: totalToReturn, totalPages: Math.ceil(totalToReturn / limit) }
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- DETALLE DE DICTAMEN ---
app.get('/api/v1/dictamenes/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  try {
    const doc = await db.prepare("SELECT * FROM dictamenes WHERE id = ?").bind(id).first<any>();
    if (!doc) return c.json({ error: 'Documento no encontrado' }, 404);

    const enrichment = await getLatestEnrichment(db, id);
    const rawRef = await getLatestRawRef(db, id);
    let raw = {};
    if (rawRef) {
      raw = await c.env.DICTAMENES_SOURCE.get(rawRef.raw_key, 'json').catch(() => null) || {};
    }

    return c.json({
      meta: {
        id: doc.id,
        numero: doc.numero || id.substring(0, 8),
        anio: doc.anio || (doc.fecha_documento ? parseInt(doc.fecha_documento.split('-')[0], 10) : null),
        fecha_documento: doc.fecha_documento || '',
        materia: doc.materia || 'Sin materia',
        es_enriquecido: (doc.estado === 'enriched' || doc.estado === 'vectorized') ? 1 : 0,
        estado: doc.estado,
        division_nombre: 'Contraloría General de la República',
      },
      raw: raw,
      extrae_jurisprudencia: enrichment ? {
        titulo: enrichment.titulo,
        resumen: enrichment.resumen,
        analisis: enrichment.analisis,
        etiquetas: enrichment.etiquetas_json ? JSON.parse(enrichment.etiquetas_json) : [],
        genera_jurisprudencia: enrichment.genera_jurisprudencia ?? false
      } : null
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- BÚSQUEDA LEGACY ---
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

// --- ENDPOINTS ADMINISTRATIVOS ---

app.post('/api/v1/dictamenes/crawl/range', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.date_start || !body.date_end) return c.json({ error: 'Missing date_start or date_end' }, 400);
  const instance = await c.env.WORKFLOW.create({
    params: { dateStart: body.date_start, dateEnd: body.date_end, limit: body.limit || 50000 }
  });
  return c.json({ success: true, workflowId: instance.id });
});

app.post('/api/v1/dictamenes/batch-enrich', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const instance = await c.env.BACKFILL_WORKFLOW.create({
    params: {
      batchSize: body.batchSize || parseInt(c.env.BACKFILL_BATCH_SIZE || '50', 10),
      delayMs: body.delayMs || parseInt(c.env.BACKFILL_DELAY_MS || '500', 10)
    }
  });
  return c.json({ success: true, workflowId: instance.id });
});

app.post('/api/v1/dictamenes/:id/sync-vector', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const doc = await db.prepare("SELECT * FROM dictamenes WHERE id = ?").bind(id).first<any>();
  if (!doc) return c.json({ error: 'Documento no encontrado' }, 404);

  const enrichment = await getLatestEnrichment(db, id);
  if (!enrichment) return c.json({ error: 'No hay enriquecimiento para resincronizar' }, 400);

  const textToEmbed = `
      Título: ${enrichment.titulo}
      Resumen: ${enrichment.resumen}
      Análisis: ${enrichment.analisis}
  `.trim();

  try {
    const rawRef = await getLatestRawRef(db, id);
    let rawJson: any = {};
    if (rawRef) rawJson = await c.env.DICTAMENES_SOURCE.get(rawRef.raw_key, 'json');
    const sourceContent = rawJson?._source ?? rawJson?.source ?? rawJson?.raw_data ?? rawJson;

    await upsertRecord(c.env, {
      id: id,
      text: textToEmbed,
      metadata: {
        titulo: enrichment.titulo,
        fecha: String(sourceContent?.fecha_documento || ''),
        ...(enrichment.booleanos_json ? JSON.parse(enrichment.booleanos_json) : {})
      }
    });
    await db.prepare("UPDATE dictamenes SET estado = 'vectorized', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
    return c.json({ success: true, message: 'Vector sync done.' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/v1/dictamenes/:id/re-process', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  const rawRef = await getLatestRawRef(db, id);
  if (!rawRef) return c.json({ error: 'No se encontró referencia KV para este dictamen' }, 404);

  let rawJson = await c.env.DICTAMENES_SOURCE.get(rawRef.raw_key, 'json') as DictamenRaw;
  if (!rawJson) return c.json({ error: 'No se encontró JSON en KV' }, 404);

  try {
    const enrichment = await analyzeDictamen(c.env, rawJson);
    if (!enrichment) throw new Error("Fallo en AI Mistral");

    await insertEnrichment(db, {
      dictamen_id: id,
      titulo: enrichment.extrae_jurisprudencia.titulo,
      resumen: enrichment.extrae_jurisprudencia.resumen,
      analisis: enrichment.extrae_jurisprudencia.analisis,
      etiquetas_json: JSON.stringify(enrichment.extrae_jurisprudencia.etiquetas),
      genera_jurisprudencia_llm: enrichment.genera_jurisprudencia ? 1 : 0,
      booleanos_json: JSON.stringify(enrichment.booleanos),
      fuentes_legales_json: JSON.stringify(enrichment.fuentes_legales),
      model: c.env.MISTRAL_MODEL,
    });

    await insertDictamenBooleanosLLM(db, id, enrichment.booleanos);

    for (const tag of enrichment.extrae_jurisprudencia.etiquetas) {
      await insertDictamenEtiquetaLLM(db, id, tag);
    }
    for (const source of enrichment.fuentes_legales) {
      await insertDictamenFuenteLegal(db, id, source);
    }

    await updateDictamenStatus(db, id, 'enriched');

    const textToEmbed = `
        Título: ${enrichment.extrae_jurisprudencia.titulo}
        Resumen: ${enrichment.extrae_jurisprudencia.resumen}
        Análisis: ${enrichment.extrae_jurisprudencia.analisis}
    `.trim();

    const sourceContent = rawJson._source ?? rawJson.source ?? (rawJson as any).raw_data ?? rawJson;
    await upsertRecord(c.env, {
      id: id,
      text: textToEmbed,
      metadata: {
        titulo: enrichment.extrae_jurisprudencia.titulo,
        fecha: String(sourceContent?.fecha_documento || ''),
        ...enrichment.booleanos
      }
    });

    await updateDictamenStatus(db, id, 'vectorized');
    return c.json({ success: true, message: 'Reproceso integral completado con éxito' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- TRIGGER MANUAL ---
app.post('/ingest/trigger', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const instance = await c.env.WORKFLOW.create({
      params: { search: body.search, limit: body.limit || 10, options: body.options }
    });
    return c.json({ success: true, workflowId: instance.id });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const lookback = parseInt(env.CRAWL_DAYS_LOOKBACK || '3', 10);
    await env.WORKFLOW.create({
      params: { lookbackDays: lookback }
    });
  }
};
