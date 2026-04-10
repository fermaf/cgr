/**
 * regimenBackfillWorkflow.ts — Backfill de Regímenes Jurisprudenciales
 *
 * Workflow Cloudflare que procesa el descubrimiento y persistencia de
 * Regímenes Jurisprudenciales semilla por semilla, de forma resiliente
 * y sin timeout.
 *
 * Cada semilla se procesa en un step.do() separado → si una falla,
 * las demás siguen. Si el Workflow se interrumpe, retoma desde el
 * último step exitoso (retención de estado por 30 días en CF Workflows).
 *
 * Parámetros:
 *   seedIndexes?: number[]   — índices específicos a procesar (por defecto 0..19)
 *   forceUpdate?: boolean    — si true, actualiza regímenes ya existentes
 *   pipelineVersion?: string — etiqueta de versión del pipeline
 *   runTag?: string          — etiqueta de identificación del run
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import type { Env } from '../types';
import {
  fetchSeedDictamenes,
  buildRegimenCandidate,
} from '../lib/regimenDiscovery';
import {
  buildAndPersistRegimen,
  type RegimenPersistResult,
} from '../lib/regimenBuilder';
import { logInfo, logError, logWarn } from '../lib/log';

// ── Parámetros del Workflow ────────────────────────────────────────────

interface RegimenBackfillParams {
  /** Índices de semillas a procesar. Por defecto: todos (0..19). */
  seedIndexes?: number[];
  /** Si true, actualiza regímenes ya existentes. Por defecto: false (solo nuevos). */
  forceUpdate?: boolean;
  /** Versión del pipeline. Por defecto: '1.0.0-pilot'. */
  pipelineVersion?: string;
  /** Etiqueta del run para trazabilidad. */
  runTag?: string;
}

// ── Workflow ─────────────────────────────────────────────────────────

