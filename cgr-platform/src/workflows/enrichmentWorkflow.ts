import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env, DictamenRaw, DictamenStatus } from '../types';
import { analyzeDictamen } from '../clients/mistral';
import {
  checkoutDictamenesParaEnriquecer,
  listDictamenIdsParaEnriquecer,
  getLatestRawRef,
  getDictamenProcessingProfile,
  clearEnrichmentDerivedData,
  insertEnrichment,
  logDictamenEvent,
  updateDictamenStatus,
  insertDictamenBooleanosLLM,
  insertDictamenEtiqueta,
  insertDictamenFuente
} from '../storage/d1';
import { logError, logInfo, logWarn, setLogLevel } from '../lib/log';
import { applyRetroUpdates } from '../lib/relations';
import { persistIncident } from '../storage/incident_d1';

interface EnrichmentParams {
  batchSize?: number;
  delayMs?: number;
  recursive?: boolean;
  allowedStatuses?: Array<'ingested' | 'ingested_importante' | 'ingested_trivial' | 'error_quota'>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DOCTRINAL_METADATA_AUTO_BATCH_SIZE = 100;

function chunkIds(ids: string[], chunkSize: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  return chunks;
}

function getEnrichingStatus(statusFrom: string | null): DictamenStatus {
  switch (statusFrom) {
    case 'ingested':
      return 'enriching_ingested';
    case 'ingested_importante':
      return 'enriching_importante';
    case 'ingested_trivial':
      return 'enriching_trivial';
    default:
      return 'processing';
  }
}

async function logDoctrinalTriggerFailureEvents(
  db: Env['DB'],
  dictamenIds: string[],
  params: {
    enrichmentInstanceId: string;
    reason: string;
    sourceSnapshotVersion: string;
  }
) {
  const { enrichmentInstanceId, reason, sourceSnapshotVersion } = params;
  for (const dictamenId of dictamenIds) {
    await logDictamenEvent(db, {
      dictamen_id: dictamenId,
      event_type: 'DOCTRINAL_METADATA_ERROR',
      status_from: 'enriched_pending_vectorization',
      status_to: 'enriched_pending_vectorization',
      metadata: {
        source: 'enrichment_workflow',
        enrichment_instance_id: enrichmentInstanceId,
        source_snapshot_version: sourceSnapshotVersion,
        model: 'mistral-large-2411',
        error: reason
      }
    });
  }
}

export class EnrichmentWorkflow extends WorkflowEntrypoint<Env, EnrichmentParams> {
  async run(event: WorkflowEvent<EnrichmentParams>, step: WorkflowStep) {
    try {
      const params = event.payload ?? {};
      const env = this.env;
      const db = env.DB;
      const sourceKv = env.DICTAMENES_SOURCE;
      const pasoKv = env.DICTAMENES_PASO;
      const mistralModel = env.MISTRAL_MODEL;
      setLogLevel(env.LOG_LEVEL);

      const batchSize = params.batchSize ?? 50;
      const delayMs = params.delayMs ?? 500;
      logInfo('ENRICHMENT_RUN_START', {
        instanceId: event.instanceId,
        batchSize,
        delayMs,
        allowedStatuses: params.allowedStatuses ?? null
      });

      const dictamenesParaEnriquecer = await step.do('fetch-enrichment-ids', async () => {
        const batch = await checkoutDictamenesParaEnriquecer(db, batchSize, params.allowedStatuses);
        return batch;
      });

      if (dictamenesParaEnriquecer.length === 0) {
        return { ok: 0, error: 0, total: 0, mensaje: 'Sin pendientes de enrichment' };
      }

      let ok = 0;
      let errores = 0;
      const enrichedIds: string[] = [];

      for (let i = 0; i < dictamenesParaEnriquecer.length; i += 1) {
        const item = dictamenesParaEnriquecer[i];
        const result = await step.do(`enrich-${i}-${item.id}`, async () => {
          const id = item.id;
          const statusFrom = item.status_from;
          const enrichingStatus = getEnrichingStatus(statusFrom);

          try {
            const rawRef = await getLatestRawRef(db, id);
            if (!rawRef) {
              await updateDictamenStatus(db, id, 'error', 'SYSTEM_ERROR', { detail: 'Sin referencia KV' });
              return { ok: false };
            }

            let rawJson = await sourceKv.get(rawRef.raw_key, { type: 'json' }) as DictamenRaw | null;
            if (!rawJson && !rawRef.raw_key.startsWith('dictamen:')) {
              rawJson = await sourceKv.get(`dictamen:${id}`, { type: 'json' }) as DictamenRaw | null;
            }

            if (!rawJson) {
              await updateDictamenStatus(db, id, 'error_sin_KV_source', 'KV_SOURCE_MISSING', { detail: 'Sin JSON en KV' });
              await persistIncident(env, new Error(`Sin JSON en KV para ${id}`), 'cgr-platform', 'enrichmentWorkflow', event.instanceId ?? 'n/a', { dictamenId: id });
              return { ok: false };
            }

            const profile = await getDictamenProcessingProfile(db, id);
            if (!profile || profile.route === 'vectorize_only') {
              await updateDictamenStatus(db, id, 'error', 'SYSTEM_ERROR', { detail: 'Perfil de enrichment inválido' });
              return { ok: false };
            }

            await logDictamenEvent(db, {
              dictamen_id: id,
              event_type: 'AI_INFERENCE_START',
              status_from: statusFrom,
              status_to: enrichingStatus,
              metadata: {
                route: profile.route,
                target_status: profile.target_status
              }
            });

            const model2512 = 'mistral-large-2512';
            const model2411 = 'mistral-large-2411';
            let enrichment: any | null = null;
            let llmError: string | undefined;
            let currentModel = model2411;
            let apiKeyToUse: string | undefined;

            if (profile.route === 'mistral_2512') {
              currentModel = model2512;
              apiKeyToUse = env.MISTRAL_API_KEY_CRAWLER_ALE;
            } else if (profile.route === 'mistral_importantes_olga') {
              currentModel = model2512;
              apiKeyToUse = env.MISTRAL_API_KEY_IMPORTANTES_OLGA;
            } else {
              currentModel = model2411;
              apiKeyToUse = undefined;
            }

            const response = await analyzeDictamen(env, rawJson, currentModel, apiKeyToUse);
            enrichment = response.result;
            llmError = response.error;

            if (!enrichment) {
              if (llmError === 'QUOTA_EXCEEDED') {
                await updateDictamenStatus(db, id, profile.target_status, 'BACKFILL_QUOTA_ABORT_REVERT', {
                  route: profile.route,
                  previous_processing_state: statusFrom
                });
                logWarn('ENRICHMENT_QUOTA_REVERT', { id, model: currentModel, route: profile.route });
                return { ok: false, quotaExceeded: true };
              }

              await updateDictamenStatus(db, id, 'error', 'AI_INFERENCE_ERROR', {
                detail: `${currentModel} falló: ${llmError ?? 'enrichment null'}`
              });
              await persistIncident(env, new Error(`${currentModel} fail: ${llmError ?? id}`), 'cgr-platform', 'enrichmentWorkflow', event.instanceId ?? 'n/a', { dictamenId: id });
              return { ok: false };
            }

            const now = new Date().toISOString();
            const sourceContent = rawJson._source ?? rawJson.source ?? (rawJson as any).raw_data ?? rawJson;
            const pasoJson = {
              id,
              source: sourceContent,
              arreglo_booleanos: enrichment.booleanos,
              detalle_fuentes: enrichment.fuentes_legales,
              extrae_jurisprudencia: enrichment.extrae_jurisprudencia,
              acciones_juridicas_emitidas: enrichment.acciones_juridicas_emitidas,
              modelo_llm: currentModel,
              creado_en: now,
              procesado: true
            };

            await pasoKv.put(id, JSON.stringify(pasoJson));
            await db.prepare(
              `INSERT INTO kv_sync_status (dictamen_id, en_paso, paso_written_at)
               VALUES (?, 1, ?)
               ON CONFLICT(dictamen_id) DO UPDATE SET en_paso = 1, paso_written_at = excluded.paso_written_at, updated_at = excluded.paso_written_at`
            ).bind(id, now).run();

            await clearEnrichmentDerivedData(db, id);
            await insertEnrichment(db, {
              dictamen_id: id,
              titulo: enrichment.extrae_jurisprudencia.titulo,
              resumen: enrichment.extrae_jurisprudencia.resumen,
              analisis: enrichment.extrae_jurisprudencia.analisis,
              genera_jurisprudencia_llm: enrichment.genera_jurisprudencia ? 1 : 0,
              booleanos_json: JSON.stringify(enrichment.booleanos),
              model: currentModel
            });

            await insertDictamenBooleanosLLM(db, id, enrichment.booleanos);
            for (const tag of enrichment.extrae_jurisprudencia.etiquetas) {
              await insertDictamenEtiqueta(db, id, tag);
            }
            for (const source of enrichment.fuentes_legales) {
              await insertDictamenFuente(db, id, source);
            }

            await applyRetroUpdates(env, id, enrichment.acciones_juridicas_emitidas);

            await logDictamenEvent(db, {
              dictamen_id: id,
              event_type: 'AI_INFERENCE_SUCCESS',
              status_from: enrichingStatus,
              status_to: 'enriched_pending_vectorization',
              metadata: {
                modelo: currentModel,
                route: profile.route,
                target_status: profile.target_status
              }
            });

            await updateDictamenStatus(db, id, 'enriched_pending_vectorization', 'KV_SYNC_PASO_SUCCESS', {
              modelo: currentModel,
              route: profile.route
            });

            return { ok: true };
          } catch (error: any) {
            await updateDictamenStatus(db, id, 'error', 'SYSTEM_ERROR', {
              detail: error.message,
              stack: error.stack
            });
            return { ok: false, error: error.message };
          }
        });

        if (result.ok) {
          ok += 1;
          enrichedIds.push(item.id);
        }
        else errores += 1;

        if (result.quotaExceeded) {
          await step.sleep('wait-for-enrichment-quota-reset', '1 hour');
          break;
        }

        if (i + 1 < dictamenesParaEnriquecer.length) {
          await sleep(delayMs);
        }
      }

      const remainingCount = await step.do('check-enrichment-remaining', async () => {
        const testIds = await listDictamenIdsParaEnriquecer(db, 1, params.allowedStatuses);
        return testIds.length > 0;
      });

      const resumen = {
        total: dictamenesParaEnriquecer.length,
        ok,
        error: errores,
        mensaje: `Lote de enrichment completado: ${ok} ok, ${errores} errores de ${dictamenesParaEnriquecer.length}. Quedan más: ${remainingCount}.`
      };

      let doctrinalMetadataTriggered = 0;
      if (enrichedIds.length > 0 && env.DOCTRINAL_METADATA_WORKFLOW) {
        try {
          doctrinalMetadataTriggered = await step.do('trigger-doctrinal-metadata-from-enrichment', async () => {
            const doctrinalChunks = chunkIds(enrichedIds, DOCTRINAL_METADATA_AUTO_BATCH_SIZE);
            let triggered = 0;
            for (let index = 0; index < doctrinalChunks.length; index += 1) {
              const dictamenIds = doctrinalChunks[index];
              const instance = await env.DOCTRINAL_METADATA_WORKFLOW.create({
                params: {
                  dictamenIds,
                  delayMs: Math.min(delayMs, 250),
                  recursive: false,
                  sourceSnapshotVersion: 'auto_from_enrichment_v1',
                  runTag: `autoenrich-${event.instanceId}-${index + 1}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)
                }
              });
              triggered += 1;
              logInfo('ENRICHMENT_TRIGGER_DOCTRINAL_METADATA', {
                instanceId: event.instanceId,
                doctrinalWorkflowId: instance.id,
                chunkIndex: index,
                chunkSize: dictamenIds.length
              });
              for (const dictamenId of dictamenIds) {
                await logDictamenEvent(db, {
                  dictamen_id: dictamenId,
                  event_type: 'DOCTRINAL_METADATA_QUEUED',
                  status_from: 'enriched_pending_vectorization',
                  status_to: 'enriched_pending_vectorization',
                  metadata: {
                    source: 'enrichment_workflow',
                    enrichment_instance_id: event.instanceId,
                    doctrinal_workflow_id: instance.id,
                    chunk_index: index,
                    source_snapshot_version: 'auto_from_enrichment_v1',
                    model: 'mistral-large-2411'
                  }
                });
              }
            }
            return triggered;
          });
        } catch (error: any) {
          await logDoctrinalTriggerFailureEvents(db, enrichedIds, {
            enrichmentInstanceId: event.instanceId,
            reason: error?.message ?? String(error),
            sourceSnapshotVersion: 'auto_from_enrichment_v1'
          });
          logWarn('ENRICHMENT_DOCTRINAL_METADATA_TRIGGER_FAILED', {
            instanceId: event.instanceId,
            enrichedIds: enrichedIds.length,
            error: error?.message ?? String(error)
          });
        }
      } else if (enrichedIds.length > 0) {
        await logDoctrinalTriggerFailureEvents(db, enrichedIds, {
          enrichmentInstanceId: event.instanceId,
          reason: 'Binding DOCTRINAL_METADATA_WORKFLOW no disponible',
          sourceSnapshotVersion: 'auto_from_enrichment_v1'
        });
        logWarn('ENRICHMENT_DOCTRINAL_METADATA_TRIGGER_FAILED', {
          instanceId: event.instanceId,
          enrichedIds: enrichedIds.length,
          error: 'Binding DOCTRINAL_METADATA_WORKFLOW no disponible'
        });
      }

      logInfo('ENRICHMENT_RUN_DONE', {
        instanceId: event.instanceId,
        doctrinalMetadataTriggered,
        enrichedIds: enrichedIds.length,
        ...resumen
      });

      if (remainingCount && (params.recursive ?? true)) {
        await step.sleep('wait-between-enrichment-batches', '10 seconds');
        await step.do('trigger-next-enrichment-batch', async () => {
          await env.ENRICHMENT_WORKFLOW.create({
            params: {
              batchSize,
              delayMs,
              recursive: true,
              allowedStatuses: params.allowedStatuses
            }
          });
        });
      }

      return {
        ...resumen,
        doctrinalMetadataTriggered
      };
    } catch (error: any) {
      logError('ENRICHMENT_RUN_ERROR', error, { instanceId: event.instanceId });
      await persistIncident(this.env, error, 'cgr-platform', 'enrichmentWorkflow', event.instanceId ?? 'n/a');
      throw error;
    }
  }
}
