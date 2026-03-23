import { execSync } from 'child_process';
import * as fs from 'fs';

async function syncEnriquecimiento() {
    console.log("Fetching all dictamen_ids from enriquecimiento...");
    const out = execSync(`npx wrangler d1 execute cgr-dictamenes --remote --command="SELECT dictamen_id FROM enriquecimiento WHERE dictamen_id IN (SELECT DISTINCT dictamen_id FROM dictamen_etiquetas_llm);" --json`, { maxBuffer: 100 * 1024 * 1024 });
    const dictamenes = JSON.parse(out.toString())[0].results;
    const ids = dictamenes.map((d: any) => d.dictamen_id);
    
    console.log(`Syncing ${ids.length} dictamenes...`);
    
    const BATCH_SIZE = 500;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${i / BATCH_SIZE} / ${Math.ceil(ids.length / BATCH_SIZE)}...`);
        
        const sql = `
            UPDATE enriquecimiento 
            SET etiquetas_json = (
                SELECT json_group_array(etiqueta) 
                FROM dictamen_etiquetas_llm 
                WHERE dictamen_etiquetas_llm.dictamen_id = enriquecimiento.dictamen_id
            )
            WHERE dictamen_id IN (${batch.map((id: string) => `'${id}'`).join(',')});
        `;
        
        fs.writeFileSync('/tmp/sync_batch.sql', sql);
        execSync(`npx wrangler d1 execute cgr-dictamenes --remote --file=/tmp/sync_batch.sql --yes`);
    }
    
    console.log("Sync complete!");
}

syncEnriquecimiento();
