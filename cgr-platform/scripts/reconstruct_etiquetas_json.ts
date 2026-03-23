import { execSync } from 'child_process';
import * as fs from 'fs';

async function reconstruct() {
    console.log("Fetching normalized labels from dictamen_etiquetas_llm...");
    const out = execSync(`npx wrangler d1 execute cgr-dictamenes --remote --command="SELECT dictamen_id, json_group_array(etiqueta) as etiquetas FROM dictamen_etiquetas_llm GROUP BY dictamen_id;" --json`, { maxBuffer: 100 * 1024 * 1024 });
    const dictamenTags = JSON.parse(out.toString())[0].results;
    
    console.log(`Generating updates for ${dictamenTags.length} dictamenes...`);
    
    let sql = "";
    const CHUNK_SIZE = 1000;
    let chunkCount = 0;
    
    for (let i = 0; i < dictamenTags.length; i++) {
        const row = dictamenTags[i];
        sql += `UPDATE enriquecimiento SET etiquetas_json = '${row.etiquetas.replace(/'/g, "''")}' WHERE dictamen_id = '${row.dictamen_id}';\n`;
        
        if ((i + 1) % CHUNK_SIZE === 0 || i === dictamenTags.length - 1) {
            fs.writeFileSync(`/tmp/sync_json_chunk_${chunkCount}.sql`, sql);
            sql = "";
            chunkCount++;
        }
    }
    
    console.log(`Generated ${chunkCount} chunks. Executing...`);
    
    for (let j = 0; j < chunkCount; j++) {
        console.log(`Executing chunk ${j} / ${chunkCount}...`);
        execSync(`npx wrangler d1 execute cgr-dictamenes --remote --file=/tmp/sync_json_chunk_${j}.sql --yes`);
    }
    
    console.log("Reconstruction complete!");
}

reconstruct();
