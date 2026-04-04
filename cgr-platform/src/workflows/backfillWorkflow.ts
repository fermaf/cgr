import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env, DictamenRaw } from '../types';
import { analyzeDictamen } from '../clients/mistral';
import { analyzeDictamenGemini } from '../clients/gemini';
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
import { logInfo, logError, logWarn, setLogLevel } from '../lib/log';
import { applyRetroUpdates } from '../lib/relations';
import { persistIncident } from '../storage/incident_d1';
import { countTokens, MAX_MISTRAL_TOKENS, MAX_PINECONE_TOKENS } from '../lib/tokenizer';
import { checkRateLimitGemini } from '../lib/rateLimiter';

interface BackfillParams {
    batchSize?: number;
    delayMs?: number;
    recursive?: boolean;
    allowedStatuses?: string[];
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
            const dictamenesParaProcesar = await step.do('fetch-active-ids', async () => {
                const batch = await checkoutDictamenesParaProcesar(db, batchSize, params.allowedStatuses);
                console.log(`[Backfill] Lote actual: ${batch.length} dictámenes checkout-eados para procesamiento (${params.allowedStatuses?.join(',') || 'todos'}).`);
                return batch;
            });


            if (dictamenesParaProcesar.length === 0) {
                console.log("[Backfill] Sin dictámenes pendientes. Lote e historial al día.");
                return { ok: 0, error: 0, total: 0, mensaje: "Sin pendientes" };
            }

            // 2. Procesar cada dictamen secuencialmente por chunks
            let ok = 0;
            let errores = 0;

