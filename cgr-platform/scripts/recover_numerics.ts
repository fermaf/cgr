import { execSync } from 'child_process';
import * as fs from 'fs';

// To recover numeric descriptores, we can extract them from the JSONs.
// It's faster to do a full scan of enriquecimiento (since it has etiquetas_json).
// For descriptores, they are in KV but that's slow. We can also fetch the source from the staging or prod KV.
// Actually, `scripts/backfill_historical_relations.ts` might already do something similar? Let's check.
// Let's implement a targeted reingest.

console.log("Fetching dictamenes with numeric etiquetas_json...");
const enrOutput = execSync(`npx wrangler d1 execute cgr-dictamenes --remote --command="SELECT dictamen_id, etiquetas_json FROM enriquecimiento WHERE etiquetas_json GLOB '*[0-9]*'" --json`, { maxBuffer: 1024 * 1024 * 100 });
const enriquecidos: { dictamen_id: string, etiquetas_json: string }[] = JSON.parse(enrOutput.toString())[0].results;

console.log(`Found ${enriquecidos.length} dictamenes with numeric llm etiquetas.`);

const normalizeDisplay = (t: string) => {
    let norm = t.trim().replace(/[\.\s]+$/, '');
    if (norm.length > 0) {
        norm = norm.charAt(0).toUpperCase() + norm.slice(1) + '.';
    }
    return norm;
};

// Start transaction for D1
let sqlRecovery = `\n`;

for(const enr of enriquecidos) {
    if(!enr.etiquetas_json) continue;
    try {
        const parsed = JSON.parse(enr.etiquetas_json);
        if(Array.isArray(parsed)) {
            for(const et of parsed) {
                if(String(et).match(/\d/)) {
                    const tag = normalizeDisplay(String(et));
                    sqlRecovery += `INSERT OR IGNORE INTO dictamen_etiquetas_llm (dictamen_id, etiqueta) VALUES ('${enr.dictamen_id}', '${tag.replace(/'/g, "''")}');\n`;
                }
            }
        }
    } catch(e) {}
}

sqlRecovery += `\n`;
fs.writeFileSync('/tmp/recovery_etiquetas.sql', sqlRecovery);
console.log('Recovery SQL generated at /tmp/recovery_etiquetas.sql');
