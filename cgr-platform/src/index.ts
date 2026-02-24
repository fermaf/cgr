import { Hono } from 'hono';
import type { Context } from 'hono';
import { queryRecords } from './clients/pinecone';
import { getLatestEnrichment, getLatestRawRef, updateDictamenStatus, insertEnrichment, insertDictamenBooleanosLLM, insertDictamenEtiquetaLLM, insertDictamenFuenteLegal } from './storage/d1';
import type { Env, DictamenRaw } from './types';
import { IngestWorkflow } from './workflows/ingestWorkflow';
import { BackfillWorkflow } from './workflows/backfillWorkflow';
import { KVSyncWorkflow } from './workflows/kvSyncWorkflow';
import { analyzeDictamen } from './clients/mistral';
import { upsertRecord } from './clients/pinecone';
import { fetchDictamenesSearchPage } from './clients/cgr';
import { extractDictamenId } from './lib/ingest';
import { logInfo, logError, setLogLevel } from './lib/log';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isIsoDateYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parsePositiveInt(value: unknown, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

async function readJsonBody(c: Context<{ Bindings: Env }>): Promise<Record<string, unknown>> {
  const body = await c.req.json().catch(() => ({}));
  return (body && typeof body === 'object') ? body : {};
}

// Exportamos las clases Workflow para que Cloudflare pueda asociarlas (bind)
export {
  IngestWorkflow,
  BackfillWorkflow,
  KVSyncWorkflow
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  setLogLevel(c.env.LOG_LEVEL);
  const startedAt = Date.now();
  const reqId = c.req.header('cf-ray') || crypto.randomUUID();
  try {
    await next();
    logInfo('HTTP', {
      reqId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    logError('HTTP_ERROR', error, {
      reqId,
      method: c.req.method,
      path: c.req.path,
      durationMs: Date.now() - startedAt
    });
    throw error;
  }
});

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
    return c.json({ error: errorMessage(e) }, 500);
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
        origen_busqueda: 'literal'
      }));
    }

    return c.json({
      data: dataToReturn,
      meta: { page, limit, total: totalToReturn, totalPages: Math.ceil(totalToReturn / limit) }
    });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
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
      let rawJson = await c.env.DICTAMENES_SOURCE.get(rawRef.raw_key, 'json').catch(() => null);
      if (!rawJson && !rawRef.raw_key.startsWith('dictamen:')) {
        rawJson = await c.env.DICTAMENES_SOURCE.get(`dictamen:${id}`, 'json').catch(() => null);
      }
      raw = rawJson || {};
    }

    return c.json({
      meta: {
        id: doc.id,
        numero: doc.numero || id.substring(0, 8),
        anio: doc.anio || (doc.fecha_documento ? parseInt(doc.fecha_documento.split('-')[0], 10) : null),
        fecha_documento: doc.fecha_documento || '',
        materia: doc.materia || 'Sin materia',
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
    return c.json({ error: errorMessage(e) }, 500);
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
    return c.json({ error: errorMessage(e) }, 500);
  }
});

// --- ENDPOINTS ADMINISTRATIVOS ---

app.post('/api/v1/dictamenes/crawl/range', async (c) => {
  const body = await readJsonBody(c);
  const dateStart = body.date_start;
  const dateEnd = body.date_end;
  if (!isIsoDateYmd(dateStart) || !isIsoDateYmd(dateEnd)) {
    return c.json({ error: 'date_start and date_end must use YYYY-MM-DD format' }, 400);
  }
  if (dateStart > dateEnd) {
    return c.json({ error: 'date_start must be <= date_end' }, 400);
  }
  const limit = parsePositiveInt(body.limit, 50000, 1, 100000);
  const instance = await c.env.WORKFLOW.create({
    params: { dateStart, dateEnd, limit }
  });
  logInfo('INGEST_WORKFLOW_CREATED', { workflowId: instance.id, dateStart, dateEnd, limit });
  return c.json({ success: true, workflowId: instance.id, params: { dateStart, dateEnd, limit } });
});

