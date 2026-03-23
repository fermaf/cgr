import { execSync } from 'child_process';

// Mock del output de Mistral
const mockMistralOutput = {
  dictamen_origen_id: '008890N20',
  acciones_juridicas_emitidas: [
    {
      accion: 'complementado',
      numero_destino: '7640',
      anio_destino: '2007',
    },
  ],
};

function runSql(query: string, returnResult = true): any {
  const cmd = `npx wrangler d1 execute cgr-dictamenes --remote --command="${query.replace(/"/g, '\\"')}" --json`;
  try {
    const output = execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
    if (returnResult) {
      try {
        const jsonMatch = output.match(/\\[.*?\\]/s);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : output);
        return parsed[0]?.results || parsed?.results || parsed;
      } catch {
        return output; // Fallback
      }
    }
    return output;
  } catch (error: any) {
    console.error('SQL Error:', error.message);
    console.error('Output:', error.stdout?.toString());
    throw error;
  }
}

async function retroUpdate() {
  console.log('--- TEST: RETRO-UPDATE SYNCHRONIZATION ---\\n');

  for (const act of mockMistralOutput.acciones_juridicas_emitidas) {
    console.log(`Buscando dictamen destino: Número ${act.numero_destino}, Año ${act.anio_destino}...`);
    
    const searchDest = runSql(`SELECT id FROM dictamenes WHERE anio = ${act.anio_destino} AND (numero = '${act.numero_destino}' OR numero LIKE '%${act.numero_destino}%') LIMIT 1`);
    
    // Fallback if the parser didn't return an object
    const results = Array.isArray(searchDest) ? searchDest : searchDest[0]?.results;
    
    if (!results || results.length === 0) {
      console.log('Destino no encontrado en la DB.\\n');
      continue;
    }
    
    const destinoId = results[0].id; // ej. 007640N07
    console.log(`Encontrado: ${destinoId} \\n`);

    // --- ESTADO PREVIO ---
    console.log(`--> Estado Previo de ${destinoId}:`);
    const preAttr = runSql(`SELECT complementado FROM atributos_juridicos WHERE dictamen_id = '${destinoId}'`);
    console.log('Atributos Jurídicos:', Array.isArray(preAttr) ? preAttr[0] : preAttr[0]?.results[0]);
    
    const preEnrich = runSql(`SELECT booleanos_json FROM enriquecimiento WHERE dictamen_id = '${destinoId}'`);
    console.log('Enriquecimiento (booleanos_json):', Array.isArray(preEnrich) ? preEnrich[0] : preEnrich[0]?.results[0]);
    
    const preRel = runSql(`SELECT * FROM dictamen_relaciones_juridicas WHERE dictamen_origen_id = '${mockMistralOutput.dictamen_origen_id}' AND dictamen_destino_id = '${destinoId}'`);
    console.log('Relación:', Array.isArray(preRel) ? preRel : preRel[0]?.results);
    console.log('\\n');

    // --- APLICAR RETRO-UPDATE ---
    console.log(`Aplicando Retro-Update: ${mockMistralOutput.dictamen_origen_id} -> ${act.accion} -> ${destinoId}...`);
    
    // 1. Insert DB Graph
    runSql(`INSERT OR REPLACE INTO dictamen_relaciones_juridicas (dictamen_origen_id, dictamen_destino_id, tipo_accion, origen_extracccion) VALUES ('${mockMistralOutput.dictamen_origen_id}', '${destinoId}', '${act.accion}', 'retro_update_test')`, false);
    
    // 2. Update Atributos
    runSql(`UPDATE atributos_juridicos SET ${act.accion} = 1 WHERE dictamen_id = '${destinoId}'`, false);
    
    // 3. Update Enriquecimiento JSON
    runSql(`
      UPDATE enriquecimiento 
      SET booleanos_json = json_set(
        COALESCE(booleanos_json, '{}'), 
        '$.${act.accion}', 
        json('true')
      ) 
      WHERE dictamen_id = '${destinoId}'
    `, false);

    // 4. Log Event
    runSql(`INSERT INTO dictamen_events (dictamen_id, event_type, metadata, created_at) VALUES ('${destinoId}', 'RETRO_UPDATE_APPLIED', '{"origen": "${mockMistralOutput.dictamen_origen_id}", "accion": "${act.accion}"}', datetime('now'))`, false);

    console.log('Operaciones D1 Ejecutadas.\\n');

    // --- ESTADO FINAL ---
    console.log(`--> Estado Final de ${destinoId}:`);
    const postAttr = runSql(`SELECT complementado FROM atributos_juridicos WHERE dictamen_id = '${destinoId}'`);
    console.log('Atributos Jurídicos:', Array.isArray(postAttr) ? postAttr[0] : postAttr[0]?.results[0]);
    
    const postEnrich = runSql(`SELECT booleanos_json FROM enriquecimiento WHERE dictamen_id = '${destinoId}'`);
    console.log('Enriquecimiento (booleanos_json):', Array.isArray(postEnrich) ? postEnrich[0] : postEnrich[0]?.results[0]);
    
    const postRel = runSql(`SELECT * FROM dictamen_relaciones_juridicas WHERE dictamen_origen_id = '${mockMistralOutput.dictamen_origen_id}' AND dictamen_destino_id = '${destinoId}'`);
    console.log('Relación:', Array.isArray(postRel) ? postRel : postRel[0]?.results);
  }
}

retroUpdate().catch(console.error);
