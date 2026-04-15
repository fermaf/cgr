import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import type { Env, DictamenRaw } from '../types';
import { upsertRecord } from '../clients/pinecone';
import {
  checkoutDictamenesParaVectorizar,
  getEnrichment,
  getLatestRawRef,
  listDictamenIdsPendientesVectorizacion,
  updateDictamenStatus
} from '../storage/d1';
import { logError, logInfo, setLogLevel } from '../lib/log';
import { persistIncident } from '../storage/incident_d1';

interface VectorizationParams {
  batchSize?: number;
  delayMs?: number;
  recursive?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const NVIDIA_MIN_DELAY_MS = 3500;

function isNvidiaEmbeddingRateLimit(error: any): boolean {
  const message = String(error?.message ?? '');
  return message.includes('NVIDIA embedding rate limit exceeded') || message.includes('NVIDIA embedding error: 429');
}

function isNvidiaEmbeddingError(error: any): boolean {
  return String(error?.message ?? '').includes('NVIDIA embedding');
}

export class VectorizationWorkflow extends WorkflowEntrypoint<Env, VectorizationParams> {
  async run(event: WorkflowEvent<VectorizationParams>, step: WorkflowStep) {
    try {
      const params = event.payload ?? {};
      const env = this.env;
      const db = env.DB;
      const sourceKv = env.DICTAMENES_SOURCE;
      setLogLevel(env.LOG_LEVEL);

      const batchSize = Math.min(params.batchSize ?? 18, 18);
      const delayMs = Math.max(params.delayMs ?? NVIDIA_MIN_DELAY_MS, NVIDIA_MIN_DELAY_MS);
      logInfo('VECTORIZATION_RUN_START', { instanceId: event.instanceId, batchSize, delayMs });

      const dictamenesParaVectorizar = await step.do('fetch-vectorization-ids', async () => {
        return checkoutDictamenesParaVectorizar(db, batchSize);
      });

      if (dictamenesParaVectorizar.length === 0) {
        return { ok: 0, error: 0, total: 0, mensaje: 'Sin pendientes de vectorización' };
      }

      let ok = 0;
      let errores = 0;

      for (let i = 0; i < dictamenesParaVectorizar.length; i += 1) {
        const item = dictamenesParaVectorizar[i];
        const result = await step.do(`vectorize-${i}-${item.id}`, async () => {
          const id = item.id;
          try {
            const enrichment = await getEnrichment(db, id, env.MISTRAL_MODEL);
            if (!enrichment) {
              await updateDictamenStatus(db, id, 'error', 'SYSTEM_ERROR', {
                detail: 'No existe enriquecimiento reutilizable para vectorizar'
              });
              return { ok: false };
            }

            const rawRef = await getLatestRawRef(db, id);
            let rawJson: DictamenRaw | null = null;
            if (rawRef) {
              rawJson = await sourceKv.get(rawRef.raw_key, { type: 'json' }) as DictamenRaw | null;
              if (!rawJson && !rawRef.raw_key.startsWith('dictamen:')) {
                rawJson = await sourceKv.get(`dictamen:${id}`, { type: 'json' }) as DictamenRaw | null;
              }
            }
            const sourceContent = rawJson?._source ?? rawJson?.source ?? (rawJson as any)?.raw_data ?? rawJson ?? {};
            const currentModel = (enrichment as any)._modelo_llm ?? env.MISTRAL_MODEL;

            await upsertRecord(env, {
              id,
              metadata: {
                ...enrichment.extrae_jurisprudencia,
                descriptores_AI: enrichment.extrae_jurisprudencia.etiquetas,
                ...enrichment.booleanos,
                materia: sourceContent.materia || '',
                descriptores_originales: sourceContent.descriptores
                  ? String(sourceContent.descriptores).split(/[,;\n]/).map((value: string) => value.trim()).filter((value: string) => value.length > 2)
                  : [],
                fecha: String(sourceContent.fecha_documento || ''),
                model: currentModel
              }
            });

            await db.prepare(
              `INSERT INTO pinecone_sync_status (dictamen_id, metadata_version, last_synced_at)
               VALUES (?, 2, CURRENT_TIMESTAMP)
               ON CONFLICT(dictamen_id) DO UPDATE SET
                 metadata_version = 2,
                 last_synced_at = CURRENT_TIMESTAMP,
                 sync_error = NULL`
            ).bind(id).run();

            await updateDictamenStatus(db, id, 'vectorized', 'PINECONE_SYNC_SUCCESS', {
              metadata_version: 2,
              modelo: currentModel
            });

            return { ok: true };
          } catch (error: any) {
            const isPineconeQuota = error.message?.includes('Pinecone') && (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED'));
            if (isPineconeQuota) {
              await updateDictamenStatus(db, id, 'enriched_pending_vectorization', 'PINECONE_QUOTA_EXCEEDED', {
                detail: error.message
              });
              return { ok: false, pineconeQuotaExceeded: true };
            }

            if (isNvidiaEmbeddingRateLimit(error)) {
              await updateDictamenStatus(db, id, 'enriched_pending_vectorization', 'NVIDIA_EMBEDDING_RATE_LIMITED', {
                detail: error.message
              });
              return { ok: false, nvidiaRateLimited: true };
            }

            if (isNvidiaEmbeddingError(error)) {
              await updateDictamenStatus(db, id, 'enriched_pending_vectorization', 'NVIDIA_EMBEDDING_ERROR', {
                detail: error.message
              });
              return { ok: false, error: error.message };
            }

            await updateDictamenStatus(db, id, 'error', 'SYSTEM_ERROR', {
              detail: error.message,
              stack: error.stack
            });
            return { ok: false, error: error.message };
          }
        });

        if (result.ok) ok += 1;
        else errores += 1;

        if (result.pineconeQuotaExceeded) {
          const now = new Date();
          const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
          const seconds = Math.max(1, Math.floor((nextMonth.getTime() - now.getTime()) / 1000));
          await step.sleep('wait-for-pinecone-reset', `${seconds} seconds`);
          break;
        }

        if (result.nvidiaRateLimited) {
          await step.sleep('wait-for-nvidia-embedding-rate-limit', '60 seconds');
          break;
        }

        if (i + 1 < dictamenesParaVectorizar.length) {
          await sleep(delayMs);
        }
      }

      const remainingCount = await step.do('check-vectorization-remaining', async () => {
        const testIds = await listDictamenIdsPendientesVectorizacion(db, 1);
        return testIds.length > 0;
      });

      const resumen = {
        total: dictamenesParaVectorizar.length,
        ok,
        error: errores,
        mensaje: `Lote de vectorización completado: ${ok} ok, ${errores} errores de ${dictamenesParaVectorizar.length}. Quedan más: ${remainingCount}.`
      };
      logInfo('VECTORIZATION_RUN_DONE', { instanceId: event.instanceId, ...resumen });

      if (remainingCount && (params.recursive ?? true)) {
        await step.sleep('wait-between-vectorization-batches', '10 seconds');
        await step.do('trigger-next-vectorization-batch', async () => {
          await env.VECTORIZATION_WORKFLOW.create({
            params: {
              batchSize,
              delayMs,
              recursive: true
            }
          });
        });
      }

      return resumen;
    } catch (error: any) {
      logError('VECTORIZATION_RUN_ERROR', error, { instanceId: event.instanceId });
      await persistIncident(this.env, error, 'cgr-platform', 'vectorizationWorkflow', event.instanceId ?? 'n/a');
      throw error;
    }
  }
}
