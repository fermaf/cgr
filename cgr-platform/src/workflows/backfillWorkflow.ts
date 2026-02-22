import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env, DictamenRaw } from '../types';
import { analyzeDictamen } from '../clients/mistral';
import { upsertRecord } from '../clients/pinecone';
import {
    listDictamenIdsByStatus,
    getLatestRawRef,
    insertEnrichment,
    updateDictamenStatus,
    insertDictamenBooleanosLLM,
    insertDictamenEtiquetaLLM,
    insertDictamenFuenteLegal
} from '../storage/d1';

interface BackfillParams {
    batchSize?: number;
    delayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class BackfillWorkflow extends WorkflowEntrypoint<Env, BackfillParams> {
    async run(event: WorkflowEvent<BackfillParams>, step: WorkflowStep) {
        const params = event.payload;
        const batchSize = params.batchSize ?? 50;
        const delayMs = params.delayMs ?? 500;

        // 1. Obtener dictámenes en estado 'ingested'
        const dictamenIds = await step.do('fetch-ingested-ids', async () => {
            const ids = await listDictamenIdsByStatus(this.env.DB, ['ingested'], batchSize);
            console.log(`[Backfill] Encontrados ${ids.length} dictámenes pendientes.`);
            return ids;
        });

        if (dictamenIds.length === 0) {
            console.log("[Backfill] Sin dictámenes pendientes. Pipeline al día.");
            return { ok: 0, error: 0, total: 0, mensaje: "Sin pendientes" };
        }

        // 2. Procesar cada dictamen
        let ok = 0;
        let errores = 0;

        for (const id of dictamenIds) {
            const resultado = await step.do(`process-backfill-${id}`, async () => {
                // Obtener clave KV (computada, no consulta BD)
                const rawRef = await getLatestRawRef(this.env.DB, id);
                if (!rawRef) {
                    await updateDictamenStatus(this.env.DB, id, 'error');
                    console.error(`[Backfill][ERROR] Sin referencia KV para ${id}`);
                    return { ok: false };
                }

                // Leer JSON crudo desde KV
                const rawJson = await this.env.DICTAMENES_SOURCE.get(rawRef.raw_key, { type: "json" }) as DictamenRaw;
                if (!rawJson) {
                    await updateDictamenStatus(this.env.DB, id, 'error');
                    console.error(`[Backfill][ERROR] Sin JSON en KV para ${id} (key: ${rawRef.raw_key})`);
                    return { ok: false };
                }

                // Pausa entre llamadas para evitar rate limit
                await sleep(delayMs);

                // Enriquecimiento (Mistral AI)
                const enrichment = await analyzeDictamen(this.env, rawJson);

                if (enrichment) {
                    // Guardar en tabla enriquecimiento
                    await insertEnrichment(this.env.DB, {
                        dictamen_id: id,
                        titulo: enrichment.extrae_jurisprudencia.titulo,
                        resumen: enrichment.extrae_jurisprudencia.resumen,
                        analisis: enrichment.extrae_jurisprudencia.analisis,
                        etiquetas_json: JSON.stringify(enrichment.extrae_jurisprudencia.etiquetas),
                        genera_jurisprudencia_llm: enrichment.genera_jurisprudencia ? 1 : 0,
                        booleanos_json: JSON.stringify(enrichment.booleanos),
                        fuentes_legales_json: JSON.stringify(enrichment.fuentes_legales),
                        model: this.env.MISTRAL_MODEL,
                    });

                    // Guardar en tablas M:N
                    await insertDictamenBooleanosLLM(this.env.DB, id, enrichment.booleanos);
                    for (const tag of enrichment.extrae_jurisprudencia.etiquetas) {
                        await insertDictamenEtiquetaLLM(this.env.DB, id, tag);
                    }
                    for (const source of enrichment.fuentes_legales) {
                        await insertDictamenFuenteLegal(this.env.DB, id, source);
                    }

                    await updateDictamenStatus(this.env.DB, id, 'enriched');

                    // Vectorización (Pinecone Integrated Inference)
                    const textToEmbed = `
                        Título: ${enrichment.extrae_jurisprudencia.titulo}
                        Resumen: ${enrichment.extrae_jurisprudencia.resumen}
                        Análisis: ${enrichment.extrae_jurisprudencia.analisis}
                    `.trim();

                    const sourceContent = rawJson._source ?? rawJson.source ?? (rawJson as any).raw_data ?? rawJson;

                    await upsertRecord(this.env, {
                        id: id,
                        text: textToEmbed,
                        metadata: {
                            titulo: enrichment.extrae_jurisprudencia.titulo,
                            fecha: String(sourceContent.fecha_documento || ''),
                            ...enrichment.booleanos
                        }
                    });

                    await updateDictamenStatus(this.env.DB, id, 'vectorized');
                    console.log(`[Backfill][OK] ${id} → vectorized ✓ | "${enrichment.extrae_jurisprudencia.titulo.substring(0, 60)}..."`);
                    return { ok: true };
                } else {
                    await updateDictamenStatus(this.env.DB, id, 'error');
                    console.error(`[Backfill][ERROR] Mistral falló para ${id}`);
                    return { ok: false };
                }
            });

            if (resultado.ok) ok++; else errores++;
        }

        const resumen = {
            total: dictamenIds.length,
            ok,
            error: errores,
            mensaje: `Backfill completado: ${ok} vectorizados, ${errores} errores de ${dictamenIds.length} procesados.`
        };
        console.log(`[Backfill][FIN] ${resumen.mensaje}`);
        return resumen;
    }
}
