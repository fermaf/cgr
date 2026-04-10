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
  getDictamenRelacionesJuridicas,
  createBoletin,
  getBoletin,
  listBoletines,
  getBoletinEntregables
} from './storage/d1';
import type { Env, DictamenRaw } from './types';
import { IngestWorkflow } from './workflows/ingestWorkflow';
import { EnrichmentWorkflow } from './workflows/enrichmentWorkflow';
import { VectorizationWorkflow } from './workflows/vectorizationWorkflow';
import { KVSyncWorkflow } from './workflows/kvSyncWorkflow';
import { CanonicalRelationsWorkflow } from './workflows/canonicalRelationsWorkflow';
import { DoctrinalMetadataWorkflow } from './workflows/doctrinalMetadataWorkflow';
import { RegimenBackfillWorkflow } from './workflows/regimenBackfillWorkflow';
import { BoletinMultimediaWorkflow } from './workflows/boletinMultimediaWorkflow';
import { analyzeDictamen } from './clients/mistral';
import { fetchDictamenesSearchPage } from './clients/cgr';
import { ingestDictamen, extractDictamenId } from './lib/ingest';
import { applyRetroUpdates } from './lib/relations';
import { buildDoctrineClusters } from './lib/doctrineClusters';
import { reprocessDoctrinalMetadata } from './lib/doctrinalMetadata';
import { runRegimenPilot } from './lib/regimenDiscovery';
import { buildAndPersistRegimen } from './lib/regimenBuilder';
import { buildDoctrineLines, buildDoctrineSearch } from './lib/doctrineLines';
import { buildGuidedDoctrineFlow, buildGuidedDoctrineFamily } from './lib/doctrineGuided';
import { normalizeQueryLight } from './lib/queryUnderstanding/queryRewrite';
import { normalizeLegalSourceForPresentation } from './lib/legalSourcesCanonical';
import { logInfo, logError, setLogLevel } from './lib/log';
import { validateElevenLabsAuth } from './lib/agents/elevenLabsSpeaker';

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

type DictamenFuenteLegalRow = {
  tipo_norma: string | null;
  numero: string | null;
  articulo: string | null;
  extra: string | null;
  year: string | null;
  sector: string | null;
  mentions: number;
};

type DictamenRelationDetailRow = {
  related_id: string;
  tipo_accion: string;
  fecha_documento: string | null;
  titulo: string | null;
};

function relationBucket(tipoAccion: string | null): 'consolida' | 'desarrolla' | 'ajusta' {
  if (!tipoAccion) return 'ajusta';
  if (tipoAccion === 'confirmado' || tipoAccion === 'aplicado') return 'consolida';
  if (tipoAccion === 'complementado' || tipoAccion === 'aclarado') return 'desarrolla';
  return 'ajusta';
}

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

async function getSourceJsonWithFallback(env: Env, rawKey: string): Promise<unknown | null> {
  const candidates = rawKey.startsWith('dictamen:') ? [rawKey, rawKey.replace(/^dictamen:/, '')] : [rawKey, `dictamen:${rawKey}`];
  for (const candidate of candidates) {
    const rawJson = await env.DICTAMENES_SOURCE.get(candidate, 'json').catch(() => null);
    if (rawJson) return rawJson;
  }
  return null;
}

