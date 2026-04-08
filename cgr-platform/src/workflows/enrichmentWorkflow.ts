import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env, DictamenRaw, DictamenStatus } from '../types';
import { analyzeDictamen } from '../clients/mistral';
import { analyzeDictamenGemini } from '../clients/gemini';
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
  insertDictamenEtiquetaLLM,
  insertDictamenFuenteLegal
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

            const geminiModel = 'gemini-3.1-flash-lite-preview';
            const mistral2411 = 'mistral-large-2411';
            let enrichment: any | null = null;
            let llmError: string | undefined;
            let currentModel = mistralModel;

            if (profile.route === 'gemini') {
              const response = await analyzeDictamenGemini(env, rawJson, geminiModel);
              enrichment = response.result;
              llmError = response.error;
              currentModel = geminiModel;
            } else if (profile.route === 'mistral_2411') {
              const response = await analyzeDictamen(env, rawJson, mistral2411);
              enrichment = response.result;
              llmError = response.error;
              currentModel = mistral2411;
            } else {
              const response = await analyzeDictamen(env, rawJson, mistralModel);
              enrichment = response.result;
              llmError = response.error;
              currentModel = mistralModel;
            }

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
              etiquetas_json: JSON.stringify(enrichment.extrae_jurisprudencia.etiquetas),
              genera_jurisprudencia_llm: enrichment.genera_jurisprudencia ? 1 : 0,
              booleanos_json: JSON.stringify(enrichment.booleanos),
              fuentes_legales_json: JSON.stringify(enrichment.fuentes_legales),
              model: currentModel
            });

            await insertDictamenBooleanosLLM(db, id, enrichment.booleanos);
            for (const tag of enrichment.extrae_jurisprudencia.etiquetas) {
              await insertDictamenEtiquetaLLM(db, id, tag);
            }
            for (const source of enrichment.fuentes_legales) {
              await insertDictamenFuenteLegal(db, id, source);
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

        if (result.ok) ok += 1;
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
      logInfo('ENRICHMENT_RUN_DONE', { instanceId: event.instanceId, ...resumen });

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

      return resumen;
    } catch (error: any) {
      logError('ENRICHMENT_RUN_ERROR', error, { instanceId: event.instanceId });
      await persistIncident(this.env, error, 'cgr-platform', 'enrichmentWorkflow', event.instanceId ?? 'n/a');
      throw error;
    }
  }
}
