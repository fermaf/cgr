import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env } from '../types';
import { fetchDictamenesSearchPage } from '../clients/cgr';
import { ingestDictamen, extractDictamenId } from '../lib/ingest';
import { getDictamenById } from '../storage/d1';
import { recordSkillEvent } from '../storage/skillEvents';
import { recordSkillRun } from '../storage/skillRuns';
import { logDebug, logError, logInfo, logWarn, setLogLevel } from '../lib/log';
import { normalizeIncident } from '../lib/incident';
import { routeIncident } from '../lib/incidentRouter';
import type { SkillExecution } from '../lib/skillExecutor';
import { runCheckEnvSanity } from '../skills/check_env_sanity';
import { runCheckD1Schema } from '../skills/check_d1_schema';
import { runCheckRouterConsistency } from '../skills/check_router_consistency';
import { runCgrNetworkBaseurlVerify } from '../skills/cgr_network_baseurl_verify';
import { runD1RemoteSchemaVerify } from '../skills/d1_remote_schema_verify';
import { runMistralTimeoutTriage } from '../skills/mistral_timeout_triage';
import { persistIncident } from '../storage/incident_d1';

interface IngestParams {
  search?: string;
  limit?: number; // cantidad máxima de ítems a procesar
  options?: any[]; // opciones de búsqueda propias de la CGR
  lookbackDays?: number; // Cuántos días hacia atrás buscar
  dateStart?: string; // Formato YYYY-MM-DD
  dateEnd?: string; // Formato YYYY-MM-DD
}

function toIncidentEnv(envValue?: string): 'local' | 'prod' | 'unknown' {
  if (!envValue) return 'unknown';
  const normalized = envValue.toLowerCase();
  if (normalized === 'local' || normalized === 'prod') {
    return normalized;
  }
  return 'unknown';
}