export class RegimenBackfillWorkflow extends WorkflowEntrypoint<Env, RegimenBackfillParams> {
  async run(event: WorkflowEvent<RegimenBackfillParams>, step: WorkflowStep) {
    const env = this.env;
    const db  = env.DB;
    const params = event.payload ?? {};

    const pipelineVersion = params.pipelineVersion ?? '1.0.0-pilot';
    const forceUpdate     = params.forceUpdate ?? false;
    const runTag = typeof params.runTag === 'string' && params.runTag.trim().length > 0
      ? params.runTag.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)
      : event.instanceId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);

    // Normalizar índices solicitados (0..19 por defecto)
    const seedIndexes = Array.isArray(params.seedIndexes) && params.seedIndexes.length > 0
      ? [...new Set(params.seedIndexes.filter(i => typeof i === 'number' && i >= 0 && i <= 29))]
      : Array.from({ length: 20 }, (_, i) => i);

    logInfo('REGIMEN_BACKFILL_START', {
      instanceId: event.instanceId,
      seedIndexes,
      forceUpdate,
      pipelineVersion,
      runTag,
      totalSeeds: seedIndexes.length,
    });

    // ── 1. Contar semillas disponibles ──────────────────────────────
    const totalSeedsAvailable = await step.do('count-seeds-available', async () => {
      const rows = await db.prepare(`
        SELECT COUNT(*) as total
        FROM dictamenes d
        INNER JOIN enriquecimiento e ON e.dictamen_id = d.id
        INNER JOIN dictamen_metadata_doctrinal m ON m.dictamen_id = d.id
        WHERE d.estado = 'vectorized'
          AND m.rol_principal IN ('nucleo_doctrinal', 'criterio_operativo_actual')
          AND m.doctrinal_centrality_score >= 0.7
      `).first<{ total: number }>();
      return Number(rows?.total ?? 0);
    });

    logInfo('REGIMEN_BACKFILL_SEEDS_COUNTED', {
      instanceId: event.instanceId,
      totalSeedsAvailable,
      runTag,
    });

    if (totalSeedsAvailable === 0) {
      logWarn('REGIMEN_BACKFILL_NO_SEEDS', { instanceId: event.instanceId, runTag });
      return { done: true, processed: 0, errors: 0, skipped: seedIndexes.length };
    }

    // ── 2. Obtener las semillas de una sola vez ─────────────────────
    // Esto evita hacer la query de semillas en cada step.do individual.
    const maxIndex = Math.max(...seedIndexes);
    type SeedRow = { id: string; titulo: string | null };

    const seedRows = await step.do('fetch-all-seeds', async () => {
      const res = await db.prepare(`
        SELECT d.id,
               e.titulo
        FROM dictamenes d
        INNER JOIN enriquecimiento e ON e.dictamen_id = d.id
        INNER JOIN dictamen_metadata_doctrinal m ON m.dictamen_id = d.id
        WHERE d.estado = 'vectorized'
          AND m.rol_principal IN ('nucleo_doctrinal', 'criterio_operativo_actual')
          AND m.doctrinal_centrality_score >= 0.7
        ORDER BY m.doctrinal_centrality_score DESC, m.currentness_score DESC
        LIMIT ?
      `).bind(maxIndex + 1).all<SeedRow>();
      return res.results ?? [];
    });

    logInfo('REGIMEN_BACKFILL_SEEDS_FETCHED', {
      instanceId: event.instanceId,
      seedsFetched: seedRows.length,
      maxIndexRequested: maxIndex,
      runTag,
    });

    // ── 3. Procesar cada semilla como un step.do() independiente ────
    let processed    = 0;
    let errors       = 0;
    let skipped      = 0;
    const results: RegimenPersistResult[] = [];

    for (const seedIndex of seedIndexes) {
      const seedRow = seedRows[seedIndex];
      if (!seedRow) {
        logWarn('REGIMEN_BACKFILL_SEED_NOT_FOUND', { instanceId: event.instanceId, seedIndex, runTag });
        skipped++;
        continue;
      }

      const seedId   = seedRow.id;
      const stepName = `persist-regimen-${seedId}`;

      try {
        const result = await step.do(stepName, async () => {
          // Verificar si ya existe (skip si forceUpdate=false)
          if (!forceUpdate) {
            const regimenId = `regimen-${seedId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
            const existing = await db.prepare(
              `SELECT id FROM regimenes_jurisprudenciales WHERE id = ?`
            ).bind(regimenId).first<{ id: string }>();

            if (existing) {
              return {
                regimen_id: regimenId,
                regimen_nombre: seedRow.titulo ?? seedId,
                estado: 'skipped_existing',
                total_members: 0,
                normas_nucleares_count: 0,
                timeline_events: 0,
                was_upsert: false,
              } satisfies RegimenPersistResult;
            }
          }

          // Ejecutar el pipeline completo
          const persistResult = await buildAndPersistRegimen(env, seedIndex);
          if (!persistResult) {
            throw new Error(`buildAndPersistRegimen retornó null para seedIndex=${seedIndex} (seed=${seedId})`);
          }
          return persistResult;
        });

        if (result.estado === 'skipped_existing') {
          logInfo('REGIMEN_BACKFILL_SEED_SKIPPED', {
            instanceId: event.instanceId,
            seedId,
            seedIndex,
            runTag,
            reason: 'Ya existe y forceUpdate=false',
          });
          skipped++;
        } else {
          logInfo('REGIMEN_BACKFILL_SEED_DONE', {
            instanceId: event.instanceId,
            seedId,
            seedIndex,
            regimenId: result.regimen_id,
            nombre: result.regimen_nombre,
            estado: result.estado,
            members: result.total_members,
            normas: result.normas_nucleares_count,
            timeline: result.timeline_events,
            runTag,
          });
          results.push(result);
          processed++;
        }
      } catch (err: unknown) {
        errors++;
        const errMsg = err instanceof Error ? err.message : String(err);
        logError('REGIMEN_BACKFILL_SEED_ERROR', err, {
          instanceId: event.instanceId,
          seedId,
          seedIndex,
          runTag,
          error: errMsg,
        });
        // Continuamos con la siguiente semilla — no detiene el Workflow
      }

      // Pausa breve entre semillas para no saturar D1
      await step.sleep(`sleep-after-${seedId}`, '2 seconds');
    }

    // ── 4. Resumen final ────────────────────────────────────────────
    const summary = {
      done: true,
      runTag,
      processed,
      errors,
      skipped,
      totalSeedsRequested: seedIndexes.length,
      totalSeedsAvailable,
      regimenes: results.map(r => ({
        id: r.regimen_id,
        nombre: r.regimen_nombre,
        estado: r.estado,
        members: r.total_members,
        normas: r.normas_nucleares_count,
      })),
    };

    logInfo('REGIMEN_BACKFILL_DONE', {
      instanceId: event.instanceId,
      ...summary,
    });

    return summary;
  }
}
