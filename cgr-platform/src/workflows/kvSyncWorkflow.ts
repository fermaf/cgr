import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env } from '../types';
import { logInfo, logError, setLogLevel } from '../lib/log';

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

                // Intento 1: Buscar la llave legada en Mongo format 
                // Asumimos que la llave histórica en dictamenes_source está bajo el mismo ID puro (sin prefijo)
                // O quizás tenga un prefijo diferente. Aquí intentaremos leerlo como está almacenado para confirmar.
                // En pasos anteriores vimos que los keys "000007N21" viven a nivel de DICTAMENES_PASO, no sabemos SOURCE.
                // Generalmente se guardaron en source con "dictamen:ID" pero queremos standarizar todo a "ID".

                let legacyJson: any = null;
                const legacyKey = `dictamen:${id}`; // Buscar "dictamen:000007N21"
                let legacyKeyFound = false;

                try {
                    legacyJson = await sourceKv.get(legacyKey, { type: 'json' });
                    if (legacyJson) legacyKeyFound = true;
                } catch (e) {
                    console.warn(`[KVSync] No se encontró clave ${legacyKey} en SOURCE.`);
                }

                // Si no se encuentra como dictamen:ID, intentar con ID puro (ya migrado a medias)
                if (!legacyJson) {
                    try {
                        legacyJson = await sourceKv.get(id, { type: 'json' });
                    } catch (e) {
                        console.error(`[KVSync] No se encontró JSON para ${id} ni en dictamen:${id} ni puro.`);
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

                // Escribir el mismo objeto bajo la llave estandarizada (pura: "id")
                // Y registrarlo en kv_sync_status
                const now = new Date().toISOString();
                try {
                    await sourceKv.put(id, JSON.stringify(legacyJson));

                    await db.prepare(
                        `INSERT INTO kv_sync_status (dictamen_id, en_source, source_written_at)
                         VALUES (?, 1, ?)
                         ON CONFLICT(dictamen_id) DO UPDATE SET en_source = 1, source_written_at = excluded.source_written_at, updated_at = excluded.source_written_at`
                    ).bind(id, now).run();

                    // Si la llave antigua existía como dictamen:id, se elimina para no duplicar datos
                    if (legacyKeyFound) {
                        try {
                            await sourceKv.delete(`dictamen:${id}`);
                            console.log(`[KVSync][CLEANUP] Llave legacy dictamen:${id} eliminada.`);
                        } catch (delErr) {
                            console.warn(`[KVSync][WARNING] No se pudo eliminar la llave legacy dictamen:${id}`);
                        }
                    }

                    console.log(`[KVSync][OK] Sincronizado KV para ${id}`);
                    return { ok: true };
                } catch (error: any) {
                    console.error(`[KVSync][ERROR] Falló escritura para ${id}:`, error);
                    await db.prepare(
                        `INSERT INTO kv_sync_status (dictamen_id, en_source, source_error)
                         VALUES (?, 0, ?)
                         ON CONFLICT(dictamen_id) DO UPDATE SET source_error = excluded.source_error, updated_at = ?`
                    ).bind(id, error.message, now).run();
                    return { ok: false };
                }
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
