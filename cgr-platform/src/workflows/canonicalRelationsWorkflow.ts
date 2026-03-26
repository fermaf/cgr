import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env, DictamenRaw } from '../types';
import { extractCanonicalRelationCandidates } from '../lib/relationsCanonical';
import {
  findDictamenIdByNumeroAnio,
  insertDictamenRelacionHuerfana,
  insertDictamenRelacionJuridica,
  logDictamenEvent
} from '../storage/d1';
import { logError, logInfo, setLogLevel } from '../lib/log';

interface CanonicalRelParams {
  limit?: number;
  offset?: number;
  recursive?: boolean;
  onlyFlagged?: boolean;
  dictamenIds?: string[];
  runTag?: string;
}

export class CanonicalRelationsWorkflow extends WorkflowEntrypoint<Env, CanonicalRelParams> {
  async run(event: WorkflowEvent<CanonicalRelParams>, step: WorkflowStep) {
    try {
      const params = event.payload ?? {};
      const env = this.env;
      const db = env.DB;
      const sourceKv = env.DICTAMENES_SOURCE;
      setLogLevel(env.LOG_LEVEL);

      const limit = params.limit ?? 100;
      const currentOffset = params.offset ?? 0;
      const recursive = params.recursive ?? true;
      const onlyFlagged = params.onlyFlagged ?? true;
      const dictamenIdsParam = Array.isArray(params.dictamenIds)
        ? params.dictamenIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];
      const runTag = typeof params.runTag === 'string' && params.runTag.trim().length > 0
        ? params.runTag.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)
        : event.instanceId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);

      logInfo('CANONICAL_REL_BACKFILL_START', {
        instanceId: event.instanceId,
        limit,
        offset: currentOffset,
        recursive,
        onlyFlagged,
        targetedIds: dictamenIdsParam.length,
        runTag
      });

      const dictamenIds = await step.do('fetch-canonical-batch', async () => {
        if (dictamenIdsParam.length > 0) {
          return [...new Set(dictamenIdsParam.map((value) => value.trim()))];
        }

        const where = onlyFlagged
          ? `WHERE a.aclarado = 1 OR a.alterado = 1 OR a.aplicado = 1 OR a.complementado = 1 OR a.confirmado = 1 OR a.reactivado = 1 OR a.reconsiderado = 1`
          : '';
        const sql = onlyFlagged
          ? `SELECT d.id
               FROM dictamenes d
               JOIN atributos_juridicos a ON a.dictamen_id = d.id
               ${where}
               ORDER BY d.id ASC
               LIMIT ? OFFSET ?`
          : `SELECT id FROM dictamenes ORDER BY id ASC LIMIT ? OFFSET ?`;
        const res = await db.prepare(sql).bind(limit, currentOffset).all<{ id: string }>();
        return res.results?.map((row) => row.id) ?? [];
      });

      if (dictamenIds.length === 0) {
        return { done: true, totalProcessed: currentOffset, relationsInserted: 0, orphanRelations: 0 };
      }

      let relationsInserted = 0;
      let orphanRelations = 0;
      let sourceMissing = 0;
      let docsWithEvidence = 0;

      for (const id of dictamenIds) {
        await step.do(`canonical-relations-${id}`, async () => {
          try {
            if (dictamenIdsParam.length > 0) {
              await db.prepare("DELETE FROM dictamen_relaciones_juridicas WHERE dictamen_origen_id = ? AND origen_extracccion LIKE 'canonical_v1_%'").bind(id).run();
              await db.prepare("DELETE FROM dictamen_relaciones_huerfanas WHERE dictamen_id = ? AND flag_huerfano LIKE 'canonical:%'").bind(id).run();
            }

            let rawJson = await sourceKv.get(id, 'json');
            if (!rawJson) {
              rawJson = await sourceKv.get(`dictamen:${id}`, 'json');
            }
            if (!rawJson) {
              sourceMissing += 1;
              return;
            }

            const candidates = extractCanonicalRelationCandidates(rawJson as DictamenRaw);
            if (candidates.length === 0) {
              return;
            }
            docsWithEvidence += 1;

            for (const candidate of candidates) {
              const destinoId = await findDictamenIdByNumeroAnio(db, candidate.numero_destino, candidate.anio_destino);
              if (!destinoId) {
                orphanRelations += 1;
                await insertDictamenRelacionHuerfana(
                  db,
                  id,
                  `canonical:${candidate.accion}:${candidate.numero_destino}/${candidate.anio_destino}:${candidate.evidence_channel}`
                );
                continue;
              }

              await insertDictamenRelacionJuridica(db, {
                origen_id: id,
                destino_id: destinoId,
                tipo_accion: candidate.accion,
                origen_extracccion: `canonical_v1_${candidate.evidence_channel}`
              });
              relationsInserted += 1;
            }

            await logDictamenEvent(db, {
              dictamen_id: id,
              event_type: 'RELATION_BACKFILL_SUCCESS',
              metadata: {
                strategy: 'canonical_v1',
                candidates: candidates.length
              }
            });
          } catch (error) {
            logError('CANONICAL_RELATION_DOC_ERROR', error, { dictamenId: id });
          }
        });
      }

      logInfo('CANONICAL_REL_BACKFILL_BATCH_DONE', {
        instanceId: event.instanceId,
        offset: currentOffset,
        processed: dictamenIds.length,
        docsWithEvidence,
        relationsInserted,
        orphanRelations,
        sourceMissing
      });

      if (dictamenIdsParam.length === 0 && recursive && dictamenIds.length === limit) {
        const nextOffset = currentOffset + limit;
        const childInstanceId = `canonical-relations-${runTag}-${nextOffset}`;
        await step.sleep('wait-for-next-canonical-batch', '5 seconds');
        await step.do('dispatch-next-canonical-batch', async () => {
          await env.CANONICAL_RELATIONS_WORKFLOW.create({
            id: childInstanceId,
            params: { limit, offset: nextOffset, recursive: true, onlyFlagged, runTag }
          });
        });
      }

      return {
        done: dictamenIds.length < limit,
        processedInBatch: dictamenIds.length,
        docsWithEvidence,
        relationsInserted,
        orphanRelations,
        sourceMissing,
        nextOffset: currentOffset + limit
      };
    } catch (error) {
      logError('CANONICAL_REL_BACKFILL_ERROR', error, { instanceId: event.instanceId });
      throw error;
    }
  }
}