// Exportamos las clases Workflow para que Cloudflare pueda asociarlas (bind)
export {
  IngestWorkflow,
  EnrichmentWorkflow,
  VectorizationWorkflow,
  KVSyncWorkflow,
  CanonicalRelationsWorkflow,
  DoctrinalMetadataWorkflow,
  BoletinMultimediaWorkflow
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
// --- BOLETINES MULTIMEDIA ---

app.get('/api/v1/boletines/stats', async (c) => {
  try {
    const candidates = await c.env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM dictamenes d
      INNER JOIN atributos_juridicos a ON a.dictamen_id = d.id
      WHERE a.en_boletin = 1 OR a.es_relevante = 1 OR a.recurso_proteccion = 1
    `).first<{ count: number }>();
    
    const lastBoletin = await c.env.DB.prepare("SELECT created_at FROM tabla_boletines ORDER BY created_at DESC LIMIT 1").first<{ created_at: string }>();
    
    return c.json({ 
      data: { 
        candidates: candidates?.count ?? 0,
        last_generated: lastBoletin?.created_at ?? null
      } 
    });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

app.get('/api/v1/boletines', async (c) => {
  const limit = parsePositiveInt(c.req.query('limit'), 20, 1, 100);
  try {
    const list = await listBoletines(c.env.DB, limit);
    return c.json({ data: list });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

app.get('/api/v1/boletines/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const boletin = await getBoletin(c.env.DB, id);
    if (!boletin) return c.json({ error: 'No encontrado' }, 404);
    
    const entregables = await getBoletinEntregables(c.env.DB, id);
    return c.json({ data: { ...boletin, entregables } });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

app.post('/api/v1/boletines', async (c) => {
  const body = await readJsonBody(c);
  const id = (body.id as string) || crypto.randomUUID();
  const fechaInicio = (body.fecha_inicio as string) || new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const fechaFin = (body.fecha_fin as string) || new Date().toISOString().split('T')[0];
  
  try {
    await createBoletin(c.env.DB, {
      id,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      filtro_boletin: body.filtro_boletin ? 1 : 0,
      filtro_relevante: body.filtro_relevante ? 1 : 0,
      filtro_recurso_prot: body.filtro_recurso_prot ? 1 : 0
    });

    const workflow = await c.env.BOLETIN_WORKFLOW.create({
      params: { boletinId: id }
    });

    return c.json({ success: true, id, workflowInstanceId: workflow.id });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

// Proxy de herramientas para el ElevenLabs Agent (Custom Header Auth)
app.get('/api/v1/tools/elevenlabs/latest-script', async (c) => {
  if (!validateElevenLabsAuth(c, c.env)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    // Retornamos el script del último boletín generado como ejemplo
    const latest = await c.env.DB.prepare(
      "SELECT content_text FROM tabla_boletines_entregables WHERE canal = 'YOUTUBE_SHORTS' ORDER BY id DESC LIMIT 1"
    ).first<{ content_text: string }>();
    
    return c.json({ 
      text: latest?.content_text || "Bienvenidos a Indubia. Aún no hay boletines procesados.",
      voice_id: 'pNInz6obpgnuMvYJdGRp' 
    });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

app.get('/api/v1/assets/image/:key', async (c) => {
  if (!c.req.param('key')) return c.json({ error: 'Falta key' }, 400);
  try {
    const key = c.req.param('key');
    const imageBytes = await c.env.DICTAMENES_PASO.get(key, 'arrayBuffer');
    
    if (!imageBytes) {
      return c.json({ error: 'Asset no encontrado' }, 404);
    }
    
    return c.body(imageBytes, 200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400'
    });
  } catch (e: any) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

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

app.get('/api/v1/analytics/doctrine-clusters', async (c) => {
  const materia = c.req.query('materia')?.trim() || null;
  const limit = parsePositiveInt(c.req.query('limit'), 5, 1, 10);
  const topK = parsePositiveInt(c.req.query('topK'), 8, 3, 20);
  const fromDate = isIsoDateYmd(c.req.query('fromDate')) ? c.req.query('fromDate')! : null;
  const toDate = isIsoDateYmd(c.req.query('toDate')) ? c.req.query('toDate')! : null;
  const cacheKey = `analytics:doctrine-clusters:v1:m:${materia ?? 'auto'}:l:${limit}:k:${topK}:fd:${fromDate ?? 'na'}:td:${toDate ?? 'na'}`;

  try {
    const cached = await c.env.DICTAMENES_PASO.get(cacheKey, 'json').catch(() => null);
    if (cached && typeof cached === 'object') {
      logInfo('ANALYTICS_DOCTRINE_CLUSTERS_CACHE_HIT', { cacheKey, materia, limit, topK, fromDate, toDate });
      return c.json(cached);
    }

    const response = await buildDoctrineClusters(c.env, {
      materia,
      limit,
      topK,
      fromDate,
      toDate
    });

    await putAnalyticsCache(c, cacheKey, response);
    logInfo('ANALYTICS_DOCTRINE_CLUSTERS_DONE', {
      materia: response.materia,
      limit,
      topK,
      fromDate,
      toDate,
      totalConsidered: response.stats.total_dictamenes_considerados,
      totalClusters: response.stats.total_clusters_generados
    });
    return c.json(response);
  } catch (e: unknown) {
    logError('ANALYTICS_DOCTRINE_CLUSTERS_ERROR', e, { materia, limit, topK, fromDate, toDate });
    return c.json({ error: errorMessage(e) }, 500);
  }
});

app.get('/api/v1/insights/doctrine-lines', async (c) => {
  const materia = c.req.query('materia')?.trim() || null;
  const limit = parsePositiveInt(c.req.query('limit'), 5, 1, 10);
  const fromDate = isIsoDateYmd(c.req.query('fromDate')) ? c.req.query('fromDate')! : null;
  const toDate = isIsoDateYmd(c.req.query('toDate')) ? c.req.query('toDate')! : null;
  const cacheKey = `insights:doctrine-lines:v7:m:${materia ?? 'auto'}:l:${limit}:fd:${fromDate ?? 'na'}:td:${toDate ?? 'na'}`;

  try {
    const cached = await c.env.DICTAMENES_PASO.get(cacheKey, 'json').catch(() => null);
    if (cached && typeof cached === 'object') {
      logInfo('INSIGHTS_DOCTRINE_LINES_CACHE_HIT', { cacheKey, materia, limit, fromDate, toDate });
      return c.json(cached);
    }

    const response = await buildDoctrineLines(c.env, {
      materia,
      fromDate,
      toDate,
      limit
    });

    await putAnalyticsCache(c, cacheKey, response);
    logInfo('INSIGHTS_DOCTRINE_LINES_DONE', {
      materia: response.overview.materiaEvaluated,
      limit,
      fromDate,
      toDate,
      totalLines: response.overview.totalLines,
      dominantTheme: response.overview.dominantTheme
    });
    return c.json(response);
  } catch (e: unknown) {
    logError('INSIGHTS_DOCTRINE_LINES_ERROR', e, { materia, limit, fromDate, toDate });
    return c.json({ error: errorMessage(e) }, 500);
  }
});

app.get('/api/v1/insights/doctrine-search', async (c) => {
  const qRaw = c.req.query('q')?.trim() || '';
  const q = normalizeQueryLight(qRaw);
  const limit = parsePositiveInt(c.req.query('limit'), 5, 1, 10);

  if (!q) {
    return c.json({ error: 'Missing q parameter' }, 400);
  }

  const cacheKey = `insights:doctrine-search:v31:q:${q}:l:${limit}`;

  try {
    const cached = await c.env.DICTAMENES_PASO.get(cacheKey, 'json').catch(() => null);
    if (cached && typeof cached === 'object') {
      logInfo('INSIGHTS_DOCTRINE_SEARCH_CACHE_HIT', { cacheKey, q, limit });
      return c.json(cached);
    }

    const response = await buildDoctrineSearch(c.env, { q: qRaw, limit });
    await putAnalyticsCache(c, cacheKey, response);
    logInfo('INSIGHTS_DOCTRINE_SEARCH_DONE', {
      q,
      limit,
      totalLines: response.overview.totalLines,
      dominantTheme: response.overview.dominantTheme
    });
    return c.json(response);
  } catch (e: unknown) {
    logError('INSIGHTS_DOCTRINE_SEARCH_ERROR', e, { q, limit });
    return c.json({ error: errorMessage(e) }, 500);
  }
});

app.get('/api/v1/insights/doctrine-guided', async (c) => {
  const qRaw = c.req.query('q')?.trim() || '';
  const q = normalizeQueryLight(qRaw);
  const limit = parsePositiveInt(c.req.query('limit'), 4, 1, 8);

  if (!q) {
    return c.json({ error: 'Missing q parameter' }, 400);
  }

  const cacheKey = `insights:doctrine-guided:v11:q:${q}:l:${limit}`;

  try {
    const cached = await c.env.DICTAMENES_PASO.get(cacheKey, 'json').catch(() => null);
    if (cached && typeof cached === 'object') {
      logInfo('INSIGHTS_DOCTRINE_GUIDED_CACHE_HIT', { cacheKey, q, limit });
      return c.json(cached);
    }

    const response = await buildGuidedDoctrineFlow(c.env, { q: qRaw, limit });
    await putAnalyticsCache(c, cacheKey, response);
    logInfo('INSIGHTS_DOCTRINE_GUIDED_DONE', {
      q,
      limit,
      totalFamilies: response.overview.total_families,
      focusId: response.focus_directo?.dictamen_id ?? null
    });
    return c.json(response);
  } catch (e: unknown) {
    logError('INSIGHTS_DOCTRINE_GUIDED_ERROR', e, { q, limit });
    return c.json({ error: errorMessage(e) }, 500);
  }
});

app.get('/api/v1/insights/doctrine-guided/family', async (c) => {
  const qRaw = c.req.query('q')?.trim() || '';
  const q = normalizeQueryLight(qRaw);
  const familyId = c.req.query('family_id')?.trim() || '';
  const limit = parsePositiveInt(c.req.query('limit'), 4, 1, 8);

  if (!q) {
    return c.json({ error: 'Missing q parameter' }, 400);
  }
  if (!familyId) {
    return c.json({ error: 'Missing family_id parameter' }, 400);
  }

  const cacheKey = `insights:doctrine-guided:family:v11:q:${q}:f:${familyId}:l:${limit}`;

  try {
    const cached = await c.env.DICTAMENES_PASO.get(cacheKey, 'json').catch(() => null);
    if (cached && typeof cached === 'object') {
      logInfo('INSIGHTS_DOCTRINE_GUIDED_FAMILY_CACHE_HIT', { cacheKey, q, familyId, limit });
      return c.json(cached);
    }

    const response = await buildGuidedDoctrineFamily(c.env, { q: qRaw, familyId, limit });
    await putAnalyticsCache(c, cacheKey, response);
    logInfo('INSIGHTS_DOCTRINE_GUIDED_FAMILY_DONE', {
      q,
      familyId,
      limit,
      found: response.overview.family_found
    });
    return c.json(response);
  } catch (e: unknown) {
    logError('INSIGHTS_DOCTRINE_GUIDED_FAMILY_ERROR', e, { q, familyId, limit });
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
  const normalizedQuery = normalizeQueryLight(query);
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

    if (normalizedQuery.trim() !== '') {
      try {
        const queryTrimmed = normalizedQuery.trim();
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
             const pcRes = await queryRecords(c.env, normalizedQuery, limit * 2, Object.keys(pcFilter).length > 0 ? pcFilter : undefined);
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
          const pcRes = await queryRecords(c.env, normalizedQuery, limit * 2, Object.keys(pcFilter).length > 0 ? pcFilter : undefined);
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

      if (normalizedQuery.trim() !== '') {
        const words = normalizedQuery.trim().split(/\s+/).slice(0, 5); // Incluir palabras cortas (IDs)
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
      const rawJson = await getSourceJsonWithFallback(c.env, rawRef.raw_key);
      raw = rawJson || {};
    }

    const relsIn = await db.prepare(
      `SELECT
         r.dictamen_origen_id AS related_id,
         r.tipo_accion,
         COALESCE(d.fecha_documento, d.created_at) AS fecha_documento,
         e.titulo
       FROM dictamen_relaciones_juridicas r
       LEFT JOIN dictamenes d ON d.id = r.dictamen_origen_id
       LEFT JOIN enriquecimiento e ON e.dictamen_id = r.dictamen_origen_id
       WHERE r.dictamen_destino_id = ?
       ORDER BY COALESCE(d.fecha_documento, d.created_at) DESC, r.rowid DESC
       LIMIT 100`
    ).bind(id).all<DictamenRelationDetailRow>();
    const relsOut = await db.prepare(
      `SELECT
         r.dictamen_destino_id AS related_id,
         r.tipo_accion,
         COALESCE(d.fecha_documento, d.created_at) AS fecha_documento,
         e.titulo
       FROM dictamen_relaciones_juridicas r
       LEFT JOIN dictamenes d ON d.id = r.dictamen_destino_id
       LEFT JOIN enriquecimiento e ON e.dictamen_id = r.dictamen_destino_id
       WHERE r.dictamen_origen_id = ?
       ORDER BY COALESCE(d.fecha_documento, d.created_at) DESC, r.rowid DESC
       LIMIT 100`
    ).bind(id).all<DictamenRelationDetailRow>();
    const fuentes = await db.prepare(
      `SELECT
         NULLIF(TRIM(tipo_norma), '') AS tipo_norma,
         NULLIF(TRIM(numero), '') AS numero,
         NULLIF(TRIM(articulo), '') AS articulo,
         NULLIF(TRIM(extra), '') AS extra,
         NULLIF(TRIM(year), '') AS year,
         NULLIF(TRIM(sector), '') AS sector,
         COUNT(*) AS mentions
       FROM dictamen_fuentes_legales
       WHERE dictamen_id = ?
       GROUP BY
         NULLIF(TRIM(tipo_norma), ''),
         NULLIF(TRIM(numero), ''),
         NULLIF(TRIM(articulo), ''),
         NULLIF(TRIM(extra), ''),
         NULLIF(TRIM(year), ''),
         NULLIF(TRIM(sector), '')
       ORDER BY mentions DESC, tipo_norma ASC, numero ASC, articulo ASC`
    ).bind(id).all<DictamenFuenteLegalRow>();

    return c.json({
      meta: {
        id: doc.id,
        numero: doc.numero || id.substring(0, 8),
        anio: doc.anio || (doc.fecha_documento ? parseInt(doc.fecha_documento.split('-')[0], 10) : null),
        fecha_documento: doc.fecha_documento || '',
        materia: doc.materia || 'Sin materia',
        estado: doc.estado,
        division_nombre: 'Contraloría General de la República',
        relaciones_causa: (relsIn.results || []).map((relation) => ({
          origen_id: relation.related_id,
          tipo_accion: relation.tipo_accion,
          fecha_documento: relation.fecha_documento,
          titulo: relation.titulo,
          bucket: relationBucket(relation.tipo_accion)
        })),
        relaciones_efecto: (relsOut.results || []).map((relation) => ({
          destino_id: relation.related_id,
          tipo_accion: relation.tipo_accion,
          fecha_documento: relation.fecha_documento,
          titulo: relation.titulo,
          bucket: relationBucket(relation.tipo_accion)
        })),
        fuentes_legales: (fuentes.results || []).map((source) => normalizeLegalSourceForPresentation(source))
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
  const requestedStatuses = Array.isArray(body.allowedStatuses)
    ? body.allowedStatuses.filter((value): value is 'ingested' | 'ingested_importante' | 'ingested_trivial' | 'error_quota' =>
      value === 'ingested' || value === 'ingested_importante' || value === 'ingested_trivial' || value === 'error_quota')
    : undefined;
  const allowedStatuses = requestedStatuses && requestedStatuses.length > 0 ? requestedStatuses : undefined;

  const instance = await c.env.ENRICHMENT_WORKFLOW.create({
    params: { batchSize, delayMs, recursive, allowedStatuses }
  });
  logInfo('ENRICHMENT_WORKFLOW_CREATED', { workflowId: instance.id, batchSize, delayMs, recursive, allowedStatuses: allowedStatuses ?? null });
  return c.json({ success: true, workflowId: instance.id, params: { batchSize, delayMs, recursive, allowedStatuses: allowedStatuses ?? null } });
});

app.post('/api/v1/dictamenes/batch-vectorize', async (c) => {
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

  const instance = await c.env.VECTORIZATION_WORKFLOW.create({
    params: { batchSize, delayMs, recursive }
  });
  logInfo('VECTORIZATION_WORKFLOW_CREATED', { workflowId: instance.id, batchSize, delayMs, recursive });
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
      rawJson = await getSourceJsonWithFallback(c.env, rawRef.raw_key);
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

  let rawJson = await getSourceJsonWithFallback(c.env, rawRef.raw_key) as DictamenRaw | null;
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

    await updateDictamenStatus(db, id, 'enriched_pending_vectorization', 'MANUAL_UPDATE', {
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

      const rawJson: any = await getSourceJsonWithFallback(c.env, rawRef.raw_key);
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
    const requestedIds = Array.isArray(params.dictamenIds)
      ? params.dictamenIds.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0).map((value: string) => value.trim())
      : [];
    const requestedRunTag = typeof params.runTag === 'string' && params.runTag.trim().length > 0
      ? params.runTag.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)
      : undefined;
    const defaultParams = {
      limit: parsePositiveInt(params.limit, 100, 1, 1000),
      offset: parsePositiveInt(params.offset, 0, 0, 1000000),
      recursive: requestedIds.length > 0 ? false : params.recursive !== false,
      onlyFlagged: params.onlyFlagged !== false,
      dictamenIds: requestedIds.length > 0 ? [...new Set(requestedIds)] : undefined,
      runTag: requestedRunTag
    };
    const instance = await c.env.CANONICAL_RELATIONS_WORKFLOW.create({ params: defaultParams });
    logInfo('CANONICAL_REL_WORKFLOW_CREATED', { workflowId: instance.id, ...defaultParams });
    return c.json({ status: 'started', instanceId: instance.id, message: 'Workflow temporal de relaciones canonicas iniciado', params: defaultParams });
  }
  return c.json({ error: 'Binding CANONICAL_RELATIONS_WORKFLOW no disponible.' }, 500);
});

app.post('/api/v1/trigger/doctrinal-metadata-reprocess', async (c) => {
  if (c.env.ENVIRONMENT === 'prod') {
    const token = c.req.header('x-admin-token');
    if (!token || token !== c.env.INGEST_TRIGGER_TOKEN) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
  }

  const params = await readJsonBody(c);
  if (!c.env.DOCTRINAL_METADATA_WORKFLOW) {
    return c.json({ error: 'Binding DOCTRINAL_METADATA_WORKFLOW no disponible.' }, 500);
  }

  const requestedIds = Array.isArray(params.dictamenIds)
    ? params.dictamenIds
      .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value: string) => value.trim())
      .slice(0, 500)
    : [];
  const requestedRunTag = typeof params.runTag === 'string' && params.runTag.trim().length > 0
    ? params.runTag.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)
    : undefined;
  const defaultParams = {
    limit: parsePositiveInt(params.limit, 50, 1, 200),
    offset: parsePositiveInt(params.offset, 0, 0, 1000000),
    recursive: requestedIds.length > 0 ? false : params.recursive !== false,
    delayMs: parsePositiveInt(params.delayMs, 1200, 0, 10000),
    dictamenIds: requestedIds.length > 0 ? [...new Set(requestedIds)] : undefined,
    sourceSnapshotVersion: typeof params.sourceSnapshotVersion === 'string' && params.sourceSnapshotVersion.trim().length > 0
      ? params.sourceSnapshotVersion.trim()
      : 'workflow_reprocess',
    runTag: requestedRunTag
  };
  const instance = await c.env.DOCTRINAL_METADATA_WORKFLOW.create({ params: defaultParams });
  logInfo('DOCTRINAL_METADATA_WORKFLOW_CREATED', {
    workflowId: instance.id,
    ...defaultParams,
    mistralModel: 'mistral-large-2411',
    aiGatewayUrl: c.env.MISTRAL_API_URL
  });
  return c.json({
    status: 'started',
    instanceId: instance.id,
    message: 'Workflow de metadata doctrinal iniciado',
    params: defaultParams
  });
});

app.post('/api/v1/admin/relations-gap/analyze', async (c) => {
  if (c.env.ENVIRONMENT === 'prod') {
    const token = c.req.header('x-admin-token');
    if (!token || token !== c.env.INGEST_TRIGGER_TOKEN) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
  }

  const body = await readJsonBody(c);
  const dictamenIds = Array.isArray(body.dictamenIds)
    ? [...new Set(body.dictamenIds.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0).map((value: string) => value.trim()))].slice(0, 20)
    : [];
  if (dictamenIds.length === 0) {
    return c.json({ error: 'dictamenIds requerido' }, 400);
  }

  const model = typeof body.model === 'string' && body.model.trim().length > 0
    ? body.model.trim()
    : 'mistral-large-2411';
  const apply = isTruthy(body.apply);
  const results: Array<Record<string, unknown>> = [];

  for (const id of dictamenIds) {
    const rawRef = await getLatestRawRef(c.env.DB, id);
    if (!rawRef) {
      results.push({ id, error: 'RAW_REF_NOT_FOUND', applied: false, acciones_juridicas_emitidas: [] });
      continue;
    }

    const rawJson = await getSourceJsonWithFallback(c.env, rawRef.raw_key) as DictamenRaw | null;
    if (!rawJson) {
      results.push({ id, error: 'RAW_JSON_NOT_FOUND', applied: false, acciones_juridicas_emitidas: [] });
      continue;
    }

    const analysis = await analyzeDictamen(c.env, rawJson, model);
    if (!analysis.result) {
      results.push({ id, error: analysis.error || 'LLM_ANALYSIS_FAILED', applied: false, acciones_juridicas_emitidas: [] });
      continue;
    }

    const acciones = Array.isArray(analysis.result.acciones_juridicas_emitidas)
      ? analysis.result.acciones_juridicas_emitidas
      : [];

    if (apply && acciones.length > 0) {
      await applyRetroUpdates(c.env, id, acciones, {
        origenExtraccion: 'llm_gap_v1',
        orphanPrefix: 'llm_gap_v1'
      });
    }

    results.push({
      id,
      applied: apply && acciones.length > 0,
      acciones_juridicas_emitidas: acciones,
      error: null
    });
  }

  return c.json({ success: true, model, apply, count: results.length, results });
});

app.post('/api/v1/admin/doctrinal-metadata/reprocess', async (c) => {
  if (c.env.ENVIRONMENT === 'prod') {
    const token = c.req.header('x-admin-token');
    if (!token || token !== c.env.INGEST_TRIGGER_TOKEN) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
  }

  try {
    const body = await readJsonBody(c);
    const dictamenIds = Array.isArray(body.dictamenIds)
      ? [...new Set(body.dictamenIds.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0).map((value: string) => value.trim()))].slice(0, 200)
      : undefined;

    const result = await reprocessDoctrinalMetadata(c.env, {
      dictamenIds,
      limit: parsePositiveInt(body.limit, 100, 1, 500),
      offset: parsePositiveInt(body.offset, 0, 0, 1000000),
      sourceSnapshotVersion: typeof body.sourceSnapshotVersion === 'string' && body.sourceSnapshotVersion.trim().length > 0
        ? body.sourceSnapshotVersion.trim()
        : 'admin_reprocess'
    });

    logInfo('DOCTRINAL_METADATA_REPROCESS_DONE', {
      processed: result.processed,
      pipelineVersion: result.pipeline_version,
      explicitIds: dictamenIds?.length ?? 0
    });

    return c.json({ success: true, ...result });
  } catch (e: unknown) {
    logError('DOCTRINAL_METADATA_REPROCESS_ERROR', e, {});
    return c.json({ error: errorMessage(e) }, 500);
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

// ── PILOTO: Descubrimiento de Regímenes Jurisprudenciales (Fase 0) ──
// Endpoint temporal para ejecutar el piloto de descubrimiento de regímenes.
// Procesa UNA semilla por request para no exceder el wall-clock del Worker.
// Uso:
//   1) GET /api/v1/pilot/regimenes/seeds           → lista las semillas disponibles
//   2) GET /api/v1/pilot/regimenes?seedIndex=0     → expande la semilla índice 0
//   3) GET /api/v1/pilot/regimenes?seedIndex=1     → expande la semilla índice 1
//   ... etc.

// ── Endpoint: Dispara el Workflow de backfill de regímenes ────────────
// El pipeline de buildAndPersistRegimen es demasiado pesado para un
// request HTTP directo (timeout). Se delega al Workflow de CF que
// maneja cada semilla como un step.do() independiente con reintentos.
app.post('/api/v1/pilot/regimenes/backfill', async (c) => {
  const token = c.req.header('x-admin-token');
  if (!token || token !== c.env.INGEST_TRIGGER_TOKEN) {
    return c.json({ error: 'Se requiere autenticación admin' }, 403);
  }
  try {
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const seedIndexes = Array.isArray(body.seedIndexes) ? body.seedIndexes as number[] : undefined;
    const forceUpdate = typeof body.forceUpdate === 'boolean' ? body.forceUpdate : false;
    const pipelineVersion = typeof body.pipelineVersion === 'string' ? body.pipelineVersion : '1.0.0-pilot';
    const runTag = typeof body.runTag === 'string' ? body.runTag : undefined;

    const instance = await c.env.REGIMEN_BACKFILL_WORKFLOW.create({
      params: { seedIndexes, forceUpdate, pipelineVersion, runTag }
    });

    logInfo('REGIMEN_BACKFILL_WORKFLOW_TRIGGERED', {
      instanceId: instance.id,
      seedIndexes: seedIndexes ?? 'all-0-19',
      forceUpdate,
      pipelineVersion
    });

    return c.json({
      success: true,
      message: 'Workflow de backfill de regímenes iniciado',
      instanceId: instance.id,
      params: { seedIndexes: seedIndexes ?? 'all-0-19', forceUpdate, pipelineVersion }
    });
  } catch (e: unknown) {
    logError('REGIMEN_BACKFILL_TRIGGER_ERROR', e);
    return c.json({ error: errorMessage(e) }, 500);
  }
});

// ── Endpoints PÚBLICOS de regímenes (sin autenticación) ──────────────
// Usados por el frontend para mostrar el contexto jurisprudencial.

// GET /api/v1/public/regimenes — Lista regímenes con paginación y filtros
app.get('/api/v1/public/regimenes', async (c) => {
  try {
    const estado  = c.req.query('estado') ?? null;
    const limit   = parsePositiveInt(c.req.query('limit'),  20, 1, 100);
    const offset  = parsePositiveInt(c.req.query('offset'),  0, 0, 10000);

    const validEstados = ['activo', 'desplazado', 'zona_litigiosa', 'en_transicion'];
    const estadoFiltro = estado && validEstados.includes(estado) ? estado : null;

    let query = `
      SELECT r.id, r.nombre, r.estado,
             r.estabilidad, r.confianza,
             r.fecha_criterio_fundante, r.fecha_ultimo_pronunciamiento,
             r.dictamen_rector_id,
             COUNT(DISTINCT nr.norma_key) as normas_count
      FROM regimenes_jurisprudenciales r
      LEFT JOIN norma_regimen nr ON nr.regimen_id = r.id
    `;
    const bindings: (string | number)[] = [];
    if (estadoFiltro) { query += ` WHERE r.estado = ?`; bindings.push(estadoFiltro); }
    query += ` GROUP BY r.id ORDER BY r.confianza DESC, r.estabilidad DESC LIMIT ? OFFSET ?`;
    bindings.push(limit, offset);

    const rows = await c.env.DB.prepare(query).bind(...bindings).all<Record<string, unknown>>();
    return c.json({
      total: rows.results?.length ?? 0,
      offset,
      limit,
      regimenes: rows.results ?? []
    });
  } catch (e: unknown) {
    logError('PUBLIC_REGIMENES_LIST_ERROR', e);
    return c.json({ error: 'Error interno' }, 500);
  }
});

// GET /api/v1/public/regimenes/:id — Detalle de un régimen con normas y timeline
app.get('/api/v1/public/regimenes/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const regimen = await c.env.DB.prepare(
      `SELECT id, nombre, estado, estado_razon,
              estabilidad, confianza,
              fecha_criterio_fundante, fecha_ultimo_pronunciamiento,
              dictamen_rector_id, dictamen_fundante_id
       FROM regimenes_jurisprudenciales WHERE id = ?`
    ).bind(id).first<Record<string, unknown>>();
    if (!regimen) return c.json({ error: `Régimen no encontrado` }, 404);

    const normas = await c.env.DB.prepare(
      `SELECT norma_key, tipo_norma, numero, articulo, centralidad, dictamenes_count
       FROM norma_regimen WHERE regimen_id = ?
       ORDER BY dictamenes_count DESC LIMIT 20`
    ).bind(id).all<Record<string, unknown>>();

    const timeline = await c.env.DB.prepare(
      `SELECT rt.dictamen_id, rt.fecha, rt.tipo_evento, rt.descripcion, rt.impacto,
              e.titulo
       FROM regimen_timeline rt
       LEFT JOIN enriquecimiento e ON e.dictamen_id = rt.dictamen_id
       WHERE rt.regimen_id = ?
       ORDER BY rt.fecha ASC`
    ).bind(id).all<Record<string, unknown>>();

    return c.json({
      regimen,
      normas: normas.results ?? [],
      timeline: timeline.results ?? []
    });
  } catch (e: unknown) {
    logError('PUBLIC_REGIMEN_DETAIL_ERROR', e);
    return c.json({ error: 'Error interno' }, 500);
  }
});

// GET /api/v1/public/regimenes/:id/dictamenes — Dictámenes miembros de un régimen
app.get('/api/v1/public/regimenes/:id/dictamenes', async (c) => {
  const id    = c.req.param('id');
  const limit = parsePositiveInt(c.req.query('limit'), 20, 1, 100);
  const rol   = c.req.query('rol') ?? null; // 'semilla' | 'miembro' | 'referencia_entrante'
  try {
    const existe = await c.env.DB.prepare(
      `SELECT id FROM regimenes_jurisprudenciales WHERE id = ?`
    ).bind(id).first<{ id: string }>();
    if (!existe) return c.json({ error: 'Régimen no encontrado' }, 404);

    let q = `
      SELECT rd.dictamen_id, rd.rol, rd.estado_vigencia,
             e.titulo, d.fecha_documento,
             at.accion_cgr
      FROM regimen_dictamenes rd
      JOIN dictamenes d ON d.id = rd.dictamen_id
      LEFT JOIN enriquecimiento e ON e.dictamen_id = rd.dictamen_id
      LEFT JOIN atributos_juridicos at ON at.dictamen_id = rd.dictamen_id
      WHERE rd.regimen_id = ?
    `;
    const binds: (string | number)[] = [id];
    if (rol) { q += ` AND rd.rol = ?`; binds.push(rol); }
    q += ` ORDER BY rd.rol = 'semilla' DESC, d.fecha_documento DESC LIMIT ?`;
    binds.push(limit);

    const members = await c.env.DB.prepare(q).bind(...binds).all<Record<string, unknown>>();
    return c.json({
      regimen_id: id,
      total: members.results?.length ?? 0,
      dictamenes: members.results ?? []
    });
  } catch (e: unknown) {
    logError('PUBLIC_REGIMEN_MEMBERS_ERROR', e);
    return c.json({ error: 'Error interno' }, 500);
  }
});

// GET /api/v1/public/dictamenes/:id/regimen — ¿A qué régimen pertenece un dictamen?
app.get('/api/v1/public/dictamenes/:id/regimen', async (c) => {
  const dictamenId = c.req.param('id');
  try {
    const rows = await c.env.DB.prepare(`
      SELECT r.id, r.nombre, r.estado, r.confianza, r.estabilidad,
             r.fecha_criterio_fundante, r.fecha_ultimo_pronunciamiento,
             r.dictamen_rector_id, rd.rol
      FROM regimen_dictamenes rd
      JOIN regimenes_jurisprudenciales r ON r.id = rd.regimen_id
      WHERE rd.dictamen_id = ?
      ORDER BY r.confianza DESC
    `).bind(dictamenId).all<Record<string, unknown>>();

    if (!rows.results?.length) {
      return c.json({ dictamen_id: dictamenId, regimen: null });
    }
    // Devuelve el régimen de mayor confianza al que pertenece este dictamen
    return c.json({ dictamen_id: dictamenId, regimen: rows.results[0] });
  } catch (e: unknown) {
    logError('PUBLIC_DICTAMEN_REGIMEN_ERROR', e);
    return c.json({ error: 'Error interno' }, 500);
  }
});

// ── Endpoint: Consultar regímenes ya persistidos en D1 ────────────────

app.get('/api/v1/regimenes', async (c) => {
  const token = c.req.header('x-admin-token');
  if (!token || token !== c.env.INGEST_TRIGGER_TOKEN) {
    return c.json({ error: 'Se requiere autenticación admin' }, 403);
  }
  try {
    const estado = c.req.query('estado') ?? null;
    const limit  = parsePositiveInt(c.req.query('limit'), 50, 1, 200);

    let query = `
      SELECT r.id, r.nombre, r.estado, r.estado_razon,
             r.estabilidad, r.confianza, r.cobertura_corpus,
             r.fecha_criterio_fundante, r.fecha_ultimo_pronunciamiento,
             r.dictamen_rector_id, r.dictamen_fundante_id,
             COUNT(DISTINCT nr.norma_key) as normas_count,
             COUNT(DISTINCT rt.id) as timeline_count
      FROM regimenes_jurisprudenciales r
      LEFT JOIN norma_regimen nr ON nr.regimen_id = r.id
      LEFT JOIN regimen_timeline rt ON rt.regimen_id = r.id
    `;
    const bindings: (string | number)[] = [];
    if (estado) { query += ` WHERE r.estado = ?`; bindings.push(estado); }
    query += ` GROUP BY r.id ORDER BY r.confianza DESC, r.estabilidad DESC LIMIT ?`;
    bindings.push(limit);

    const rows = await c.env.DB.prepare(query).bind(...bindings).all<Record<string, unknown>>();
    return c.json({ total: rows.results?.length ?? 0, regimenes: rows.results ?? [] });
  } catch (e: unknown) {
    logError('REGIMENES_LIST_ERROR', e);
    return c.json({ error: errorMessage(e) }, 500);
  }
});

// ── Endpoint: Detalle de un régimen con sus normas y timeline ─────────
app.get('/api/v1/regimenes/:id', async (c) => {
  const token = c.req.header('x-admin-token');
  if (!token || token !== c.env.INGEST_TRIGGER_TOKEN) {
    return c.json({ error: 'Se requiere autenticación admin' }, 403);
  }
  const id = c.req.param('id');
  try {
    const regimen = await c.env.DB.prepare(
      `SELECT * FROM regimenes_jurisprudenciales WHERE id = ?`
    ).bind(id).first<Record<string, unknown>>();
    if (!regimen) return c.json({ error: `Régimen '${id}' no encontrado` }, 404);

    const normas = await c.env.DB.prepare(
      `SELECT norma_key, tipo_norma, numero, articulo, centralidad, dictamenes_count
       FROM norma_regimen WHERE regimen_id = ?
       ORDER BY dictamenes_count DESC`
    ).bind(id).all<Record<string, unknown>>();

    const timeline = await c.env.DB.prepare(
      `SELECT rt.dictamen_id, rt.fecha, rt.tipo_evento, rt.descripcion, rt.impacto,
              e.titulo
       FROM regimen_timeline rt
       LEFT JOIN enriquecimiento e ON e.dictamen_id = rt.dictamen_id
       WHERE rt.regimen_id = ?
       ORDER BY rt.fecha ASC`
    ).bind(id).all<Record<string, unknown>>();

    return c.json({
      regimen,
      normas: normas.results ?? [],
      timeline: timeline.results ?? []
    });
  } catch (e: unknown) {
    logError('REGIMEN_DETAIL_ERROR', e);
    return c.json({ error: errorMessage(e) }, 500);
  }
});


app.get('/api/v1/pilot/regimenes/seeds', async (c) => {
  const token = c.req.header('x-admin-token');
  if (!token || token !== c.env.INGEST_TRIGGER_TOKEN) {
    return c.json({ error: 'Se requiere autenticación admin' }, 403);
  }
  try {
    const { fetchSeedDictamenes } = await import('./lib/regimenDiscovery');
    const seeds = await fetchSeedDictamenes(c.env.DB, 20);
    return c.json({
      total: seeds.length,
      seeds: seeds.map((s, i) => ({
        index: i,
        id: s.id,
        titulo: s.titulo,
        fecha_documento: s.fecha_documento,
        rol_principal: s.rol_principal,
        doctrinal_centrality_score: s.doctrinal_centrality_score,
        currentness_score: s.currentness_score,
        estado_vigencia: s.estado_vigencia
      }))
    });
  } catch (e: unknown) {
    return c.json({ error: errorMessage(e) }, 500);
  }
});

app.get('/api/v1/pilot/regimenes', async (c) => {
  const token = c.req.header('x-admin-token');
  if (!token || token !== c.env.INGEST_TRIGGER_TOKEN) {
    return c.json({ error: 'Se requiere autenticación admin' }, 403);
  }

  const seedIndex = parsePositiveInt(c.req.query('seedIndex'), 0, 0, 29);

  try {
    const startedAt = Date.now();
    const { fetchSeedDictamenes, buildRegimenCandidate } = await import('./lib/regimenDiscovery');

    // Obtener solo la semilla solicitada
    const seeds = await fetchSeedDictamenes(c.env.DB, seedIndex + 1);
    if (seeds.length <= seedIndex) {
      return c.json({ error: `No hay semilla en el índice ${seedIndex}` }, 404);
    }
    const seed = seeds[seedIndex];
    const regimen = await buildRegimenCandidate(c.env.DB, seed);
    const elapsed = Date.now() - startedAt;

    logInfo('PILOT_REGIMEN_SINGLE', {
      seed_id: seed.id,
      seedIndex,
      total_members: regimen.total_members,
      normas_nucleares: regimen.normas_nucleares.length,
      elapsed_ms: elapsed
    });

    return c.json({
      _meta: {
        fase: '0 - Piloto de descubrimiento (una semilla)',
        descripcion: 'Régimen jurisprudencial descubierto bottom-up desde grafo + normas',
        seed_index: seedIndex,
        elapsed_ms: elapsed,
        nota: 'Iterar seedIndex=0,1,2... para explorar todas las semillas'
      },
      regimen
    });
  } catch (e: unknown) {
    logError('PILOT_REGIMENES_ERROR', e);
    return c.json({ error: errorMessage(e) }, 500);
  }
});


export { RegimenBackfillWorkflow };
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