            const chunkSize = 1; 
            for (let i = 0; i < dictamenesParaProcesar.length; i += chunkSize) {
                const chunk = dictamenesParaProcesar.slice(i, i + chunkSize);
                const chunkIndex = Math.floor(i / chunkSize);

                const results = await step.do(`process-chunk-${chunkIndex}-${chunk[0].id}`, async () => {
                    const chunkResults = [];
                    for (const item of chunk) {
                        const id = item.id;
                        const statusFrom = item.status_from;
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
                                await updateDictamenStatus(db, id, 'error_sin_KV_source', 'KV_SOURCE_MISSING', { detail: 'Sin JSON en KV' });
                                await persistIncident(env, new Error(`Sin JSON en KV para ${id}`), 'cgr-platform', 'backfillWorkflow', event.instanceId ?? 'n/a', { dictamenId: id });
                                console.error(`[Backfill][ERROR] Sin JSON en KV para ${id}`);
                                chunkResults.push({ id, ok: false });
                                continue;
                            }

                            // Recuperar enriquecimiento existente si hay falla parcial previa
                            let enrichment = await getEnrichment(db, id, mistralModel);
                            
                            let currentModel = mistralModel;
                            let llmError: string | undefined;

                            if (!enrichment) {
                                // 2.1 Ruteo y Enriquecimiento (Siguiendo Plan Aprobado)
                                // ingested_importante o error_quota -> Gemini 3.1 Flash Lite
                                // ingested_trivial -> Mistral Large 2411
                                // ingested -> Mistral Original (2512 en vars)
                                
                                const isImportant = statusFrom === 'ingested_importante' || statusFrom === 'error_quota';
                                const isTrivial = statusFrom === 'ingested_trivial';
                                const geminiModel = "gemini-3.1-flash-lite-preview";
                                const mistral2411 = "mistral-large-2411";
                                
                                if (isImportant) {
                                    // Control de Rate Limit para Gemini
                                    const quota = await checkRateLimitGemini(db);
                                    if (!quota.allowed) {
                                        logWarn('GEMINI_BACKFILL_QUOTA_WAIT', { id, statusFrom, retryAfter: quota.retryAfterSeconds });
                                        if (quota.retryAfterSeconds && quota.retryAfterSeconds > 600) {
                                            // Detener el procesamiento del chunk actual y señalar cuota excedida
                                            (chunkResults as any).quotaExceeded = true;
                                            return chunkResults;
                                        }
                                        await sleep(5000); 
                                    }
                                    
                                    const { result, error } = await analyzeDictamenGemini(env, rawJson, geminiModel);
                                    enrichment = result;
                                    llmError = error;
                                    currentModel = geminiModel;
                                    
                                    // Delay de 1 minuto para respetar 1 RPM en Gemini
                                    console.log(`[Backfill] Esperando 60s tras consulta a Gemini (1 RPM)... (${id})`);
                                    await sleep(60000);
                                } else if (isTrivial) {
                                    // Triviales -> Mistral Large 2411
                                    const { result, error } = await analyzeDictamen(env, rawJson, mistral2411);
                                    enrichment = result;
                                    llmError = error;
                                    currentModel = mistral2411;
                                } else {
                                    // Originales (2026) -> Mistral Original (2512)
                                    const { result, error } = await analyzeDictamen(env, rawJson);
                                    enrichment = result;
                                    llmError = error;
                                    currentModel = mistralModel;
                                }

                                if (enrichment) {
                                    // 2.2 GUARDADO PRIORITARIO EN KV (DICTAMENES_PASO)
                                    const now = new Date().toISOString();
                                    const sourceContent = rawJson._source ?? rawJson.source ?? (rawJson as any).raw_data ?? rawJson;
                                    const pasoJson = {
                                        id: id,
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

                                    await updateDictamenStatus(db, id, 'enriched', 'KV_SYNC_PASO_SUCCESS', {
                                        modelo: currentModel
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
                                        model: currentModel,
                                    });

                                    await insertDictamenBooleanosLLM(db, id, enrichment.booleanos);
                                    for (const tag of enrichment.extrae_jurisprudencia.etiquetas) {
                                        await insertDictamenEtiquetaLLM(db, id, tag);
                                    }
                                    for (const source of enrichment.fuentes_legales) {
                                        await insertDictamenFuenteLegal(db, id, source);
                                    }

                                    // 2.2.5 RETRO-UPDATES: Propagar cambios a dictámenes históricos
                                    await applyRetroUpdates(env, id, enrichment.acciones_juridicas_emitidas);
                                }
                            } else {
                                const modelExistente = (enrichment as any)._modelo_llm ?? 'desconocido';
                                console.log(`[Backfill] Recuperado enriquecimiento previo para ${id} (modelo: ${modelExistente}). Saltando IA y continuando hacia Pinecone...`);
                                // Usamos el modelo que ya está en D1 para mantener consistencia en el upsert a Pinecone
                                currentModel = modelExistente;
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
                                    metadata: {
                                        ...enrichment.extrae_jurisprudencia,
                                        descriptores_AI: enrichment.extrae_jurisprudencia.etiquetas,
                                        ...enrichment.booleanos,
                                        materia: sourceContent.materia || "",
                                        descriptores_originales: sourceContent.descriptores ? String(sourceContent.descriptores).split(/[,;\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 2) : [],
                                        fecha: String(sourceContent.fecha_documento || ''),
                                        model: currentModel
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
                                if (llmError === 'QUOTA_EXCEEDED') {
                                    await updateDictamenStatus(db, id, 'error_quota', 'AI_QUOTA_EXCEEDED', {
                                        detail: `Límite de uso de ${currentModel} excedido.`
                                    });
                                } else {
                                    await updateDictamenStatus(db, id, 'error', 'AI_INFERENCE_ERROR', {
                                        detail: `${currentModel} falló: ${llmError ?? 'enrichment null'}`
                                    });
                                }
                                await persistIncident(env, new Error(`${currentModel} fail: ${llmError ?? id}`), 'cgr-platform', 'backfillWorkflow', event.instanceId ?? 'n/a', { dictamenId: id });
                                chunkResults.push({ id, ok: false });
                            }
                        } catch (e: any) {
                            console.error(`[Backfill][FATAL] ${id}:`, e);
                            try {
                                await updateDictamenStatus(db, id, 'error', 'SYSTEM_ERROR', {
                                    detail: e.message,
                                    stack: e.stack
                                });
                            } catch (dbErr) {
                                console.error(`[Backfill][CRITICAL] No se pudo actualizar estado de error para ${id}:`, dbErr);
                            }
                            chunkResults.push({ id, ok: false, error: e.message });
                        }
                    }
                    return chunkResults;
                });

                results.forEach(r => { if (r.ok) ok++; else errores++; });

                // Si detectamos cuota excedida, suspendemos el workflow por 1 hora
                if ((results as any).quotaExceeded) {
                    console.log(`[Backfill] Cuota diaria agotada. Suspendiendo instancia por 1 hora por instrucción del usuario...`);
                    await step.sleep('wait-for-quota-reset', '1 hour');
                    // Salimos para permitir que el sistema recursivo re-intente más tarde
                    // o podrías continuar el loop, pero return es más limpio para refrescar estado.
                    break; 
                }

                // Pausa breve entre chunks
                if (i + chunkSize < dictamenesParaProcesar.length) {
                    await sleep(delayMs);
                }
            }

            // 3. Evaluar si siguen quedando pendientes
            const remainingCount = await step.do('check-remaining', async () => {
                const testIds = await listDictamenIdsParaProcesar(db, 1);
                return testIds.length > 0;
            });

            const resumen = {
                total: dictamenesParaProcesar.length,
                ok,
                error: errores,
                mensaje: `Lote completado: ${ok} vectorizados, ${errores} errores de ${dictamenesParaProcesar.length}. Quedan más: ${remainingCount}.`
            };
            logInfo('BACKFILL_RUN_DONE', { instanceId: event.instanceId, ...resumen });
            console.log(`[Backfill] ${resumen.mensaje}`);

            // 4. Delega al siguiente ciclo si quedaron tareas
            const isRecursive = params.recursive ?? true;
            if (remainingCount && isRecursive) {
                await step.sleep('wait-between-batches', '10 seconds');
                await step.do('trigger-next-batch', async () => {
                    await env.BACKFILL_WORKFLOW.create({
                        params: { 
                            batchSize, 
                            delayMs, 
                            recursive: true,
                            allowedStatuses: params.allowedStatuses 
                        }
                    });
                    console.log(`[Backfill] Se ha encolado recursivamente una nueva instancia con filtros: ${params.allowedStatuses?.join(',') || 'ninguno'}`);
                });
            }

            return resumen;
        } catch (error: any) {
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
