const fs = require('fs');
const { execSync } = require('child_process');

try {
    console.log("Loading KV keys...");
    const sourceKeys = require('/tmp/kv_source_prod_keys.json').map(k => k.name);
    const pasoKeys = require('/tmp/kv_paso_prod_keys.json').map(k => k.name);

    const allKvKeys = new Set();
    for (const k of pasoKeys) allKvKeys.add(k);
    for (const k of sourceKeys) {
        const cleanKey = k.replace(/^dictamen:/, '');
        allKvKeys.add(cleanKey);
    }

    console.log(`Unique KV keys across SOURCE and PASO: ${allKvKeys.size}`);

    console.log("Fetching all IDs from D1...");
    // Limit to records that are NOT already sin_kv
    const d1Raw = execSync('npx wrangler d1 execute cgr-dictamenes --remote --command="SELECT id FROM dictamenes WHERE estado != \'sin_kv\'" --json', { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 50 });
    const records = JSON.parse(d1Raw);
    let rows = [];
    if (Array.isArray(records)) {
        if (records[0] && Array.isArray(records[0].results)) {
            rows = records[0].results;
        } else { rows = records; }
    } else if (records.results) {
        rows = records.results;
    }

    console.log(`Found ${rows.length} dictamenes to check.`);

    const missingIds = [];
    for (const row of rows) {
        if (!allKvKeys.has(row.id)) {
            missingIds.push(row.id);
        }
    }

    console.log(`${missingIds.length} dictamenes DO NOT have a KV record.`);

    if (missingIds.length > 0) {
        console.log("Writing SQL update script in batches...");
        const chunkSize = 200;
        let sqlLines = [];
        for (let i = 0; i < missingIds.length; i += chunkSize) {
            let chunk = missingIds.slice(i, i + chunkSize);
            let inClause = chunk.map(id => `'${id}'`).join(',');
            sqlLines.push(`UPDATE dictamenes SET estado = 'sin_kv' WHERE id IN (${inClause});`);
        }

        const batchedFiles = [];
        const filesPerBatch = 50; // Execute 50 UPDATEs (10,000 records) per file
        for (let i = 0; i < sqlLines.length; i += filesPerBatch) {
            const fileContent = sqlLines.slice(i, i + filesPerBatch).join('\n');
            const filePath = `/tmp/update_sin_kv_${batchedFiles.length}.sql`;
            fs.writeFileSync(filePath, fileContent);
            batchedFiles.push(filePath);
        }

        console.log(`Created ${batchedFiles.length} batch files. To update D1, run:`);
        for (const bf of batchedFiles) {
            console.log(`npx wrangler d1 execute cgr-dictamenes --remote --file=${bf}`);
        }
    }
    console.log("Done preparing script!");
} catch (error) {
    console.error(error);
}
