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
import { logInfo, logError, setLogLevel } from '../lib/log';

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

            // 1. Obtener dictámenes en estado 'ingested'
            const dictamenIds = await step.do('fetch-ingested-ids', async () => {
                const ids = await listDictamenIdsByStatus(db, ['ingested'], batchSize);
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
                const rawRef = await getLatestRawRef(db, id);
                if (!rawRef) {
                    await updateDictamenStatus(db, id, 'error');
                    console.error(`[Backfill][ERROR] Sin referencia KV para ${id}`);
                    return { ok: false };
                }

                // Leer JSON crudo desde KV: intentar primero llave limpia, luego fallback a llave legacy "dictamen:ID"
                let rawJson = await sourceKv.get(rawRef.raw_key, { type: "json" }) as DictamenRaw;
                if (!rawJson && !rawRef.raw_key.startsWith('dictamen:')) {
                    console.log(`[Backfill] Llave limpia ${rawRef.raw_key} vacía, intentando fallback a dictamen:${id}`);
                    rawJson = await sourceKv.get(`dictamen:${id}`, { type: "json" }) as DictamenRaw;
                }

                if (!rawJson) {
                    await updateDictamenStatus(db, id, 'error');
                    console.error(`[Backfill][ERROR] Sin JSON en KV para ${id} (key: ${rawRef.raw_key})`);
                    return { ok: false };
                }

                // Pausa entre llamadas para evitar rate limit
                await sleep(delayMs);

                // Enriquecimiento (Mistral AI)
                const enrichment = await analyzeDictamen(env, rawJson);

                if (enrichment) {
                    // Guardar en tabla enriquecimiento
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

                    // Guardar en tablas M:N
                    await insertDictamenBooleanosLLM(db, id, enrichment.booleanos);
                    for (const tag of enrichment.extrae_jurisprudencia.etiquetas) {
                        await insertDictamenEtiquetaLLM(db, id, tag);
                    }
                    for (const source of enrichment.fuentes_legales) {
                        await insertDictamenFuenteLegal(db, id, source);
                    }

                    await updateDictamenStatus(db, id, 'enriched');

                    // Vectorización (Pinecone Integrated Inference)
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
                            titulo: enrichment.extrae_jurisprudencia.titulo,
                            fecha: String(sourceContent.fecha_documento || ''),
                            ...enrichment.booleanos
                        }
                    });

                    await updateDictamenStatus(db, id, 'vectorized');

                    // ENSAMBLAJE PARA DICTAMENES_PASO
                    const pasoJson = {
                        id: id,
                        source: sourceContent,
                        arreglo_booleanos: enrichment.booleanos,
                        detalle_fuentes: enrichment.fuentes_legales,
                        extrae_jurisprudencia: enrichment.extrae_jurisprudencia,
                        modelo_llm: mistralModel,
                        descriptores: sourceContent.descriptores ? String(sourceContent.descriptores).split(/[,;\n]/).map(s => s.trim()).filter(s => s.length > 2) : [],
                        referencias: [], // Todo: Si corresponde extraer referencias cruzadas
                        creado_en: new Date().toISOString(),
                        procesado: true
                    };
                    const now = new Date().toISOString();
                    try {
                        await pasoKv.put(id, JSON.stringify(pasoJson));
                        await db.prepare(
                            `INSERT INTO kv_sync_status (dictamen_id, en_paso, paso_written_at)
                             VALUES (?, 1, ?)
                             ON CONFLICT(dictamen_id) DO UPDATE SET en_paso = 1, paso_written_at = excluded.paso_written_at, updated_at = excluded.paso_written_at`
                        ).bind(id, now).run();
                    } catch (err: any) {
                        await db.prepare(
                            `INSERT INTO kv_sync_status (dictamen_id, en_paso, paso_error)
                             VALUES (?, 0, ?)
                             ON CONFLICT(dictamen_id) DO UPDATE SET paso_error = excluded.paso_error, updated_at = ?`
                        ).bind(id, err.message, now).run();
                        console.error(`[Backfill][ERROR] No se pudo escribir en DICTAMENES_PASO para ${id}:`, err);
                    }

                    console.log(`[Backfill][OK] ${id} → vectorized ✓ | "${enrichment.extrae_jurisprudencia.titulo.substring(0, 60)}..."`);
                    return { ok: true };
                } else {
                    await updateDictamenStatus(db, id, 'error');
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
            logInfo('BACKFILL_RUN_DONE', { instanceId: event.instanceId, ...resumen });
            console.log(`[Backfill][FIN] ${resumen.mensaje}`);
            return resumen;
        } catch (error) {
            logError('BACKFILL_RUN_ERROR', error, { instanceId: event.instanceId });
            throw error;
        }
    }
}
