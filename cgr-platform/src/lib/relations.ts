import { Env, AccionJuridicaEmitida } from '../types';
import { 
  findDictamenIdByNumeroAnio, 
  insertDictamenRelacionJuridica, 
  insertDictamenRelacionHuerfana,
  updateEnrichmentBooleanos,
  logDictamenEvent
} from '../storage/d1';
import { logInfo, logError } from './log';

/**
 * Aplica el flujo Retro-Update: propagate flags from a new dictamen to its historical targets.
 */
interface ApplyRetroUpdatesOptions {
  origenExtraccion?: string;
  orphanPrefix?: string;
}

export async function applyRetroUpdates(
  env: Env,
  origenId: string,
  acciones: AccionJuridicaEmitida[],
  options: ApplyRetroUpdatesOptions = {}
): Promise<void> {
  if (!acciones || acciones.length === 0) return;

  logInfo('RELATIONS_RETRO_UPDATE_START', { origenId, count: acciones.length });

  for (const act of acciones) {
    try {
      const { accion, numero_destino, anio_destino } = act;
      
      // 1. Buscar ID de destino
      const destinoId = await findDictamenIdByNumeroAnio(env.DB, numero_destino, anio_destino);

      if (!destinoId) {
        logInfo('RELATIONS_TARGET_NOT_FOUND', { numero_destino, anio_destino, action: accion });
        // Registrar en tabla de huérfanos para auditoría futura/batch LLM
        const orphanPrefix = options.orphanPrefix ?? 'llm_actions_v1';
        await insertDictamenRelacionHuerfana(env.DB, origenId, `${orphanPrefix}:${accion}:${numero_destino}/${anio_destino}`);
        continue;
      }

      logInfo('RELATIONS_APPLYING', { origenId, destinoId, accion });

      // 2. Insertar relación en Grafo (D1)
      await insertDictamenRelacionJuridica(env.DB, {
        origen_id: origenId,
        destino_id: destinoId,
        tipo_accion: accion,
        origen_extracccion: options.origenExtraccion ?? 'llm_actions_v1'
      });

      // 3. Update Atributos Escalares (D1)
      // Usamos el flag extraído por Mistral
      const sqlAttr = `UPDATE atributos_juridicos SET ${accion} = 1 WHERE dictamen_id = ?`;
      await env.DB.prepare(sqlAttr).bind(destinoId).run();

      // 4. Update Enriquecimiento JSON (D1)
      await updateEnrichmentBooleanos(env.DB, destinoId, accion, true);

      // 5. Update KV Source (KV) - Sincronía del objeto original
      await syncKVSourceBoolean(env, destinoId, accion, true);

      // 6. Registrar Evento
      await logDictamenEvent(env.DB, {
        dictamen_id: destinoId,
        event_type: 'RETRO_UPDATE_APPLIED',
        metadata: {
          origen_id: origenId,
          accion: accion
        }
      });

      // Nota: La re-vectorización en Pinecone se gatillará si el estado del dictamen cambia,
      // o podemos forzarla aquí si es crítico. Dado el volumen, es mejor dejar que un
      // proceso de re-sync detecte el desfase de versión o gatillar un webhook de re-index.
      
    } catch (error) {
      logError('RELATIONS_RETRO_UPDATE_STEP_ERROR', error, { origenId, action: act });
    }
  }
}

/**
 * Actualiza el flag booleano dentro del JSON crudo almacenado en KV.
 */
async function syncKVSourceBoolean(
  env: Env,
  dictamenId: string,
  flag: string,
  value: boolean
): Promise<void> {
  try {
    const candidates = [dictamenId, `dictamen:${dictamenId}`];
    let raw: any = null;
    let matchedKey: string | null = null;
    for (const candidate of candidates) {
      raw = await env.DICTAMENES_SOURCE.get(candidate, { type: 'json' }) as any;
      if (raw) {
        matchedKey = candidate;
        break;
      }
    }
    if (!raw || !matchedKey) return;

    const source = raw._source ?? raw.source ?? raw.raw_data ?? raw;
    source[flag] = value;

    await env.DICTAMENES_SOURCE.put(matchedKey, JSON.stringify(raw));
  } catch (error) {
    logError('KV_SOURCE_SYNC_BOOLEAN_ERROR', error, { dictamenId, flag });
  }
}
