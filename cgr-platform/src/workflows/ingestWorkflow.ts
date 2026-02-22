import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env } from '../types';
import { fetchDictamenesSearchPage } from '../clients/cgr';
import { ingestDictamen, extractDictamenId } from '../lib/ingest';
import { getDictamenById } from '../storage/d1';

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
        const params = event.payload;
        let options = params.options ?? [];
        let dateStart = params.dateStart;
        let dateEnd = params.dateEnd;

        // Si tenemos lookbackDays y NO fecha start/end, calculamos la ventana de tiempo.
        if (params.lookbackDays !== undefined && !dateStart) {
            const end = new Date();
            const start = new Date(end.getTime() - params.lookbackDays * 24 * 60 * 60 * 1000);
            dateStart = start.toISOString().split('T')[0];
            dateEnd = end.toISOString().split('T')[0];
        }

        // Si existen start y end (manual o calculado), acotamos la búsqueda de CGR:
        if (dateStart && dateEnd) {
            options = [...options, {
                type: 'range',
                field: 'fecha_documento',
                value: {
                    gte: dateStart,
                    lte: dateEnd
                }
            }];
        }

        let page = 0;
        let totalIngested = 0;
        let hasMore = true;
        const maxPages = 50; // Límite de seguridad
        const limit = params.limit ?? 10000;

        while (hasMore && page < maxPages) {
            // Guardamos el scope en una variable, porque en WorkflowStep.do las clausuras deben ser puras
            const currentPage = page;
            const currentOptions = options;
            const searchStr = params.search ?? '';

            const fetchResult = await step.do(`fetch-cgr-page-${currentPage}`, async () => {
                const result = await fetchDictamenesSearchPage(
                    this.env.CGR_BASE_URL,
                    currentPage,
                    currentOptions,
                    undefined,
                    searchStr
                );
                return { items: result.items as any[], nextCursor: result.nextCursor };
            });

            const items = fetchResult.items;

            for (const item of items) {
                const id = extractDictamenId(item) || 'unknown';

                await step.do(`ingest-item-${id}`, async () => {
                    const existing = await getDictamenById(this.env.DB, id);
                    if (existing && existing.estado && existing.estado !== 'error') {
                        console.log(`[SKIP] Dictamen ${id} ya existe en estado: ${existing.estado}`);
                        return; // Omitir si ya está al menos en ingested/enriched/vectorized
                    }

                    await ingestDictamen(this.env, item, {
                        status: 'ingested',
                        crawledFromCgr: 1,
                        origenImportacion: 'worker_cron_crawl'
                    });
                });

                totalIngested++;
                if (totalIngested >= limit) {
                    hasMore = false;
                    break;
                }
            }

            if (!fetchResult.nextCursor || items.length === 0) {
                hasMore = false;
            } else {
                page++;
            }
        }
    }
}

