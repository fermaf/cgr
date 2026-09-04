import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env } from '../types';
import { logInfo, logError, setLogLevel } from '../lib/log';
import { getSourceJsonWithFallbackStrict, getDictamenSourceStrict, SourceLocalMissingException } from '../lib/kvSourceResolver';
import { putWithVerify } from '../storage/kvVerify';

interface KVSyncParams {
    limit?: number;
    delayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class KVSyncWorkflow extends WorkflowEntrypoint<Env, KVSyncParams> {
    async run(event: WorkflowEvent<KVSyncParams>, step: WorkflowStep) {
        try {
            const params = event.payload ?? {};
            const env = this.env;
            const db = env.DB;
            const sourceKv = env.DICTAMENES_SOURCE;
            setLogLevel(env.LOG_LEVEL);
            const limit = params.limit ?? 100;
            const delayMs = params.delayMs ?? 100;
            logInfo('KVSYNC_RUN_START', { instanceId: event.instanceId, limit, delayMs });

        // 1. Obtener dictamen_id de los registros 'mongoDb' que no han sido sincronizados en KV
            const idsToSync = await step.do('fetch-sync-ids', async () => {
            const query = `
                SELECT d.id
                FROM dictamenes d
                LEFT JOIN kv_sync_status k ON d.id = k.dictamen_id
                WHERE d.origen_importacion = 'mongoDb' 
                  AND (k.en_source = 0 OR k.en_source IS NULL)
                LIMIT ?
            `;
            const result = await db.prepare(query).bind(limit).all<{ id: string }>();
            return result.results?.map(r => r.id) || [];
            });

            if (idsToSync.length === 0) {
                console.log("[KVSync] Sin dictámenes históricos por sincronizar.");
                return { ok: 0, error: 0, total: 0, mensaje: "Sin pendientes" };
            }

            console.log(`[KVSync] Iniciando sincronización KV para ${idsToSync.length} dictámenes históricos.`);

            let ok = 0;
            let errores = 0;

            for (const id of idsToSync) {
                const resultado = await step.do(`sync-kv-${id}`, async () => {
                await sleep(delayMs);

                // ── Buscar fuente legacy con el resolver estricto ──
                // getDictamenSourceStrict busca SOURCE:id → SOURCE:dictamen:id → PASO:id
                // y devuelve la resolución exacta (namespace + key).
                let legacyJson: any = null;
                let legacyKeyFound = false;

                try {
                    const strictResult = await getDictamenSourceStrict(env, id);
                    legacyJson = strictResult.rawJson;
                    // Detectamos si la fuente viene de la llave legacy dictamen:id
                    legacyKeyFound = strictResult.resolution.key === `dictamen:${id}`;
                    console.log(
                        `[KVSync] Fuente encontrada: ${strictResult.resolution.namespace}:${strictResult.resolution.key} ` +
                        `(${strictResult.resolution.payload_bytes} bytes, ` +
                        `doc_completo=${strictResult.resolution.has_documento_completo})`
                    );
                } catch (error) {
                    if (error instanceof SourceLocalMissingException) {
                        console.warn(
                            `[KVSync] No se encontró JSON para ${id} en ningún namespace KV. ` +
                            `Probes: ${error.attempts.map(a => `${a.namespace}:${a.key}`).join(', ')}`
                        );
                    } else {
                        console.error(`[KVSync] Error inesperado buscando fuente para ${id}:`, error);
                    }
                }

                if (!legacyJson) {
                    await db.prepare(
                        `INSERT INTO kv_sync_status (dictamen_id, en_source, source_error)
                         VALUES (?, 0, 'No JSON in KV')
                         ON CONFLICT(dictamen_id) DO UPDATE SET source_error = 'No JSON in KV', updated_at = CURRENT_TIMESTAMP`
                    ).bind(id).run();
                    return { ok: false };
                }

                // ── Escribir bajo llave estandarizada con verificación post-write ──
                // Fase 1 — bug_report 2026-05-22: validar antes de marcar en_source=1
                // y antes de borrar la llave legacy.
                const now = new Date().toISOString();
                const payloadStr = JSON.stringify(legacyJson);

                // putWithVerify: put con retry 429 + get inmediato + validación JSON.
                // No exigimos documento_completo aquí porque los datos legacy (mongoDb)
                // pueden tener estructura variable.
                const verifyResult = await putWithVerify(
                    sourceKv,
                    id,
                    payloadStr,
                    { expectedDocumentoCompleto: false },
                );

                if (!verifyResult.ok) {
                    // Verificación fallida: marcar error y NO borrar la llave legacy.
                    console.error(
                        `[KVSync][VERIFY-FAIL] ${id}: ${verifyResult.error}`,
                    );
                    await db.prepare(
                        `INSERT INTO kv_sync_status (dictamen_id, en_source, source_error)
                         VALUES (?, 0, ?)
                         ON CONFLICT(dictamen_id) DO UPDATE SET
                           en_source = 0,
                           source_error = excluded.source_error,
                           updated_at = ?`,
                    )
                        .bind(id, verifyResult.error ?? 'KV verification failed', now)
                        .run();
                    return { ok: false };
                }

                // Verificación exitosa: marcar en_source=1.
                await db.prepare(
                    `INSERT INTO kv_sync_status (dictamen_id, en_source, source_written_at)
                     VALUES (?, 1, ?)
                     ON CONFLICT(dictamen_id) DO UPDATE SET
                       en_source = 1,
                       source_written_at = excluded.source_written_at,
                       updated_at = excluded.source_written_at`,
                )
                    .bind(id, now)
                    .run();

                // ── Sólo ahora, tras verificar que la nueva llave es legible,
                //     borrar la llave legacy dictamen:id ──
                const legacyKey = `dictamen:${id}`;
                if (legacyKeyFound) {
                    try {
                        await sourceKv.delete(legacyKey);
                        console.log(
                            `[KVSync][CLEANUP] Llave legacy ${legacyKey} eliminada tras verificación OK.`,
                        );
                    } catch (delErr: unknown) {
                        const delMsg =
                            delErr instanceof Error
                                ? delErr.message
                                : String(delErr);
                        console.warn(
                            `[KVSync][WARNING] No se pudo eliminar llave legacy ${legacyKey}: ${delMsg}`,
                        );
                        // No es fatal: la nueva llave ya está verificada.
                    }
                }

                console.log(
                    `[KVSync][OK] Sincronizado KV para ${id} — ` +
                        `${verifyResult.payload_bytes} bytes, ` +
                        `doc_completo=${verifyResult.documento_completo_present ?? false}`,
                );
                return { ok: true };
                });

                if (resultado.ok) ok++; else errores++;
            }

            const resumen = {
                total: idsToSync.length,
                ok,
                error: errores,
                mensaje: `KVSync completado: ${ok} sincronizados, ${errores} errores.`
            };
            logInfo('KVSYNC_RUN_DONE', { instanceId: event.instanceId, ...resumen });
            console.log(`[KVSync][FIN] ${resumen.mensaje}`);
            return resumen;
        } catch (error) {
            logError('KVSYNC_RUN_ERROR', error, { instanceId: event.instanceId });
            throw error;
        }
    }
}