app.post('/api/v1/dictamenes/batch-enrich', async (c) => {
  const body = await readJsonBody(c);
  const defaultBatch = parsePositiveInt(c.env.BACKFILL_BATCH_SIZE, 50, 1, 500);
  const defaultDelay = parsePositiveInt(c.env.BACKFILL_DELAY_MS, 500, 0, 60000);
  const batchSize = parsePositiveInt(body.batchSize, defaultBatch, 1, 500);
  const delayMs = parsePositiveInt(body.delayMs, defaultDelay, 0, 60000);
  const instance = await c.env.BACKFILL_WORKFLOW.create({
    params: { batchSize, delayMs }
  });
  logInfo('BACKFILL_WORKFLOW_CREATED', { workflowId: instance.id, batchSize, delayMs });
  return c.json({ success: true, workflowId: instance.id, params: { batchSize, delayMs } });
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
    if (rawRef) {
      rawJson = await c.env.DICTAMENES_SOURCE.get(rawRef.raw_key, 'json');
      if (!rawJson && !rawRef.raw_key.startsWith('dictamen:')) {
        rawJson = await c.env.DICTAMENES_SOURCE.get(`dictamen:${id}`, 'json').catch(() => null);
      }
    }
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
    return c.json({ error: errorMessage(e) }, 500);
  }
});

app.post('/api/v1/dictamenes/:id/re-process', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  const rawRef = await getLatestRawRef(db, id);
  if (!rawRef) return c.json({ error: 'No se encontró referencia KV para este dictamen' }, 404);

  let rawJson = await c.env.DICTAMENES_SOURCE.get(rawRef.raw_key, 'json') as DictamenRaw | null;
  if (!rawJson && !rawRef.raw_key.startsWith('dictamen:')) {
    rawJson = await c.env.DICTAMENES_SOURCE.get(`dictamen:${id}`, 'json') as DictamenRaw | null;
  }
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
    return c.json({ error: errorMessage(e) }, 500);
  }
});

// --- TRIGGER MANUAL ---
app.post('/ingest/trigger', async (c) => {
  try {
    const body = await readJsonBody(c);
    const limit = parsePositiveInt(body.limit, 10, 1, 100000);
    const instance = await c.env.WORKFLOW.create({
      params: { search: body.search, limit, options: body.options }
    });
    logInfo('INGEST_TRIGGER_CREATED', { workflowId: instance.id, limit });
    return c.json({ success: true, workflowId: instance.id, params: { search: body.search ?? '', limit } });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

app.post('/api/v1/trigger/kv-sync', async (c) => {
  const params = await readJsonBody(c);
  if (c.env.KV_SYNC_WORKFLOW) {
    const defaultParams = {
      limit: parsePositiveInt(params.limit, 100, 1, 5000),
      delayMs: parsePositiveInt(params.delayMs, 100, 0, 60000)
    };
    const instance = await c.env.KV_SYNC_WORKFLOW.create({ params: defaultParams });
    logInfo('KVSYNC_WORKFLOW_CREATED', { workflowId: instance.id, ...defaultParams });
    return c.json({ status: 'started', instanceId: instance.id, message: 'Workflow de KVSync iniciado', params: defaultParams });
  } else {
    // Si no está registrado en el env
    return c.json({ error: 'Binding KV_SYNC_WORKFLOW no disponible en ambiente.' }, 500);
  }
});

app.post('/api/v1/debug/cgr', async (c) => {
  const body = await readJsonBody(c);
  const lookback = parsePositiveInt(body.lookback, 1, 1, 3650);
  const end = new Date();
  const start = new Date(end.getTime() - lookback * 24 * 60 * 60 * 1000);
  const options = [{
    type: 'date',
    field: 'fecha_documento',
    value: {
      gt: `${start.toISOString().split('T')[0]}T04:00:00.000Z`,
      lt: `${end.toISOString().split('T')[0]}T23:59:59.000Z`
    },
    inner_id: 'av0',
    dir: 'gt'
  }];
  try {
    const res = await fetchDictamenesSearchPage(c.env.CGR_BASE_URL, 0, options);
    return c.json({ success: true, count: res.items.length, first: res.items[0] ? extractDictamenId(res.items[0]) : null });
  } catch (e: any) {
    return c.json({ success: false, error: errorMessage(e) }, 500);
  }
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    try {
      setLogLevel(env.LOG_LEVEL);
      const lookback = parsePositiveInt(env.CRAWL_DAYS_LOOKBACK, 3, 1, 3650);
      const instance = await env.WORKFLOW.create({
        params: { lookbackDays: lookback }
      });
      logInfo('CRON_INGEST_WORKFLOW_CREATED', { workflowId: instance.id, lookbackDays: lookback });
    } catch (error) {
      logError('CRON_INGEST_WORKFLOW_ERROR', error);
      throw error;
    }
  }
};
