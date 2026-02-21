import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env } from '../types';
import { fetchDictamenesSearchPage } from '../clients/cgr';
import { ingestDictamen, extractDictamenId } from '../lib/ingest';
import { analyzeDictamen } from '../clients/mistral';
import { upsertRecord } from '../clients/pinecone';
import { insertEnrichment, updateDictamenStatus, insertDictamenBooleanosLLM, insertDictamenEtiquetaLLM, insertDictamenFuenteLegal } from '../storage/d1';

interface IngestParams {
    search?: string;
    limit?: number; // max items to process
    page?: number;
    options?: any[]; // CGR search options
}

export class IngestWorkflow extends WorkflowEntrypoint<Env, IngestParams> {
    async run(event: WorkflowEvent<IngestParams>, step: WorkflowStep) {
        const params = event.payload;
        const limit = params.limit ?? 10;
        const page = params.page ?? 0;
        const search = params.search ?? '';
        const options = params.options ?? [];

        const fetchResult = await step.do('fetch-cgr-page', async () => {
            const result = await fetchDictamenesSearchPage(
                this.env.CGR_BASE_URL,
                page,
                options,
                undefined, // cookie
                search
            );
            // We cast to any to satisfy Serializable constraint
            return { items: result.items.slice(0, limit) } as any;
        });

        const items = fetchResult.items;

        // Step 2: Process each item
        for (const item of items) {
            const id = extractDictamenId(item) || 'unknown';

            await step.do(`process-item-${id}`, async () => {
                // 1. Ingest (Stage 1)
                const { dictamenId } = await ingestDictamen(this.env, item, {
                    status: 'ingested',
                    crawledFromCgr: 1,
                    origenImportacion: 'crawl_contraloria'
                });

                // 2. Enrich (Stage 2)
                const enrichment = await analyzeDictamen(this.env, item);

                if (enrichment) {
                    // 2a. Save Enrichment Row
                    const enrichmentId = await insertEnrichment(this.env.DB, {
                        dictamen_id: dictamenId,
                        titulo: enrichment.extrae_jurisprudencia.titulo,
                        resumen: enrichment.extrae_jurisprudencia.resumen,
                        analisis: enrichment.extrae_jurisprudencia.analisis,
                        etiquetas_json: JSON.stringify(enrichment.extrae_jurisprudencia.etiquetas),
                        genera_jurisprudencia_llm: enrichment.genera_jurisprudencia ? 1 : 0,
                        fuentes_legales_missing: enrichment.fuentes_legales.length === 0 ? 1 : 0,
                        booleanos_json: JSON.stringify(enrichment.booleanos),
                        fuentes_legales_json: JSON.stringify(enrichment.fuentes_legales),
                        model: this.env.MISTRAL_MODEL,
                        migrated_from_mongo: 0,
                        created_at: new Date().toISOString()
                    });

                    // 2b. Save Boolean Flags
                    await insertDictamenBooleanosLLM(this.env.DB, dictamenId, enrichment.booleanos, enrichmentId);

                    // 2c. Save Tags
                    for (const tag of enrichment.extrae_jurisprudencia.etiquetas) {
                        await insertDictamenEtiquetaLLM(this.env.DB, dictamenId, tag, enrichmentId);
                    }

                    // 2d. Save Legal Sources
                    for (const source of enrichment.fuentes_legales) {
                        await insertDictamenFuenteLegal(this.env.DB, dictamenId, source, enrichmentId);
                    }

                    await updateDictamenStatus(this.env.DB, dictamenId, 'enriched');

                    // 3. Vectorize (Stage 3)
                    const textToEmbed = `
                        Título: ${enrichment.extrae_jurisprudencia.titulo}
                        Resumen: ${enrichment.extrae_jurisprudencia.resumen}
                        Análisis: ${enrichment.extrae_jurisprudencia.analisis}
                    `.trim();

                    await upsertRecord(this.env, {
                        id: dictamenId,
                        text: textToEmbed,
                        metadata: {
                            titulo: enrichment.extrae_jurisprudencia.titulo,
                            fecha: String((item.source || item._source || item).fecha_documento || ''),
                            ...enrichment.booleanos
                        }
                    });

                    await updateDictamenStatus(this.env.DB, dictamenId, 'vectorized');
                } else {
                    await updateDictamenStatus(this.env.DB, dictamenId, 'error');
                }
            });
        }
    }
}
