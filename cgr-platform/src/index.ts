import { Hono } from 'hono';
import type { Context } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { queryRecords, upsertRecord } from './clients/pinecone';
import { getLatestEnrichment, getLatestRawRef, updateDictamenStatus, insertEnrichment, insertDictamenBooleanosLLM, insertDictamenEtiquetaLLM, insertDictamenFuenteLegal } from './storage/d1';
import type { Env, DictamenRaw } from './types';
import { IngestWorkflow } from './workflows/ingestWorkflow';
import { BackfillWorkflow } from './workflows/backfillWorkflow';
import { KVSyncWorkflow } from './workflows/kvSyncWorkflow';
import { analyzeDictamen } from './clients/mistral';
import { fetchDictamenesSearchPage } from './clients/cgr';
import { ingestDictamen, extractDictamenId } from './lib/ingest';
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

function parseOptionalInt(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTruthy(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

type AnalyticsHeatmapRow = {
  year: number | null;
  tipo_norma: string;
  numero: string;
  total_refs: number;
  total_dictamenes: number;
  last_source_date: string | null;
};

type AnalyticsTrendRow = {
  year: number | null;
  materia: string;
  total_dictamenes: number;
  relevantes: number;
  last_source_date: string | null;
};

type LineageEdgeRow = {
  from_id: string;
  to_id: string;
  relation_type: string;
  relation_year: string | null;
  relation_url: string | null;
};

type LineageNodeRow = {
  id: string;
  numero: string | null;
  anio: number | null;
  fecha_documento: string | null;
  materia: string | null;
  estado: string | null;
};

async function getLatestSnapshotDate(db: D1Database, tableName: string): Promise<string | null> {
  const row = await db.prepare(`SELECT MAX(snapshot_date) AS snapshot_date FROM ${tableName}`).first<{ snapshot_date: string | null }>();
  return row?.snapshot_date ?? null;
}

async function queryHeatmapLive(
  db: D1Database,
  yearFrom: number | null,
  yearTo: number | null,
  limit: number
): Promise<AnalyticsHeatmapRow[]> {
  const res = await db.prepare(`
    SELECT
      d.anio AS year,
      COALESCE(NULLIF(TRIM(f.tipo_norma), ''), 'Desconocido') AS tipo_norma,
      COALESCE(NULLIF(TRIM(f.numero), ''), '-') AS numero,
      COUNT(*) AS total_refs,
      COUNT(DISTINCT d.id) AS total_dictamenes,
      MAX(COALESCE(d.fecha_documento, d.created_at)) AS last_source_date
    FROM dictamen_fuentes_legales f
    INNER JOIN dictamenes d ON d.id = f.dictamen_id
    WHERE (? IS NULL OR d.anio >= ?)
      AND (? IS NULL OR d.anio <= ?)
    GROUP BY d.anio, COALESCE(NULLIF(TRIM(f.tipo_norma), ''), 'Desconocido'), COALESCE(NULLIF(TRIM(f.numero), ''), '-')
    ORDER BY total_refs DESC, total_dictamenes DESC
    LIMIT ?
  `).bind(yearFrom, yearFrom, yearTo, yearTo, limit).all<AnalyticsHeatmapRow>();
  return res.results ?? [];
}

async function queryTopicTrendsLive(
  db: D1Database,
  yearFrom: number | null,
  yearTo: number | null,
  limit: number
): Promise<AnalyticsTrendRow[]> {
  const res = await db.prepare(`
    SELECT
      d.anio AS year,
      COALESCE(NULLIF(TRIM(d.materia), ''), 'Sin materia') AS materia,
      COUNT(*) AS total_dictamenes,
      SUM(CASE WHEN COALESCE(a.es_relevante, 0) = 1 THEN 1 ELSE 0 END) AS relevantes,
      MAX(COALESCE(d.fecha_documento, d.created_at)) AS last_source_date
    FROM dictamenes d
    LEFT JOIN atributos_juridicos a ON a.dictamen_id = d.id
    WHERE (? IS NULL OR d.anio >= ?)
      AND (? IS NULL OR d.anio <= ?)
    GROUP BY d.anio, COALESCE(NULLIF(TRIM(d.materia), ''), 'Sin materia')
    ORDER BY total_dictamenes DESC, relevantes DESC
    LIMIT ?
  `).bind(yearFrom, yearFrom, yearTo, yearTo, limit).all<AnalyticsTrendRow>();
  return res.results ?? [];
}

async function putAnalyticsCache(c: Context<{ Bindings: Env }>, key: string, value: unknown) {
  const ttlSeconds = parsePositiveInt(c.env.ANALYTICS_CACHE_TTL_SECONDS, 900, 30, 86400);
  await c.env.DICTAMENES_PASO.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds }).catch(() => {});
}