export class IngestWorkflow extends WorkflowEntrypoint<Env, IngestParams> {
  async run(event: WorkflowEvent<IngestParams>, step: WorkflowStep) {
    const env = this.env; // Referencia local para evitar capturas de 'this'
    try {
      const params = event.payload ?? {};
      const baseUrl = env.CGR_BASE_URL;
      setLogLevel(env.LOG_LEVEL);
      logInfo('INGEST_RUN_START', { instanceId: event.instanceId ?? 'n/a', payloadKeys: Object.keys(params) });

      const incidentEnv = toIncidentEnv(env.ENVIRONMENT);

      if (env.SKILL_TEST_ERROR === '1') {
        throw new Error('SKILL_TEST_ERROR_FORCED');
      }

      // Aseguramos determinismo: el cálculo de fechas y configuración inicial ocurre en un paso.
      const config = await step.do('prepare-config', async () => {
        let options = params.options ?? [];
        let dateStart = params.dateStart;
        let dateEnd = params.dateEnd;

        if (params.lookbackDays !== undefined && !dateStart) {
          const end = new Date();
          const start = new Date(end.getTime() - params.lookbackDays * 24 * 60 * 60 * 1000);
          dateStart = start.toISOString().split('T')[0];
          dateEnd = end.toISOString().split('T')[0];
        }

        if (dateStart && dateEnd) {
          options = [
            ...options,
            {
              type: 'date',
              field: 'fecha_documento',
              value: {
                gt: `${dateStart}T04:00:00.000Z`,
                lt: `${dateEnd}T23:59:59.000Z`
              },
              inner_id: 'av0',
              dir: 'gt'
            }
          ];
        }

        return { options, limit: params.limit ?? 10000 };
      });

      let page = 0;
      let totalIngested = 0;
      let totalFetched = 0;
      let totalSkippedExisting = 0;
      let hasMore = true;
      const maxPages = 50;
      let pagesProcessed = 0;

      while (hasMore && page < maxPages) {
        const currentPage = page;
        const searchStr = params.search ?? '';

        // Unificamos fetch+ingesta en el mismo step para evitar serializar payloads grandes entre steps.
        const pageResult = await step.do(`process-page-${currentPage}`, async () => {
          try {
            if (currentPage > 0) {
              await new Promise(r => setTimeout(r, 2000)); // Delay de 2 segundos para no saturar a CGR
            }
            logDebug('INGEST_PAGE_START', { instanceId: event.instanceId ?? 'n/a', page: currentPage });

            const result = await fetchDictamenesSearchPage(
              baseUrl,
              currentPage,
              config.options,
              undefined,
              searchStr
            );
            const items = (result.items ?? []) as any[];
            const db = env.DB;

            let processed = 0;
            let skippedExisting = 0;

            for (const item of items) {
              const id = extractDictamenId(item) || 'unknown';

              // Verificación rápida antes de ingesta
              const existing = await getDictamenById(db, id);
              if (existing && existing.estado && existing.estado !== 'error') {
                skippedExisting++;
                continue;
              }

              await ingestDictamen(env, item, {
                status: 'ingested',
                origenImportacion: 'worker_cron_crawl'
              });
              processed++;
            }

            logDebug('INGEST_PAGE_DONE', {
              instanceId: event.instanceId ?? 'n/a',
              page: currentPage,
              fetched: items.length,
              processed,
              skippedExisting
            });

            return {
              fetchedCount: items.length,
              processedCount: processed,
              skippedExistingCount: skippedExisting,
              nextCursor: result.nextCursor
            };
          } catch (error) {
            logError('INGEST_PAGE_ERROR', error, { instanceId: event.instanceId ?? 'n/a', page: currentPage });
            await persistIncident(
              env,
              error,
              'ingest',
              'IngestWorkflow',
              event.instanceId ?? 'n/a',
              {
                stage: 'process-page',
                page: currentPage,
                cgrBaseUrl: baseUrl
              }
            );
            throw error;
          }
        });

        pagesProcessed++;
        totalFetched += pageResult.fetchedCount;
        totalIngested += pageResult.processedCount;
        totalSkippedExisting += pageResult.skippedExistingCount;

        if (pageResult.fetchedCount === 0) {
          hasMore = false;
          break;
        }

        // Condiciones de salida
        if (totalIngested >= config.limit || !pageResult.nextCursor) {
          hasMore = false;
        } else {
          page++;
        }
      }

      logInfo('INGEST_RUN_DONE', {
        instanceId: event.instanceId ?? 'n/a',
        totalFetched,
        totalProcessed: totalIngested,
        totalSkippedExisting,
        pagesProcessed,
        maxPages
      });

      // Lógica de encadenamiento automático:
      // Si insertamos nuevos dictámenes exitosamente, disparamos su enriquecimiento.
      let backfillInstanceId = null;
      if (totalIngested > 0 && env.BACKFILL_WORKFLOW) {
        logInfo('INGEST_TRIGGERING_BACKFILL', { count: totalIngested });
        const bfInstance = await env.BACKFILL_WORKFLOW.create({
          params: { batchSize: totalIngested } // Le decimos al backfill que trabaje el lote recién ingresado
        });
        backfillInstanceId = bfInstance.id;
      }

      return {
        ok: true,
        totalFetched,
        totalProcessed: totalIngested,
        totalSkippedExisting,
        pagesProcessed,
        maxPages,
        backfillInstanceId,
        reason:
          totalFetched === 0
            ? 'no-results-in-window'
            : totalIngested === 0
              ? 'all-items-already-ingested'
              : 'completed'
      };
    } catch (error) {
      logError('INGEST_RUN_ERROR', error);

      // Forzar un error sintético SOLO para probar el clasificador/router nuevo
      const errorForIncident =
        this.env?.SKILL_TEST_ERROR === '1' ? new Error('SKILL_TEST_ERROR_FORCED') : error;
      await persistIncident(env, errorForIncident, 'ingest', 'IngestWorkflow', event.instanceId ?? 'n/a', { stage: 'run-root' });

      throw error;
    }
  }
}
