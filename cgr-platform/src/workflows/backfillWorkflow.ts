import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env, DictamenRaw } from '../types';
import { analyzeDictamen } from '../clients/mistral';
import { upsertRecord } from '../clients/pinecone';
import {
    checkoutDictamenesParaProcesar,
    listDictamenIdsParaProcesar,
    getLatestRawRef,
    getEnrichment,
    insertEnrichment,
    updateDictamenStatus,
    insertDictamenBooleanosLLM,
    insertDictamenEtiquetaLLM,
    insertDictamenFuenteLegal
} from '../storage/d1';
import { logInfo, logError, setLogLevel } from '../lib/log';
import { persistIncident } from '../storage/incident_d1';

interface BackfillParams {
    batchSize?: number;
    delayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class BackfillWorkflow extends WorkflowEntrypoint<Env, BackfillParams> {
    async run(event: WorkflowEvent<BackfillParams>, step: WorkflowStep) {
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
            logInfo('BACKFILL_RUN_START', { instanceId: event.instanceId, batchSize, delayMs });

            // 1. Obtener dictámenes pendientes Y marcarlos atómicamente como processing (Checkout)
            const dictamenIds = await step.do('fetch-active-ids', async () => {
                const ids = await checkoutDictamenesParaProcesar(db, batchSize);
                console.log(`[Backfill] Lote actual: ${ids.length} dictámenes checkout-eados para procesamiento.`);
                return ids;
            });

            if (dictamenIds.length === 0) {
                console.log("[Backfill] Sin dictámenes pendientes. Lote e historial al día.");
                return { ok: 0, error: 0, total: 0, mensaje: "Sin pendientes" };
            }

            // 2. Procesar cada dictamen secuencialmente por chunks para respetar rate limits
            let ok = 0;
            let errores = 0;

            const chunkSize = 1; // Limite bajado de 5 a 1 para asegurar tasa 2 req/s (1 solicitud cada 500ms)
            for (let i = 0; i < dictamenIds.length; i += chunkSize) {
                const chunk = dictamenIds.slice(i, i + chunkSize);
                const chunkIndex = Math.floor(i / chunkSize);

                const results = await step.do(`process-chunk-${chunkIndex}-${chunk[0]}`, async () => {
                    const chunkResults = [];
                    for (const id of chunk) {
                        try {
                            // Obtener clave KV
                            const rawRef = await getLatestRawRef(db, id);
                            if (!rawRef) {
                                await updateDictamenStatus(db, id, 'error', 'SYSTEM_ERROR', { detail: 'Sin referencia KV' });
                                console.error(`[Backfill][ERROR] Sin referencia KV para ${id}`);
                                chunkResults.push({ id, ok: false });
                                continue;
                            }

                            // Leer JSON crudo desde KV
                            let rawJson = await sourceKv.get(rawRef.raw_key, { type: "json" }) as DictamenRaw;
                            if (!rawJson && !rawRef.raw_key.startsWith('dictamen:')) {
                                rawJson = await sourceKv.get(`dictamen:${id}`, { type: "json" }) as DictamenRaw;
                            }

                            if (!rawJson) {
                                await updateDictamenStatus(db, id, 'error', 'SYSTEM_ERROR', { detail: 'Sin JSON en KV' });
                                await persistIncident(env, new Error(`Sin JSON en KV para ${id}`), 'cgr-platform', 'backfillWorkflow', event.instanceId ?? 'n/a', { dictamenId: id });
                                console.error(`[Backfill][ERROR] Sin JSON en KV para ${id}`);
                                chunkResults.push({ id, ok: false });
                                continue;
                            }

                            // Ya está marcado como `processing` gracias a checkoutDictamenesParaProcesar

                            // Recuperar enriquecimiento existente si hay falla parcial previa
                            let enrichment = await getEnrichment(db, id, mistralModel);

                            if (!enrichment) {
                                // Enriquecimiento (Mistral AI) - Ahora con Reintentos y Backoff interno
                                const { result: newEnrichment, error: mistralError } = await analyzeDictamen(env, rawJson);
                                enrichment = newEnrichment;

                                if (enrichment) {
                                    // 2.2 GUARDADO PRIORITARIO EN KV (DICTAMENES_PASO)
                                    // Esto asegura que si D1 falla después, ya tenemos el consumo de tokens respaldado.
                                    const now = new Date().toISOString();
                                    const sourceContent = rawJson._source ?? rawJson.source ?? (rawJson as any).raw_data ?? rawJson;
                                    const pasoJson = {
                                        id: id,
                                        source: sourceContent,
                                        arreglo_booleanos: enrichment.booleanos,
                                        detalle_fuentes: enrichment.fuentes_legales,
                                        extrae_jurisprudencia: enrichment.extrae_jurisprudencia,
                                        modelo_llm: mistralModel,
                                        creado_en: now,
                                        procesado: true
                                    };

                                    await pasoKv.put(id, JSON.stringify(pasoJson));
                                    await db.prepare(
                                        `INSERT INTO kv_sync_status (dictamen_id, en_paso, paso_written_at)
                                     VALUES (?, 1, ?)
                                     ON CONFLICT(dictamen_id) DO UPDATE SET en_paso = 1, paso_written_at = excluded.paso_written_at, updated_at = excluded.paso_written_at`
                                    ).bind(id, now).run();

                                    await updateDictamenStatus(db, id, 'enriched', 'KV_SYNC_PASO_SUCCESS', {
                                        modelo: mistralModel
                                    });

                                    // Guardar en tablas D1
                                    await insertEnrichment(db, {
                                        dictamen_id: id,
                                        titulo: enrichment.extrae_jurisprudencia.titulo,
                                        resumen: enrichment.extrae_jurisprudencia.resumen,
                                        analisis: enrichment.extrae_jurisprudencia.analisis,
                                        etiquetas_json: JSON.stringify(enrichment.extrae_jurisprudencia.etiquetas),
                                        genera_jurisprudencia_llm: enrichment.genera_jurisprudencia ? 1 : 0,
                                        booleanos_json: JSON.stringify(enrichment.booleanos),
                                        fuentes_legales_json: JSON.stringify(enrichment.fuentes_legales),
                                        model: mistralModel,
                                    });

                                    await insertDictamenBooleanosLLM(db, id, enrichment.booleanos);
                                    for (const tag of enrichment.extrae_jurisprudencia.etiquetas) {
                                        await insertDictamenEtiquetaLLM(db, id, tag);
                                    }
                                    for (const source of enrichment.fuentes_legales) {
                                        await insertDictamenFuenteLegal(db, id, source);
                                    }
                                }
                            } else {
                                console.log(`[Backfill] Recuperado enriquecimiento previo para ${id} (${mistralModel}). Saltando Mistral AI y continuando hacia Pinecone...`);
                            }

                            if (enrichment) {
                                // 2.3 Vectorización (Pinecone)
                                const textToEmbed = `
                                Título: ${enrichment.extrae_jurisprudencia.titulo}
                                Resumen: ${enrichment.extrae_jurisprudencia.resumen}
                                Análisis: ${enrichment.extrae_jurisprudencia.analisis}
                            `.trim();

                                const sourceContent = rawJson._source ?? rawJson.source ?? (rawJson as any).raw_data ?? rawJson;

                                await upsertRecord(env, {
                                    id: id,
                                    text: textToEmbed,
                                    metadata: {
                                        ...enrichment.extrae_jurisprudencia,
                                        ...enrichment.booleanos,
                                        materia: sourceContent.materia,
                                        descriptores_originales: sourceContent.descriptores ? String(sourceContent.descriptores).split(/[,;\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 2) : [],
                                        fecha: String(sourceContent.fecha_documento || ''),
                                        model: mistralModel
                                    }
                                });

                                // Pinecone status
                                await db.prepare(
                                    `INSERT INTO pinecone_sync_status (dictamen_id, metadata_version, last_synced_at)
                                 VALUES (?, 2, CURRENT_TIMESTAMP)
                                 ON CONFLICT(dictamen_id) DO UPDATE SET 
                                    metadata_version = 2, 
                                    last_synced_at = CURRENT_TIMESTAMP,
                                    sync_error = NULL`
                                ).bind(id).run();

                                await updateDictamenStatus(db, id, 'vectorized', 'PINECONE_SYNC_SUCCESS', {
                                    metadata_version: 2
                                });

                                chunkResults.push({ id, ok: true });
                            } else {
                                await updateDictamenStatus(db, id, 'error', 'AI_INFERENCE_ERROR', {
                                    detail: 'Mistral falló con enrichment null'
                                });
                                await persistIncident(env, new Error(`Mistral fail: ${id}`), 'cgr-platform', 'backfillWorkflow', event.instanceId ?? 'n/a', { dictamenId: id });
                                chunkResults.push({ id, ok: false });
                            }
                        } catch (e: any) {
                            console.error(`[Backfill][FATAL] ${id}:`, e);
                            chunkResults.push({ id, ok: false, error: e.message });
                        }
                    }
                    return chunkResults;
                });

                results.forEach(r => { if (r.ok) ok++; else errores++; });

                // Pausa breve entre chunks
                if (i + chunkSize < dictamenIds.length) {
                    await sleep(delayMs);
                }
            }

            // 3. Evaluar si siguen quedando pendientes
            const remainingCount = await step.do('check-remaining', async () => {
                const testIds = await listDictamenIdsParaProcesar(db, 1);
                return testIds.length > 0;
            });

            const resumen = {
                total: dictamenIds.length,
                ok,
                error: errores,
                mensaje: `Lote completado: ${ok} vectorizados, ${errores} errores de ${dictamenIds.length}. Quedan más: ${remainingCount}.`
            };
            logInfo('BACKFILL_RUN_DONE', { instanceId: event.instanceId, ...resumen });
            console.log(`[Backfill] ${resumen.mensaje}`);

            // 4. Delega al siguiente ciclo si quedaron tareas
            if (remainingCount) {
                await step.sleep('wait-between-batches', '10 seconds');
                await step.do('trigger-next-batch', async () => {
                    await env.BACKFILL_WORKFLOW.create({
                        params: { batchSize, delayMs }
                    });
                    console.log(`[Backfill] Se ha encolado recursivamente una nueva instancia.`);
                });
            }

            return resumen;
        } catch (error) {
            logError('BACKFILL_RUN_ERROR', error, { instanceId: event.instanceId });
            await persistIncident(
                this.env,
                error,
                'cgr-platform',
                'backfillWorkflow',
                event.instanceId ?? 'n/a'
            );
            throw error;
        }
    }
}
