import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env } from '../types';
import { fetchDictamenesSearchPage } from '../clients/cgr';
import { ingestDictamen, extractDictamenId } from '../lib/ingest';
import { getDictamenById } from '../storage/d1';
import { logDebug, logError, logInfo, setLogLevel, formatError } from '../lib/log';

interface IngestParams {
    search?: string;
    limit?: number; // cantidad máxima de ítems a procesar
    options?: any[]; // opciones de búsqueda propias de la CGR
    lookbackDays?: number; // Cuántos días hacia atrás buscar
    dateStart?: string; // Formato YYYY-MM-DD
    dateEnd?: string; // Formato YYYY-MM-DD
}

export class IngestWorkflow extends WorkflowEntrypoint<Env, IngestParams> {
    async run(event: WorkflowEvent<IngestParams>, step: WorkflowStep) {
        try {
            const params = event.payload ?? {};
            const env = this.env; // Referencia local para evitar capturas de 'this'
            const baseUrl = env.CGR_BASE_URL;
            setLogLevel(env.LOG_LEVEL);
            logInfo('INGEST_RUN_START', { instanceId: event.instanceId ?? 'n/a', payloadKeys: Object.keys(params) });

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
                    options = [...options, {
                        type: 'date',
                        field: 'fecha_documento',
                        value: {
                            gt: `${dateStart}T04:00:00.000Z`,
                            lt: `${dateEnd}T23:59:59.000Z`
                        },
                        inner_id: 'av0',
                        dir: 'gt'
                    }];
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
            return {
                ok: true,
                totalFetched,
                totalProcessed: totalIngested,
                totalSkippedExisting,
                pagesProcessed,
                maxPages,
                reason: totalFetched === 0
                    ? 'no-results-in-window'
                    : totalIngested === 0
                        ? 'all-items-already-ingested'
                        : 'completed'
            };
        } catch (error) {
            logError('INGEST_RUN_ERROR', error);
            throw error;
        }
    }
}
