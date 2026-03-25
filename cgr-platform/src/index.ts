import { Hono } from 'hono';
import type { Context } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { queryRecords, upsertRecord } from './clients/pinecone';
import {
  getLatestEnrichment,
  getLatestRawRef,
  updateDictamenStatus,
  insertEnrichment,
  insertDictamenBooleanosLLM,
  insertDictamenEtiquetaLLM,
  insertDictamenFuenteLegal,
  getOrInsertDivisionId,
  getMigrationStats,
  getMigrationEvolution,
  getRecentMigrationEvents,
  getDictamenRelacionesJuridicas
} from './storage/d1';
import type { Env, DictamenRaw } from './types';
import { IngestWorkflow } from './workflows/ingestWorkflow';
import { BackfillWorkflow } from './workflows/backfillWorkflow';
import { KVSyncWorkflow } from './workflows/kvSyncWorkflow';
import { CanonicalRelationsWorkflow } from './workflows/canonicalRelationsWorkflow';
import { analyzeDictamen } from './clients/mistral';
import { fetchDictamenesSearchPage } from './clients/cgr';
import { ingestDictamen, extractDictamenId } from './lib/ingest';
import { applyRetroUpdates } from './lib/relations';
import { logInfo, logError, setLogLevel } from './lib/log';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Limpia prefijos redundantes ("Título:", "Resumen:") que vienen de Pinecone (Fase 12)
 */
function cleanMetadataText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/^Título:\s*/gi, '')
    .replace(/\.*?\s*Resumen:\s*/gi, '. ')
    .trim();
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
      AND LOWER(f.tipo_norma) NOT LIKE '%valor de relleno%'
      AND LOWER(f.numero) NOT LIKE '%valor de relleno%'
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
  await c.env.DICTAMENES_PASO.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds }).catch(() => { });
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
      AND LOWER(f.tipo_norma) NOT LIKE '%valor de relleno%'
      AND LOWER(f.numero) NOT LIKE '%valor de relleno%'
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
  KVSyncWorkflow,
  CanonicalRelationsWorkflow
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

