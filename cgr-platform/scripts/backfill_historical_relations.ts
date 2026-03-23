import { execSync } from 'child_process';

const ACTIONS_MAP: Record<string, string> = {
  'compleméntase': 'complementado',
  'complementa': 'complementado',
  'aclárase': 'aclarado',
  'aclara': 'aclarado',
  'reconsidérase': 'reconsiderado',
  'reconsidera': 'reconsiderado',
  'altera': 'alterado',
  'alteró': 'alterado',
  'confírmase': 'confirmado',
  'confirmó': 'confirmado',
  'reactiva': 'reactivado',
  'reactívase': 'reactivado',
  'aplícase': 'aplicado',
  'aplica': 'aplicado'
};

const REGEX_CGR = /(compleméntase|complementa|aclárase|aclara|reconsidérase|reconsidera|altera|alteró|confírmase|confirmó|reactiva|reactívase|aplícase|aplica).*?N°?\\s*([0-9.]+),?\\s+de\\s+(\\d{4})/gi;

function runSql(query: string) {
  const cmd = `npx wrangler d1 execute cgr-dictamenes --remote --command="${query.replace(/"/g, '\\"')}" --json`;
  try {
    const output = execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
    const jsonMatch = output.match(/\\[.*?\\]/s);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : output);
    return parsed[0]?.results || parsed?.results || parsed;
  } catch (error: any) {
    console.error('SQL Error:', error.message);
    return [];
  }
}

function getKV(key: string) {
  try {
    return execSync(`npx wrangler kv key get --binding=DICTAMENES_SOURCE "${key}"`, { stdio: 'pipe', encoding: 'utf-8' });
  } catch {
    return null;
  }
}

async function backfill() {
  console.log('--- INICIANDO BACKFILL HISTÓRICO DE RELACIONES (REGEX) ---\\n');

  const batchSize = 100;
  let offset = 0;
  let totalCount = 0;

  while (true) {
    console.log(`Buscando lote de ${batchSize} dictámenes (Offset: ${offset})...`);
    
    // 1. Obtener un lote de dictámenes
    const dictamenes = runSql(`
      SELECT id 
      FROM dictamenes 
      WHERE estado NOT LIKE 'error%'
      LIMIT ${batchSize} OFFSET ${offset}
    `);

    if (!dictamenes || dictamenes.length === 0) {
      break;
    }

    for (const doc of dictamenes) {
      const id = doc.id;
      const rawDataStr = getKV(id);
      if (!rawDataStr) continue;

      let text = '';
      try {
        const raw = JSON.parse(rawDataStr);
        const source = raw._source ?? raw.source ?? raw.raw_data ?? raw;
        text = source.documento_completo || source.texto || source.materia || '';
      } catch {
        continue;
      }

      if (!text) continue;

      let match;
      const matches = [];
      // Usar una nueva instancia de RegExp para resetear el lastIndex o simplemente lo dejamos porque se crea cada vez? 
      // Si la regex es global en el outer scope, necesitamos resetearla.
      REGEX_CGR.lastIndex = 0; 

      while ((match = REGEX_CGR.exec(text)) !== null) {
        const verb = match[1].toLowerCase();
        const numStr = match[2].replace(/\\./g, '');
        const anio = match[3];
        const accion = ACTIONS_MAP[verb];

        if (accion) {
          matches.push({ accion, numStr, anio });
        }
      }

      for (const m of matches) {
        // Buscar destino
        const destino = runSql(`SELECT id FROM dictamenes WHERE anio = ${m.anio} AND (numero = '${m.numStr}' OR numero LIKE '%${m.numStr}%') LIMIT 1`);
        if (destino && destino.length > 0) {
          const destinoId = destino[0].id;
          console.log(`[MATCH] ${id} --(${m.accion})--> ${destinoId}`);
          
          // Inyectar relación
          runSql(`INSERT OR IGNORE INTO dictamen_relaciones_juridicas (dictamen_origen_id, dictamen_destino_id, tipo_accion, origen_extracccion) VALUES ('${id}', '${destinoId}', '${m.accion}', 'backfill_regex_historical')`);
          
          // Asegurar flag en destino
          runSql(`UPDATE atributos_juridicos SET ${m.accion} = 1 WHERE dictamen_id = '${destinoId}'`);
          
          // Sincronizar enriquecimiento si existe
          runSql(`UPDATE enriquecimiento SET booleanos_json = json_set(COALESCE(booleanos_json, '{}'), '$.${m.accion}', json('true')) WHERE dictamen_id = '${destinoId}'`);
          
          totalCount++;
        }
      }
    }
    
    offset += batchSize;
  }

  console.log(`\\nBackfill finalizado. Se crearon ${totalCount} relaciones.`);
}

backfill().catch(console.error);
