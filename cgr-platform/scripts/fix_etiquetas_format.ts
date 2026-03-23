import { execSync } from 'child_process';
import * as fs from 'fs';

// Helper for normalization
const normalizeBase = (t: string) => t.toLowerCase().trim().replace(/[\.\s]+$/, '').trim();
const normalizeDisplay = (t: string) => {
    let norm = t.trim().replace(/[\.\s]+$/, '');
    if (norm.length > 0) {
        norm = norm.charAt(0).toUpperCase() + norm.slice(1) + '.';
    }
    return norm;
};

async function fixEtiquetas() {
    console.log("Fetching dictamen_etiquetas_llm unique labels...");
    const out = execSync(`npx wrangler d1 execute cgr-dictamenes --remote --command="SELECT DISTINCT etiqueta FROM dictamen_etiquetas_llm;" --json`, { maxBuffer: 100 * 1024 * 1024 });
    const results = JSON.parse(out.toString())[0].results;
    
    // Clustering logic (simplified or same as before)
    // For speed, let's just group those that have the same normalizeBase.
    const groups: Record<string, string[]> = {};
    for (const row of results) {
        const et = row.etiqueta;
        const base = normalizeBase(et);
        if (!groups[base]) groups[base] = [];
        groups[base].push(et);
    }

    let sql = "";
    let count = 0;
    for (const base in groups) {
        const members = groups[base];
        const canonical = normalizeDisplay(members[0]);
        
        // Only update if any member is NOT the canonical one
        const needsUpdate = members.some(m => m !== canonical);
        if (needsUpdate) {
            const escapedCanonical = canonical.replace(/'/g, "''");
            const escapedMembers = members.map(m => `'${m.replace(/'/g, "''")}'`).join(",");
            sql += `UPDATE dictamen_etiquetas_llm SET etiqueta = '${escapedCanonical}' WHERE etiqueta IN (${escapedMembers});\n`;
            count++;
        }
    }

    console.log(`Generated ${count} group updates.`);
    
    // Deduplicate after updates (same logic as before)
    sql += `DELETE FROM dictamen_etiquetas_llm WHERE id NOT IN (SELECT MIN(id) FROM dictamen_etiquetas_llm GROUP BY dictamen_id, etiqueta);\n`;

    fs.writeFileSync('/tmp/fix_etiquetas_optimized.sql', sql);
    
    // Executing in chunks of 500
    const lines = sql.split('\n');
    const chunkSize = 500;
    for (let i = 0; i < lines.length; i += chunkSize) {
        const chunk = lines.slice(i, i + chunkSize).join('\n');
        if (chunk.trim()) {
            fs.writeFileSync(`/tmp/et_fix_chunk_${i/chunkSize}.sql`, chunk);
        }
    }
    console.log(`Saved ${Math.ceil(lines.length / chunkSize)} chunks for etiquetas fix.`);
}

fixEtiquetas();