async function refreshAnalyticsSnapshots(
  db: D1Database,
  snapshotDate: string,
  yearFrom: number | null,
  yearTo: number | null,
  limit: number
): Promise<{ heatmapRows: number; trendRows: number }> {
  await db.prepare(`DELETE FROM stats_snapshot_normative_heatmap WHERE snapshot_date = ?`).bind(snapshotDate).run();
  await db.prepare(`DELETE FROM stats_snapshot_topic_trends WHERE snapshot_date = ?`).bind(snapshotDate).run();

  await db.prepare(`
    INSERT INTO stats_snapshot_normative_heatmap
      (snapshot_date, year, tipo_norma, numero, total_refs, total_dictamenes, last_source_date)
    SELECT
      ? AS snapshot_date,
      d.anio AS year,
      COALESCE(NULLIF(TRIM(f.tipo_norma), ''), 'Desconocido') AS tipo_norma,
      COALESCE(NULLIF(TRIM(f.numero), ''), '-') AS numero,
      COUNT(*) AS total_refs,
      COUNT(DISTINCT d.id) AS total_dictamenes,
      MAX(COALESCE(d.fecha_documento, d.created_at)) AS last_source_date
    FROM dictamen_fuentes_legales f
    INNER JOIN dictamenes d ON d.id = f.dictamen_id
    WHERE (? IS NULL OR d.anio >= ?)
      AND (? IS NULL OR d.anio <= ?)
    GROUP BY d.anio, COALESCE(NULLIF(TRIM(f.tipo_norma), ''), 'Desconocido'), COALESCE(NULLIF(TRIM(f.numero), ''), '-')
    ORDER BY total_refs DESC, total_dictamenes DESC
    LIMIT ?
  `).bind(snapshotDate, yearFrom, yearFrom, yearTo, yearTo, limit).run();

  await db.prepare(`
    INSERT INTO stats_snapshot_topic_trends
      (snapshot_date, year, materia, total_dictamenes, relevantes, last_source_date)
    SELECT
      ? AS snapshot_date,
      d.anio AS year,
      COALESCE(NULLIF(TRIM(d.materia), ''), 'Sin materia') AS materia,
      COUNT(*) AS total_dictamenes,
      SUM(CASE WHEN COALESCE(a.es_relevante, 0) = 1 THEN 1 ELSE 0 END) AS relevantes,
      MAX(COALESCE(d.fecha_documento, d.created_at)) AS last_source_date
    FROM dictamenes d
    LEFT JOIN atributos_juridicos a ON a.dictamen_id = d.id
    WHERE (? IS NULL OR d.anio >= ?)
      AND (? IS NULL OR d.anio <= ?)
    GROUP BY d.anio, COALESCE(NULLIF(TRIM(d.materia), ''), 'Sin materia')
    ORDER BY total_dictamenes DESC, relevantes DESC
    LIMIT ?
  `).bind(snapshotDate, yearFrom, yearFrom, yearTo, yearTo, limit).run();

  const heatmapCountRow = await db.prepare(
    `SELECT COUNT(*) AS c FROM stats_snapshot_normative_heatmap WHERE snapshot_date = ?`
  ).bind(snapshotDate).first<{ c: number }>();
  const trendCountRow = await db.prepare(
    `SELECT COUNT(*) AS c FROM stats_snapshot_topic_trends WHERE snapshot_date = ?`
  ).bind(snapshotDate).first<{ c: number }>();

  return {
    heatmapRows: heatmapCountRow?.c ?? 0,
    trendRows: trendCountRow?.c ?? 0
  };
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

app.get('/api/v1/analytics/statutes/heatmap', async (c) => {
  const db = c.env.DB;
  const limit = parsePositiveInt(c.req.query('limit'), 50, 1, 500);
  const yearFrom = parseOptionalInt(c.req.query('yearFrom'));
  const yearTo = parseOptionalInt(c.req.query('yearTo'));
  const useSnapshot = !isTruthy(c.req.query('live'));
  const cacheKey = `analytics:heatmap:v1:yf:${yearFrom ?? 'na'}:yt:${yearTo ?? 'na'}:l:${limit}:snapshot:${useSnapshot ? 1 : 0}`;

  try {
    const cached = await c.env.DICTAMENES_PASO.get(cacheKey, 'json').catch(() => null);
    if (cached && typeof cached === 'object') {
      logInfo('ANALYTICS_HEATMAP_CACHE_HIT', { cacheKey, limit, yearFrom, yearTo, useSnapshot });
      return c.json(cached);
    }

    let data: AnalyticsHeatmapRow[] = [];
    let source = 'live';
    let snapshotDate: string | null = null;

    if (useSnapshot) {
      snapshotDate = await getLatestSnapshotDate(db, 'stats_snapshot_normative_heatmap');
      if (snapshotDate) {
        const res = await db.prepare(`
          SELECT year, tipo_norma, numero, total_refs, total_dictamenes, last_source_date
          FROM stats_snapshot_normative_heatmap
          WHERE snapshot_date = ?
            AND (? IS NULL OR year >= ?)
            AND (? IS NULL OR year <= ?)
          ORDER BY total_refs DESC, total_dictamenes DESC
          LIMIT ?
        `).bind(snapshotDate, yearFrom, yearFrom, yearTo, yearTo, limit).all<AnalyticsHeatmapRow>();
        data = res.results ?? [];
        source = 'snapshot';
      }
    }

    if (data.length === 0) {
      data = await queryHeatmapLive(db, yearFrom, yearTo, limit);
      source = 'live';
    }

    const response = {
      data,
      meta: {
        source,
        snapshotDate,
        count: data.length,
        limit,
        yearFrom,
        yearTo
      }
    };
    await putAnalyticsCache(c, cacheKey, response);
    logInfo('ANALYTICS_HEATMAP_QUERY', { source, count: data.length, limit, yearFrom, yearTo, useSnapshot });
    return c.json(response);
  } catch (e: unknown) {
    logError('ANALYTICS_HEATMAP_ERROR', e, { limit, yearFrom, yearTo, useSnapshot });
    return c.json({ error: errorMessage(e) }, 500);
  }
});

app.get('/api/v1/analytics/topics/trends', async (c) => {
  const db = c.env.DB;
  const limit = parsePositiveInt(c.req.query('limit'), 50, 1, 500);
  const yearFrom = parseOptionalInt(c.req.query('yearFrom'));
  const yearTo = parseOptionalInt(c.req.query('yearTo'));
  const useSnapshot = !isTruthy(c.req.query('live'));
  const cacheKey = `analytics:topics:v1:yf:${yearFrom ?? 'na'}:yt:${yearTo ?? 'na'}:l:${limit}:snapshot:${useSnapshot ? 1 : 0}`;

  try {
    const cached = await c.env.DICTAMENES_PASO.get(cacheKey, 'json').catch(() => null);
    if (cached && typeof cached === 'object') {
      logInfo('ANALYTICS_TOPICS_CACHE_HIT', { cacheKey, limit, yearFrom, yearTo, useSnapshot });
      return c.json(cached);
    }

    let data: AnalyticsTrendRow[] = [];
    let source = 'live';
    let snapshotDate: string | null = null;

    if (useSnapshot) {
      snapshotDate = await getLatestSnapshotDate(db, 'stats_snapshot_topic_trends');
      if (snapshotDate) {
        const res = await db.prepare(`
          SELECT year, materia, total_dictamenes, relevantes, last_source_date
          FROM stats_snapshot_topic_trends
          WHERE snapshot_date = ?
            AND (? IS NULL OR year >= ?)
            AND (? IS NULL OR year <= ?)
          ORDER BY total_dictamenes DESC, relevantes DESC
          LIMIT ?
        `).bind(snapshotDate, yearFrom, yearFrom, yearTo, yearTo, limit).all<AnalyticsTrendRow>();
        data = res.results ?? [];
        source = 'snapshot';
      }
    }

    if (data.length === 0) {
      data = await queryTopicTrendsLive(db, yearFrom, yearTo, limit);
      source = 'live';
    }

    const response = {
      data,
      meta: {
        source,
        snapshotDate,
        count: data.length,
        limit,
        yearFrom,
        yearTo
      }
    };
    await putAnalyticsCache(c, cacheKey, response);
    logInfo('ANALYTICS_TOPICS_QUERY', { source, count: data.length, limit, yearFrom, yearTo, useSnapshot });
    return c.json(response);
  } catch (e: unknown) {
    logError('ANALYTICS_TOPICS_ERROR', e, { limit, yearFrom, yearTo, useSnapshot });
    return c.json({ error: errorMessage(e) }, 500);
  }
});

app.post('/api/v1/analytics/refresh', async (c) => {
  const db = c.env.DB;
  const body = await readJsonBody(c);
  const limit = parsePositiveInt(body.limit, 1000, 10, 10000);
  const yearFrom = parseOptionalInt(body.yearFrom);
  const yearTo = parseOptionalInt(body.yearTo);
  const snapshotDate = isIsoDateYmd(body.snapshotDate) ? body.snapshotDate : todayYmd();

  if (c.env.ENVIRONMENT === 'prod') {
    const token = c.req.header('x-admin-token');
    if (!token || token !== c.env.INGEST_TRIGGER_TOKEN) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
  }

  try {
    const counts = await refreshAnalyticsSnapshots(db, snapshotDate, yearFrom, yearTo, limit);
    logInfo('ANALYTICS_REFRESH_DONE', {
      snapshotDate,
      yearFrom,
      yearTo,
      limit,
      heatmapRows: counts.heatmapRows,
      trendRows: counts.trendRows
    });
    return c.json({
      success: true,
      snapshotDate,
      limit,
      filters: { yearFrom, yearTo },
      rows: counts
    });
  } catch (e: unknown) {
    logError('ANALYTICS_REFRESH_ERROR', e, { snapshotDate, yearFrom, yearTo, limit });
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
          origen_busqueda: 'vectorial',
          estado: 'vectorized'
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
        origen_busqueda: 'literal',
        estado: r.estado || null
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

app.get('/api/v1/dictamenes/:id/lineage', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  try {
    const baseNode = await db.prepare(
      `SELECT id, numero, anio, fecha_documento, materia, estado
       FROM dictamenes
       WHERE id = ?`
    ).bind(id).first<LineageNodeRow>();

    if (!baseNode) return c.json({ error: 'Documento no encontrado' }, 404);

    const outgoingRes = await db.prepare(
      `SELECT
         r.dictamen_id AS from_id,
         r.dictamen_ref_nombre AS to_id,
         'outgoing_reference' AS relation_type,
         r.year AS relation_year,
         r.url AS relation_url
       FROM dictamen_referencias r
       WHERE r.dictamen_id = ?
         AND r.dictamen_ref_nombre IS NOT NULL
         AND TRIM(r.dictamen_ref_nombre) <> ''`
    ).bind(id).all<LineageEdgeRow>();

    const incomingRes = await db.prepare(
      `SELECT
         r.dictamen_id AS from_id,
         r.dictamen_ref_nombre AS to_id,
         'incoming_reference' AS relation_type,
         r.year AS relation_year,
         r.url AS relation_url
       FROM dictamen_referencias r
       WHERE r.dictamen_ref_nombre = ?`
    ).bind(id).all<LineageEdgeRow>();

    const edges = [...(outgoingRes.results ?? []), ...(incomingRes.results ?? [])];
    const neighborIds = Array.from(
      new Set(
        edges.flatMap((edge) => [edge.from_id, edge.to_id]).filter((candidateId) => candidateId && candidateId !== id)
      )
    );

    const neighbors: LineageNodeRow[] = [];
    if (neighborIds.length > 0) {
      const placeholders = neighborIds.map(() => '?').join(',');
      const res = await db.prepare(
        `SELECT id, numero, anio, fecha_documento, materia, estado
         FROM dictamenes
         WHERE id IN (${placeholders})`
      ).bind(...neighborIds).all<LineageNodeRow>();
      neighbors.push(...(res.results ?? []));
    }

    const nodes = [baseNode, ...neighbors];

    logInfo('LINEAGE_QUERY', {
      dictamenId: id,
      nodes: nodes.length,
      edges: edges.length
    });

    return c.json({
      data: {
        rootId: id,
        nodes,
        edges
      },
      meta: {
        nodeCount: nodes.length,
        edgeCount: edges.length
      }
    });
  } catch (e: unknown) {
    logError('LINEAGE_QUERY_ERROR', e, { dictamenId: id });
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
        ...enrichment,
        analisis: enrichment.analisis || "", // Cast null to string
        materia: sourceContent?.materia,
        descriptores_originales: sourceContent?.descriptores ? String(sourceContent.descriptores).split(/[,;\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 2) : [],
        fecha: String(sourceContent?.fecha_documento || ''),
        model: enrichment.modelo_llm || c.env.MISTRAL_MODEL
      } as any // Use any temporarily if needed due to complex Partial mismatch
    });

    // Registrar éxito de sincronización en D1 (v2)
    await db.prepare(
      `INSERT INTO pinecone_sync_status (dictamen_id, metadata_version, last_synced_at)
       VALUES (?, 2, CURRENT_TIMESTAMP)
       ON CONFLICT(dictamen_id) DO UPDATE SET 
          metadata_version = 2, 
          last_synced_at = CURRENT_TIMESTAMP,
          sync_error = NULL`
    ).bind(id).run();

    await db.prepare("UPDATE dictamenes SET estado = 'vectorized', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
    return c.json({ success: true, message: 'Vector sync done (Standard v2).' });
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
    // 1. RE-INGESTA: Regenerar catálogos y relaciones (Abogados, Descriptores) con el parser actual
    await ingestDictamen(c.env, rawJson, { status: 'ingested' });

    // 2. ENRIQUECIMIENTO: AI Mistral
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
        ...enrichment.extrae_jurisprudencia,
        ...enrichment.booleanos,
        materia: sourceContent.materia,
        descriptores_originales: sourceContent.descriptores ? String(sourceContent.descriptores).split(/[,;\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 2) : [],
        fecha: String(sourceContent.fecha_documento || ''),
        model: c.env.MISTRAL_MODEL
      }
    });

    // Registrar éxito de sincronización en D1 (v2)
    await db.prepare(
      `INSERT INTO pinecone_sync_status (dictamen_id, metadata_version, last_synced_at)
       VALUES (?, 2, CURRENT_TIMESTAMP)
       ON CONFLICT(dictamen_id) DO UPDATE SET 
          metadata_version = 2, 
          last_synced_at = CURRENT_TIMESTAMP,
          sync_error = NULL`
    ).bind(id).run();

    await updateDictamenStatus(db, id, 'vectorized');
    return c.json({ success: true, message: 'Reproceso integral completado con éxito' });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

// --- BARRIDO MASIVO PINECONE (v2 Standards) ---
app.post('/api/v1/dictamenes/sync-vector-mass', async (c) => {
  const db = c.env.DB;
  const body = await readJsonBody(c);
  const limit = parsePositiveInt(body.limit, 10, 1, 100); // Lotes pequeños para evitar timeouts

  try {
    // 1. Buscar dictámenes que NO estén en metadata_version 2 (Gold)
    const pending = await db.prepare(`
      SELECT d.id 
      FROM dictamenes d
      LEFT JOIN pinecone_sync_status s ON d.id = s.dictamen_id
      WHERE d.estado = 'vectorized' 
      AND (s.metadata_version IS NULL OR s.metadata_version < 2)
      LIMIT ?
    `).bind(limit).all<{ id: string }>();

    const ids = (pending.results ?? []).map(r => r.id);
    if (ids.length === 0) return c.json({ success: true, message: 'Toda la metadata está en v2' });

    let count = 0;
    for (const id of ids) {
      // Ejecutar sync individual de cada uno (reutilizando lógica interna o similar)
      // Por simplicidad en este endpoint, recuperamos la data y hacemos upsert
      const enrichment = await getLatestEnrichment(db, id);
      const rawRef = await getLatestRawRef(db, id);
      if (!enrichment || !rawRef) continue;

      let rawJson: any = await c.env.DICTAMENES_SOURCE.get(rawRef.raw_key, 'json').catch(() => null);
      if (!rawJson && !rawRef.raw_key.startsWith('dictamen:')) {
        rawJson = await c.env.DICTAMENES_SOURCE.get(`dictamen:${id}`, 'json').catch(() => null);
      }
      if (!rawJson) continue;

      const sourceContent = rawJson?._source ?? rawJson?.source ?? rawJson?.raw_data ?? rawJson;
      const textToEmbed = `
            Título: ${enrichment.titulo}
            Resumen: ${enrichment.resumen}
            Análisis: ${enrichment.analisis}
        `.trim();

      await upsertRecord(c.env, {
        id: id,
        text: textToEmbed,
        metadata: {
          ...enrichment,
          analisis: enrichment.analisis || "",
          materia: sourceContent?.materia,
          descriptores_originales: sourceContent?.descriptores ? String(sourceContent.descriptores).split(/[,;\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 2) : [],
          fecha: String(sourceContent?.fecha_documento || ''),
          model: enrichment.modelo_llm || c.env.MISTRAL_MODEL
        } as any
      });

      await db.prepare(`
            INSERT INTO pinecone_sync_status (dictamen_id, metadata_version, last_synced_at)
            VALUES (?, 2, CURRENT_TIMESTAMP)
            ON CONFLICT(dictamen_id) DO UPDATE SET 
               metadata_version = 2, 
               last_synced_at = CURRENT_TIMESTAMP,
               sync_error = NULL
        `).bind(id).run();
      count++;
    }

    return c.json({ success: true, processed: count, total_pending: ids.length });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

// --- TRIGGER MANUAL ---
app.post('/ingest/trigger', async (c) => {
  if (c.env.ENVIRONMENT === 'prod') {
    const token = c.req.header('x-admin-token');
    if (!token || token !== c.env.INGEST_TRIGGER_TOKEN) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
  }
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
    const res = await fetchDictamenesSearchPage(c.env.CGR_BASE_URL, 0, options, undefined, '', c.env.CGR_API_TOKEN);
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