// --- AUDITORIA BIDIRECCIONAL (SRE) ---
app.get('/api/v1/admin/audit-sync', async (c) => {
  const db = c.env.DB;
  const kv = c.env.DICTAMENES_SOURCE;
  const executeFixes = c.req.query('fix') === 'true';
  const fixLimit = parsePositiveInt(c.req.query('limit'), 50, 1, 500);

  try {
    const d1Res = await db.prepare("SELECT id, estado FROM dictamenes").all<{id: string, estado: string}>();
    const d1Records = d1Res.results ?? [];
    const d1Map = new Map<string, string>();
    for (const r of d1Records) {
      d1Map.set(r.id, r.estado);
    }

    const kvKeys = new Set<string>();
    const garbageKeys: string[] = [];
    
    let cursor: string | undefined = undefined;
    do {
      const listRes: any = await kv.list({ cursor });
      for (const keyObj of listRes.keys) {
        const name = keyObj.name;
        if (name.includes(':') || name.includes('_') || name.startsWith('legacy') || name.startsWith('raw')) {
           garbageKeys.push(name);
        } else {
           kvKeys.add(name);
        }
      }
      cursor = listRes.list_complete ? undefined : listRes.cursor;
    } while (cursor);

    const missingInKv: string[] = [];
    for (const [id, estado] of d1Map.entries()) {
      if (!kvKeys.has(id)) {
        const foundGarbage = garbageKeys.find(gk => gk.includes(id));
        if (!foundGarbage) {
            missingInKv.push(id);
        }
      }
    }

    const missingInD1: string[] = [];
    for (const key of kvKeys) {
      if (!d1Map.has(key)) {
        missingInD1.push(key);
      }
    }

    const withErrorButHasKv: string[] = [];
    for (const [id, estado] of d1Map.entries()) {
      if ((estado === 'error_sin_KV_source' || estado === 'error') && kvKeys.has(id)) {
         withErrorButHasKv.push(id);
      }
    }

    const fixesExecuted = {
      garbageCleaned: 0,
      missingKvCrawled: 0,
      missingD1Ingested: 0,
      errorStatusFixed: 0,
      errors: [] as string[]
    };

    if (executeFixes) {
      // 1. Fix Garbage (limit to fixLimit)
      for (let i = 0; i < Math.min(garbageKeys.length, fixLimit); i++) {
         const badKey = garbageKeys[i];
         try {
            const raw = await kv.get(badKey, 'json');
            if (raw) {
               const id = extractDictamenId(raw as any);
               if (id !== 'unknown') {
                  await kv.put(id, JSON.stringify(raw));
                  await kv.delete(badKey);
                  fixesExecuted.garbageCleaned++;
               }
            }
         } catch (e: any) {
            fixesExecuted.errors.push(`Garbage fix error ${badKey}: ${e.message}`);
         }
      }

      // 2. Fix Error Status (limit to fixLimit)
      for (let i = 0; i < Math.min(withErrorButHasKv.length, fixLimit); i++) {
        const id = withErrorButHasKv[i];
        try {
          await db.prepare("UPDATE dictamenes SET estado = 'ingested' WHERE id = ?").bind(id).run();
          await db.prepare("INSERT INTO historial_cambios (dictamen_id, campo_modificado, valor_anterior, valor_nuevo, origen) VALUES (?, ?, ?, ?, ?)")
            .bind(id, 'estado', 'error_sin_KV_source', 'ingested', 'auditoria_bidireccional_kv_d1').run();
          fixesExecuted.errorStatusFixed++;
        } catch (e: any) {
          fixesExecuted.errors.push(`Status fix error ${id}: ${e.message}`);
        }
      }

      // 3. Fix missing in KV (Crawl) (limit to a smaller number to avoid timeouts, e.g. 5)
      const crawlLimit = Math.min(missingInKv.length, Math.min(fixLimit, 5));
      for (let i = 0; i < crawlLimit; i++) {
        const id = missingInKv[i];
        try {
          const cgrUrl = c.env.CGR_BASE_URL || 'https://www.contraloria.cl';
          const searchRes = await fetchDictamenesSearchPage(cgrUrl, 1, [], undefined, id);
          if (searchRes.items && searchRes.items.length > 0) {
            const raw = searchRes.items[0];
            await ingestDictamen(c.env, raw as any, { force: true, origenImportacion: 'worker_manual' });
            fixesExecuted.missingKvCrawled++;
          } else {
             fixesExecuted.errors.push(`Crawl found no results for ${id}`);
          }
        } catch (e: any) {
          fixesExecuted.errors.push(`Crawl fix error ${id}: ${e.message}`);
        }
      }

      // 4. Fix missing in D1 (Ingest from KV) (limit e.g. 5)
      const ingestLimit = Math.min(missingInD1.length, Math.min(fixLimit, 5));
      for (let i = 0; i < ingestLimit; i++) {
        const id = missingInD1[i];
        try {
           const raw = await kv.get(id, 'json');
           if (raw) {
              await ingestDictamen(c.env, raw as any, { force: true, origenImportacion: 'worker_manual' });
              fixesExecuted.missingD1Ingested++;
           }
        } catch (e: any) {
           fixesExecuted.errors.push(`Missing D1 ingest error ${id}: ${e.message}`);
        }
      }
    }

    return c.json({
      dryRun: !executeFixes,
      stats: {
        totalD1: d1Map.size,
        totalKV: kvKeys.size + garbageKeys.length,
        garbageKeys: garbageKeys.length,
        missingInKv: missingInKv.length,
        missingInD1: missingInD1.length,
        withErrorButHasKv: withErrorButHasKv.length
      },
      fixesExecuted,
      samples: {
        garbage: garbageKeys.slice(0, 10),
        missingD1: missingInD1.slice(0, 10),
        missingKv: missingInKv.slice(0, 10),
        withErrorButHasKv: withErrorButHasKv.slice(0, 10)
      }
    });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

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

// Endpoint para obtener catálogo de divisiones real (Fase 11)
app.get('/api/v1/divisions', async (c) => {
  const db = c.env.DB;
  try {
    const list = await db.prepare(`
      SELECT DISTINCT codigo, nombre_completo 
      FROM cat_divisiones 
      WHERE nombre_completo NOT LIKE 'División No Identificada%' 
      AND nombre_completo NOT LIKE 'Sin División Asignada%' 
      ORDER BY nombre_completo
    `).all();
    return c.json({ data: list.results || [] });
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
  const yearFromStr = c.req.query('year');
  const materia = c.req.query('materia');
  const division = c.req.query('division');
  const tags = c.req.query('tags');
  const juris = c.req.query('juris') === 'true';

  const limit = 10;
  const offset = (page - 1) * limit;
  const db = c.env.DB;

  try {
    let dataToReturn: any[] | null = null;
    let totalToReturn = 0;

    // Construcción de filtros para Pinecone
    const pcFilter: Record<string, any> = {};
    if (yearFromStr) {
      pcFilter["fecha"] = { "$gte": `${yearFromStr}-01-01` };
      // También podríamos filtrar por el límite superior del año si se requiere
    }
    if (division) {
      pcFilter["division_nombre"] = { "$eq": division };
    }
    // Pinecone (Integrated Inference fallback) no soporta $contains en campos de texto de metadatos fácilmente para búsqueda libre.
    // Pero si se desea filtrar por etiquetas exactas (Array):
    if (tags) {
      const tagsArray = tags.split(',').map(t => t.trim());
      pcFilter["descriptores_AI"] = { "$in": tagsArray };
    }

    if (query.trim() !== '') {
      try {
        const queryTrimmed = query.trim();
        // Detección de patrones de ID (Ej: E85862N25, 71381, N25)
        const isLikelyId = /^[A-Z0-9]*[0-9]+N[0-9]+$/i.test(queryTrimmed) || (/^[0-9]+$/.test(queryTrimmed) && queryTrimmed.length > 3);
        
        if (isLikelyId) {
          // Búsqueda SQL directa primero (Prioridad ID)
          const sqlRes = await db.prepare(`SELECT d.id FROM dictamenes d WHERE d.id LIKE ? OR d.numero LIKE ? LIMIT 5`)
            .bind(`%${queryTrimmed}%`, `%${queryTrimmed}%`).all();
          
          if (sqlRes.results && sqlRes.results.length > 0) {
             console.log("ID Match detected, skipping vector search priority.");
             // Si hay match exacto/parcial de ID, dejamos que el fallback SQL maneje todo con filtros.
             // No asignamos dataToReturn aquí para forzar el flujo SQL completo con filtros.
          } else {
             // Si no hay match de ID, intentamos vectorial
             const pcRes = await queryRecords(c.env, query, limit * 2, Object.keys(pcFilter).length > 0 ? pcFilter : undefined);
             const matches = pcRes.matches || [];
             if (matches.length > 0) {
               dataToReturn = matches.map((m: any) => ({
                 id: m.id,
                 numero: m.id.substring(0, 8),
                 anio: parseInt(m.metadata?.fecha?.split('-')?.[0] || '2024', 10),
                 fecha_documento: m.metadata?.fecha || '',
                 materia: cleanMetadataText(m.metadata?.titulo || m.metadata?.materia || 'Materia Reservada o Sin título'),
                 resumen: cleanMetadataText(m.metadata?.analisis || m.metadata?.resumen || ''),
                 origen_busqueda: 'vectorial',
                 estado: 'vectorized',
                 genera_jurisprudencia: m.metadata?.criterio === 'Genera Jurisprudencia'
               })).slice(0, limit);
               totalToReturn = matches.length;
             }
          }
        } else {
          // Búsqueda Vectorial normal
          const pcRes = await queryRecords(c.env, query, limit * 2, Object.keys(pcFilter).length > 0 ? pcFilter : undefined);
          const matches = pcRes.matches || [];
          const data = matches.map((m: any) => ({
            id: m.id,
            numero: m.id.substring(0, 8),
            anio: parseInt(m.metadata?.fecha?.split('-')?.[0] || '2024', 10),
            fecha_documento: m.metadata?.fecha || '',
            materia: cleanMetadataText(m.metadata?.titulo || m.metadata?.materia || 'Materia Reservada o Sin título'),
            resumen: cleanMetadataText(m.metadata?.analisis || m.metadata?.resumen || ''),
            origen_busqueda: 'vectorial',
            estado: 'vectorized',
            genera_jurisprudencia: m.metadata?.criterio === 'Genera Jurisprudencia'
          }));

          if (data.length > 0) {
            const resultIds = data.map((d: any) => d.id);
            const placeholders = resultIds.map(() => '?').join(',');
            const rels = await db.prepare(`
              SELECT dictamen_destino_id as destino_id, 
                     '[' || GROUP_CONCAT('{"origen_id":"' || dictamen_origen_id || '","tipo_accion":"' || r.tipo_accion || '"}') || ']' as relaciones_json
              FROM dictamen_relaciones_juridicas r
              WHERE dictamen_destino_id IN (${placeholders})
              GROUP BY dictamen_destino_id
            `).bind(...resultIds).all<any>();
            
            const relMap = new Map<string, any[]>();
            (rels.results || []).forEach(r => {
              relMap.set(r.destino_id, JSON.parse(r.relaciones_json));
            });

            dataToReturn = data.map((d: any) => ({
              ...d,
              relaciones_causa: relMap.get(d.id) || []
            })).slice(0, limit);
            totalToReturn = data.length;
          }
        }
      } catch (err) {
        console.error("Excepción en búsqueda vectorial, recurriendo a SQL (Fallback).", err);
      }
    }

    if (!dataToReturn) {
      // Búsqueda SQL (Fallback)
      let condition = "WHERE 1=1";
      let binds: any[] = [];

      if (query.trim() !== '') {
        const words = query.trim().split(/\s+/).slice(0, 5); // Incluir palabras cortas (IDs)
        if (words.length > 0) {
          const conditions = words.map(() => "(d.materia LIKE ? OR d.numero LIKE ? OR d.id LIKE ?)");
          condition += " AND " + conditions.join(" AND ");
          words.forEach(w => {
            const safeW = w.substring(0, 40);
            binds.push(`%${safeW}%`, `%${safeW}%`, `%${safeW}%`);
          });
        }
      }

      if (yearFromStr) {
        condition += " AND d.anio = ?";
        binds.push(parseInt(yearFromStr, 10));
      }
      if (materia) {
        const trimmed = materia.trim();
        const fullPattern = `%${trimmed}%`;
        const mWords = trimmed.split(/\s+/).filter(w => w.length > 1);

        // Lógica: Match frase completa OR (Match palabra 1 AND palabra 2...)
        let mCondition = `(LOWER(d.materia) LIKE LOWER(?) OR d.id IN (SELECT dictamen_id FROM enriquecimiento WHERE LOWER(etiquetas_json) LIKE LOWER(?)))`;
        binds.push(fullPattern, fullPattern);

        if (mWords.length > 1) {
          const wordMatches = mWords.map(() => "(LOWER(d.materia) LIKE LOWER(?) OR d.id IN (SELECT dictamen_id FROM enriquecimiento WHERE LOWER(etiquetas_json) LIKE LOWER(?)))");
          mCondition = `(${mCondition} OR (${wordMatches.join(" AND ")}))`;
          mWords.forEach(w => binds.push(`%${w}%`, `%${w}%`));
        }
        condition += ` AND ${mCondition}`;
      }

      if (tags) {
        const trimmed = tags.trim();
        const fullPattern = `%${trimmed}%`;
        const tWords = trimmed.split(/\s+/).filter(w => w.length > 1);

        let tCondition = `d.id IN (SELECT dictamen_id FROM enriquecimiento WHERE LOWER(etiquetas_json) LIKE LOWER(?))`;
        binds.push(fullPattern);

        if (tWords.length > 1) {
          const wordMatches = tWords.map(() => "d.id IN (SELECT dictamen_id FROM enriquecimiento WHERE LOWER(etiquetas_json) LIKE LOWER(?))");
          tCondition = `(${tCondition} OR (${wordMatches.join(" AND ")}))`;
          tWords.forEach(w => binds.push(`%${w}%`));
        }
        condition += ` AND ${tCondition}`;
      }
      if (division) {
        condition += " AND d.division_id IN (SELECT id FROM cat_divisiones WHERE codigo = ?)";
        binds.push(division);
      }
      if (tags) {
        const tWords = tags.trim().split(/\s+/).filter(w => w.length > 1);
        if (tWords.length > 0) {
          const tConditions = tWords.map(() => "d.id IN (SELECT dictamen_id FROM enriquecimiento WHERE etiquetas_json LIKE ?)");
          condition += " AND " + tConditions.join(" AND ");
          tWords.forEach(w => binds.push(`%${w}%`));
        }
      }

      if (juris) {
        condition += " AND d.criterio = 'Genera Jurisprudencia'";
      }

    const totalRes = await db.prepare(`SELECT COUNT(*) as count FROM dictamenes d ${condition}`).bind(...binds).first<{ count: number }>();
    totalToReturn = totalRes?.count ?? 0;

    const listQuery = `SELECT d.id, d.numero, d.anio, d.fecha_documento, d.materia, d.estado, d.criterio, e.genera_jurisprudencia,
                       (SELECT '[' || GROUP_CONCAT('{"origen_id":"' || r.dictamen_origen_id || '","tipo_accion":"' || r.tipo_accion || '"}') || ']'
                        FROM dictamen_relaciones_juridicas r 
                        WHERE r.dictamen_destino_id = d.id) as relaciones_json
                       FROM dictamenes d 
                       LEFT JOIN enriquecimiento e ON d.id = e.dictamen_id 
                       ${condition} ORDER BY d.fecha_documento DESC LIMIT ? OFFSET ?`;
    const list = await db.prepare(listQuery).bind(...binds, limit, offset).all<any>();

    dataToReturn = (list.results ?? []).map((r: any) => ({
      id: r.id,
      numero: r.numero || r.id.substring(0, 8),
      anio: r.anio || (r.fecha_documento ? parseInt(r.fecha_documento.split('-')[0], 10) : new Date().getFullYear()),
      fecha_documento: r.fecha_documento || '',
      materia: r.materia || 'Sin materia especificada',
      resumen: '',
      origen_busqueda: 'literal',
      estado: r.estado || null,
      genera_jurisprudencia: r.criterio === 'Genera Jurisprudencia',
      relaciones_causa: r.relaciones_json ? JSON.parse(r.relaciones_json) : []
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

// --- SUGERENCIAS DE MATERIA (Autocomplete) ---
app.get('/api/v1/analytics/suggest/materia', async (c) => {
  const query = c.req.query('q') || '';
  if (query.length < 3) return c.json({ suggestions: [] });

  const db = c.env.DB;
  try {
    const res = await db.prepare(
      `SELECT DISTINCT termino
       FROM cat_descriptores 
       WHERE LOWER(termino) LIKE LOWER(?) 
       ORDER BY 1 ASC
       LIMIT 10`
    ).bind(`%${query}%`).all<any>();

    return c.json({
      suggestions: (res.results ?? []).map((r: any) => r.termino)
    });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

// --- SUGERENCIAS DE ETIQUETAS IA (Autocomplete) ---
app.get('/api/v1/analytics/suggest/tags', async (c) => {
  const query = c.req.query('q') || '';
  if (query.length < 2) return c.json({ suggestions: [] });

  const db = c.env.DB;
  try {
    const results = await db.prepare(`
      SELECT etiquetas_json 
      FROM enriquecimiento 
      WHERE etiquetas_json LIKE ? 
      LIMIT 100
    `).bind(`%${query}%`).all<any>();

    const allTags = new Set<string>();
    (results.results || []).forEach((r: any) => {
      try {
        const tagsArr = JSON.parse(r.etiquetas_json || '[]');
        if (Array.isArray(tagsArr)) {
          tagsArr.forEach((t: string) => {
            if (t.toLowerCase().includes(query.toLowerCase())) {
              allTags.add(t);
            }
          });
        }
      } catch (e) {
        if (r.etiquetas_json && r.etiquetas_json.toLowerCase().includes(query.toLowerCase())) {
          allTags.add(r.etiquetas_json);
        }
      }
    });

    const finalSuggestions = Array.from(allTags)
      .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      .slice(0, 10);

    return c.json({ suggestions: finalSuggestions });
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
app.get('/api/v1/admin/migration/info', async (c) => {
  const db = c.env.DB;
  try {
    const stats = await getMigrationStats(db);
    const evolution = await getMigrationEvolution(db);
    const events = await getRecentMigrationEvents(db);

    return c.json({
      stats,
      evolution,
      events,
      modelTarget: c.env.MISTRAL_MODEL
    });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

app.post('/api/v1/jobs/repair-nulls', async (c) => {
  const db = c.env.DB;
  const kv = c.env.DICTAMENES_SOURCE;
  const limitNum = Number(c.req.query('limit')) || 500;

  const targetId = c.req.query('id');

  try {
    let ids: string[] = [];
    if (targetId) {
      ids = [targetId.trim()];
    } else {
      const rows = await db.prepare(
        "SELECT id FROM dictamenes WHERE (old_url IS NULL OR division_id IS NULL) AND origen_importacion NOT IN ('manual', 'missing_kv', 'repaired_incomplete') AND estado != 'sin_kv' LIMIT ?"
      ).bind(limitNum).all<{ id: string }>();
      ids = rows.results?.map(r => r.id) || [];
    }

    if (ids.length === 0) {
      return c.json({ status: 'ok', msg: 'No pending null records to repair.', count: 0 });
    }

    // Send to Queue instead of processing synchronously
    const chunkSize = 100;
    let queuedCount = 0;

    if (c.env.REPAIR_QUEUE) {
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunkIds = ids.slice(i, i + chunkSize);
        await c.env.REPAIR_QUEUE.sendBatch(chunkIds.map(id => ({ body: id })));
        queuedCount += chunkIds.length;
      }
      return c.json({ status: 'ok', queuedCount, msg: 'IDs sent to repair-nulls queue.' });
    } else {
      return c.json({ status: 'error', msg: 'REPAIR_QUEUE binding no está configurado.' }, 500);
    }
  } catch (err: any) {
    return c.json({ error: errorMessage(err) }, 500);
  }
});

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
  if (c.env.ENVIRONMENT === 'prod') {
    const token = c.req.header('x-admin-token');
    if (!token || token !== c.env.INGEST_TRIGGER_TOKEN) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
  }
  const body = await readJsonBody(c);
  const defaultBatch = parsePositiveInt(c.env.BACKFILL_BATCH_SIZE, 100, 1, 500);
  const defaultDelay = parsePositiveInt(c.env.BACKFILL_DELAY_MS, 500, 0, 60000);
  const batchSize = parsePositiveInt(body.batchSize, defaultBatch, 1, 500);
  const delayMs = parsePositiveInt(body.delayMs, defaultDelay, 0, 60000);
  const recursive = body.recursive !== undefined ? isTruthy(body.recursive) : true;

  const instance = await c.env.BACKFILL_WORKFLOW.create({
    params: { batchSize, delayMs, recursive }
  });
  logInfo('BACKFILL_WORKFLOW_CREATED', { workflowId: instance.id, batchSize, delayMs, recursive });
  return c.json({ success: true, workflowId: instance.id, params: { batchSize, delayMs, recursive } });
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
      rawJson = await c.env.DICTAMENES_SOURCE.get(rawRef.raw_key, 'json').catch(() => null);
    }
    const sourceContent = rawJson?._source ?? rawJson?.source ?? rawJson?.raw_data ?? rawJson;

    await upsertRecord(c.env, {
      id: id,
      metadata: {
        ...enrichment,
        descriptores_AI: enrichment.etiquetas_json ? JSON.parse(enrichment.etiquetas_json) : [],
        materia: sourceContent?.materia || "",
        descriptores_originales: sourceContent?.descriptores ? String(sourceContent.descriptores).split(/[,;\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 2) : [],
        fecha: String(sourceContent?.fecha_documento || ''),
        model: enrichment.modelo_llm || c.env.MISTRAL_MODEL,
        analisis: enrichment.analisis || "" // El cliente concatenará esto con Título y Resumen
      } as any
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

    await updateDictamenStatus(db, id, 'vectorized', 'PINECONE_SYNC_SUCCESS', {
      source: 'API_MANUAL_SYNC',
      metadata_version: 2
    });
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
  if (!rawJson) return c.json({ error: 'No se encontró JSON en KV' }, 404);

  try {
    const force = c.req.query('force') === 'true';
    // 1. RE-INGESTA: Regenerar catálogos y relaciones (Abogados, Descriptores) con el parser actual
    await ingestDictamen(c.env, rawJson, { status: 'ingested', force });

    // 2. ENRIQUECIMIENTO: AI Mistral
    const enrichmentPayload = await analyzeDictamen(c.env, rawJson);
    const enrichment = enrichmentPayload.result;
    if (!enrichment) throw new Error(enrichmentPayload.error || "Fallo en AI Mistral");

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

    // RETRO-UPDATES: Propagar cambios a dictámenes históricos
    await applyRetroUpdates(c.env, id, enrichment.acciones_juridicas_emitidas);

    await updateDictamenStatus(db, id, 'enriched', 'MANUAL_UPDATE', {
      detail: 'Re-proceso integral (Ingest + Mistral) desde API',
      model: c.env.MISTRAL_MODEL
    });

    const textToEmbed = `
        Título: ${enrichment.extrae_jurisprudencia.titulo}
        Resumen: ${enrichment.extrae_jurisprudencia.resumen}
        Análisis: ${enrichment.extrae_jurisprudencia.analisis}
    `.trim();

    const sourceContent = rawJson._source ?? rawJson.source ?? (rawJson as any).raw_data ?? rawJson;
    await upsertRecord(c.env, {
      id: id,
      metadata: {
        ...enrichment.extrae_jurisprudencia,
        descriptores_AI: enrichment.extrae_jurisprudencia.etiquetas,
        ...enrichment.booleanos,
        materia: sourceContent.materia || "",
        descriptores_originales: sourceContent.descriptores ? String(sourceContent.descriptores).split(/[,;\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 2) : [],
        fecha: String(sourceContent.fecha_documento || ''),
        model: c.env.MISTRAL_MODEL
        // El cliente construirá el análisis enriquecido usando titulo, resumen y analisis
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

    await updateDictamenStatus(db, id, 'vectorized', 'PINECONE_SYNC_SUCCESS', {
      source: 'API_MANUAL_REPROCESS',
      metadata_version: 2
    });

    // ENSAMBLAJE PARA DICTAMENES_PASO
    const pasoJson = {
      id: id,
      source: sourceContent,
      arreglo_booleanos: enrichment.booleanos,
      detalle_fuentes: enrichment.fuentes_legales,
      extrae_jurisprudencia: enrichment.extrae_jurisprudencia,
      acciones_juridicas_emitidas: enrichment.acciones_juridicas_emitidas,
      modelo_llm: c.env.MISTRAL_MODEL,
      descriptores: sourceContent.descriptores ? String(sourceContent.descriptores).split(/[,;\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 2) : [],
      referencias: [],
      creado_en: new Date().toISOString(),
      procesado: true
    };
    const now = new Date().toISOString();
    try {
      await c.env.DICTAMENES_PASO.put(id, JSON.stringify(pasoJson));
      await db.prepare(
        `INSERT INTO kv_sync_status (dictamen_id, en_paso, paso_written_at)
         VALUES (?, 1, ?)
         ON CONFLICT(dictamen_id) DO UPDATE SET en_paso = 1, paso_written_at = excluded.paso_written_at, updated_at = excluded.paso_written_at`
      ).bind(id, now).run();
    } catch (err: any) {
      await db.prepare(
        `INSERT INTO kv_sync_status (dictamen_id, en_paso, paso_error)
         VALUES (?, 0, ?)
         ON CONFLICT(dictamen_id) DO UPDATE SET paso_error = excluded.paso_error, updated_at = ?`
      ).bind(id, err.message, now).run();
      console.error(`[Re-process][ERROR] No se pudo escribir en DICTAMENES_PASO para ${id}:`, err);
    }

    return c.json({ success: true, message: 'Reproceso integral completado con éxito' });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

// --- BARRIDO MASIVO PINECONE (v2 Standards) ---
app.get('/api/v1/dictamenes/:id/history', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  try {
    const dictamen = await db.prepare("SELECT id, estado, created_at, updated_at FROM dictamenes WHERE id = ?").bind(id).first<any>();
    if (!dictamen) return c.json({ error: 'Documento no encontrado' }, 404);

    const history = await db.prepare("SELECT event_type as campo_modificado, status_to as valor_nuevo, status_from as valor_anterior, 'event_log' as origen, created_at as fecha_cambio, metadata FROM dictamen_events WHERE dictamen_id = ? ORDER BY created_at ASC").bind(id).all<any>();

    return c.json({
      dictamen,
      history: history.results || []
    });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

app.get('/api/v1/analytics/multidimensional', async (c) => {
  const db = c.env.DB;
  const yearFrom = parseOptionalInt(c.req.query('yearFrom'));
  const yearTo = parseOptionalInt(c.req.query('yearTo'));

  try {
    let baseWhere = "WHERE 1=1";
    let binds: any[] = [];
    if (yearFrom !== null) { baseWhere += " AND anio >= ?"; binds.push(yearFrom); }
    if (yearTo !== null) { baseWhere += " AND anio <= ?"; binds.push(yearTo); }

    // 1. Volumetría y Jurisprudencia por año
    const volRes = await db.prepare(`
      SELECT 
        anio, 
        COUNT(*) as count,
        SUM(CASE WHEN criterio = 'Genera Jurisprudencia' THEN 1 ELSE 0 END) as jurisprudencia,
        SUM(CASE WHEN estado = 'vectorized' THEN 1 ELSE 0 END) as vectorized
      FROM dictamenes 
      ${baseWhere} 
      AND anio IS NOT NULL 
      GROUP BY anio 
      ORDER BY anio ASC
    `).bind(...binds).all<any>();

    // 2. Transaccionalidad
    const statusRes = await db.prepare(`SELECT estado, COUNT(*) as count FROM dictamenes ${baseWhere} GROUP BY estado`).bind(...binds).all<any>();

    // 3. Operacional
    const opsRes = await db.prepare(`SELECT en_paso, en_source, COUNT(*) as count FROM kv_sync_status GROUP BY en_paso, en_source`).all<any>();

    // 4. Semántica
    const semRes = await db.prepare(`SELECT materia, COUNT(*) as count FROM dictamenes ${baseWhere} AND materia IS NOT NULL AND TRIM(materia) != '' GROUP BY materia ORDER BY count DESC LIMIT 15`).bind(...binds).all<any>();

    const relRes = await db.prepare(`
      SELECT 
        SUM(COALESCE(a.es_relevante, 0)) as relevantes, 
        SUM(COALESCE(a.recurso_proteccion, 0)) as recursos, 
        SUM(CASE WHEN d.criterio = 'Genera Jurisprudencia' THEN 1 ELSE 0 END) as jurisprudencia
      FROM atributos_juridicos a 
      LEFT JOIN enriquecimiento e ON a.dictamen_id = e.dictamen_id
      INNER JOIN dictamenes d ON a.dictamen_id = d.id
      ${baseWhere}
    `).bind(...binds).first<any>();

    return c.json({
      volumetria: volRes.results || [],
      transaccional: statusRes.results || [],
      operacional: opsRes.results || [],
      semantica: {
        topMaterias: semRes.results || [],
        impacto: relRes || {}
      }
    });
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
      if (!rawJson) continue;

      const sourceContent = rawJson?._source ?? rawJson?.source ?? rawJson?.raw_data ?? rawJson;
      const textToEmbed = `
            Título: ${enrichment.titulo}
            Resumen: ${enrichment.resumen}
            Análisis: ${enrichment.analisis}
        `.trim();

      await upsertRecord(c.env, {
        id: id,
        metadata: {
          ...enrichment,
          descriptores_AI: enrichment.etiquetas_json ? JSON.parse(enrichment.etiquetas_json) : [],
          materia: sourceContent?.materia || "",
          descriptores_originales: sourceContent?.descriptores ? String(sourceContent.descriptores).split(/[,;\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 2) : [],
          fecha: String(sourceContent?.fecha_documento || ''),
          model: enrichment.modelo_llm || c.env.MISTRAL_MODEL,
          analisis: enrichment.analisis || ""
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

app.post('/api/v1/trigger/canonical-relations', async (c) => {
  if (c.env.ENVIRONMENT === 'prod') {
    const token = c.req.header('x-admin-token');
    if (!token || token !== c.env.INGEST_TRIGGER_TOKEN) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
  }
  const params = await readJsonBody(c);
  if (c.env.CANONICAL_RELATIONS_WORKFLOW) {
    const defaultParams = {
      limit: parsePositiveInt(params.limit, 100, 1, 1000),
      offset: parsePositiveInt(params.offset, 0, 0, 1000000),
      recursive: params.recursive !== false,
      onlyFlagged: params.onlyFlagged !== false
    };
    const instance = await c.env.CANONICAL_RELATIONS_WORKFLOW.create({ params: defaultParams });
    logInfo('CANONICAL_REL_WORKFLOW_CREATED', { workflowId: instance.id, ...defaultParams });
    return c.json({ status: 'started', instanceId: instance.id, message: 'Workflow temporal de relaciones canonicas iniciado', params: defaultParams });
  }
  return c.json({ error: 'Binding CANONICAL_RELATIONS_WORKFLOW no disponible.' }, 500);
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
    const res = await fetchDictamenesSearchPage(c.env.CGR_BASE_URL, 0, options, undefined, '');
    return c.json({ success: true, count: res.items.length, first: res.items[0] ? extractDictamenId(res.items[0]) : null });
  } catch (e: any) {
    return c.json({ success: false, error: errorMessage(e) }, 500);
  }
});

app.post('/api/v1/test/pinecone', async (c) => {
  const testId = "UNIT_TEST_METADATA_V2";
  const testData = {
    titulo: "Prueba Unitaria de Metadatos V2",
    resumen: "Verificación de descriptores_AI mediante endpoint de prueba",
    descriptores_AI: ["test_etiqueta_1", "test_etiqueta_2", "auditoria"],
    descriptores_originales: ["original_test"],
    u_time: Math.floor(Date.now() / 1000),
    fecha: new Date().toISOString().split('T')[0]
  };

  try {
    await upsertRecord(c.env, {
      id: testId,
      metadata: {
        ...testData,
        analisis: testData.resumen // El cliente concatenará esto
      }
    });

    return c.json({
      success: true,
      message: "Test record sent to Pinecone.",
      id: testId,
      sent_metadata: testData
    });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
    const db = env.DB;
    const kv = env.DICTAMENES_SOURCE;
    const maxConcurrency = 15;

    // Process messages in the batch with limited concurrency
    for (let i = 0; i < batch.messages.length; i += maxConcurrency) {
      const chunk = batch.messages.slice(i, i + maxConcurrency);

      await Promise.all(chunk.map(async (msg) => {
        const id = msg.body as string;
        try {
          const kvKey = id.trim();
          let rawJsonString = await kv.get(kvKey, { type: 'text' }).catch(() => null);

          if (!rawJsonString) {
            console.error(`${id}: KV returnado null para key. Marcando como sin_kv.`);
            await db.prepare("UPDATE dictamenes SET origen_importacion = 'missing_kv', estado = 'sin_kv' WHERE id = ?").bind(id).run();
            msg.ack(); // Missing, no use in retrying
            return;
          }

          const rawJson = JSON.parse(rawJsonString);
          const source = rawJson._source ?? rawJson.source ?? (rawJson as any).raw_data ?? rawJson;

          const oldUrl = typeof source.old_url === 'string' ? source.old_url.trim() || null : null;
          let caracter = typeof source.carácter === 'string' ? source.carácter.trim() || null : null;
          if (!caracter) caracter = typeof source.caracter === 'string' ? source.caracter.trim() || null : null;

          const divisionId = await getOrInsertDivisionId(db, source.origenes ?? '');

          if (!oldUrl && !divisionId) {
            await db.prepare("UPDATE dictamenes SET origen_importacion = 'repaired_incomplete' WHERE id = ?").bind(id).run();
          } else {
            await db.prepare(
              `UPDATE dictamenes SET old_url = COALESCE(old_url, ?), division_id = COALESCE(division_id, ?) WHERE id = ?`
            ).bind(oldUrl, divisionId, id).run();
          }

          await db.prepare(
            `UPDATE atributos_juridicos SET caracter = COALESCE(caracter, ?) WHERE dictamen_id = ?`
          ).bind(caracter, id).run();

          msg.ack();
        } catch (err: any) {
          console.error(`Queue repair failed for ${id}`, err);
          msg.retry();
        }
      }));
    }
  },

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
