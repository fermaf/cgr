import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env } from '../types';
import { fetchDictamenesSearchPage } from '../clients/cgr';
import { ingestDictamen, extractDictamenId } from '../lib/ingest';
import { analyzeDictamen } from '../clients/mistral';
import { upsertRecord } from '../clients/pinecone';
import { insertEnrichment, updateDictamenStatus, insertDictamenBooleanosLLM, insertDictamenEtiquetaLLM, insertDictamenFuenteLegal } from '../storage/d1';

interface IngestParams {
    search?: string;
    limit?: number; // cantidad máxima de ítems a procesar
    page?: number;
    options?: any[]; // opciones de búsqueda propias de la CGR
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
                undefined, // cookie de sesión (no usado aquí)
                search
            );
            // Realizamos un cast a 'any' para satisfacer la regla de serialización requerida por los Workflows de Cloudflare
            return { items: result.items.slice(0, limit) } as any;
        });

        const items = fetchResult.items;

        // Paso 2: Procesar cada dictamen de la lista rescatada
        for (const item of items) {
            const id = extractDictamenId(item) || 'unknown';

            await step.do(`process-item-${id}`, async () => {
                // 1. Ingesta (Fase 1: Guardado Inicial)
                // Aquí guardamos el JSON crudo para preservarlo.
                const { dictamenId } = await ingestDictamen(this.env, item, {
                    status: 'ingested',
                    crawledFromCgr: 1,
                    origenImportacion: 'crawl_contraloria'
                });

                // 2. Enriquecimiento (Fase 2: Inteligencia Artificial LLM)
                // Se envía a Mistral AI para extraer análisis y etiquetas.
                const enrichment = await analyzeDictamen(this.env, item);

                if (enrichment) {
                    // 2a. Guardar la Fila de Enriquecimiento (Resumen, Análisis) en D1 (Relacional)
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

                    // 2b. Guardar las Banderas Booleanas detectadas por la IA
                    await insertDictamenBooleanosLLM(this.env.DB, dictamenId, enrichment.booleanos, enrichmentId);

                    // 2c. Guardar las Etiquetas (Tags)
                    for (const tag of enrichment.extrae_jurisprudencia.etiquetas) {
                        await insertDictamenEtiquetaLLM(this.env.DB, dictamenId, tag, enrichmentId);
                    }

                    // 2d. Guardar las Fuentes Legales que citó el dictamen
                    for (const source of enrichment.fuentes_legales) {
                        await insertDictamenFuenteLegal(this.env.DB, dictamenId, source, enrichmentId);
                    }

                    await updateDictamenStatus(this.env.DB, dictamenId, 'enriched');

                    // 3. Vectorización (Fase 3: Embedding y Pinecone)
                    // Convertimos la inteligencia en texto plano y la guardamos en un vector para permitir búsqueda semántica.
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
