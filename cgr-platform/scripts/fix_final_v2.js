import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ids = [
    'E122873N25',
    'E123071N25',
    'E129274N25',
    'E195880N25',
    'E195929N25'
];

async function fixAndMigrate(id) {
    const oldKey = `dictamen:${id}`;
    const newKey = id;
    console.log(`Migrating and Fixing KV for ${id}...`);

    try {
        // 1. Get from old key
        const raw = execSync(`npx wrangler kv key get --binding DICTAMENES_SOURCE "${oldKey}" --remote`).toString();
        const json = JSON.parse(raw);

        // 2. Normalize date to YYYY-MM-DD
        let rawDate = json._source?.fecha_documento || json.fecha_documento;
        let newDate = "";

        if (rawDate && rawDate.includes('T')) {
            newDate = rawDate.split('T')[0];
        } else if (rawDate && rawDate.includes('-') && rawDate.split('-')[0].length === 2) {
            const [d, m, y] = rawDate.split('-');
            newDate = `${y}-${m}-${d}`;
        } else {
            newDate = rawDate;
        }

        if (newDate) {
            if (json._source) json._source.fecha_documento = newDate;
            json.fecha_documento = newDate;
        }

        // 3. Put to new key
        const tmpFile = join('/tmp', `kv_migrated_${id}.json`);
        writeFileSync(tmpFile, JSON.stringify(json));
        execSync(`npx wrangler kv key put --binding DICTAMENES_SOURCE "${newKey}" --path "${tmpFile}" --remote`);
        console.log(`  Migrated to key "${newKey}" with date ${newDate}`);

        // 4. Sync
        console.log(`  Syncing...`);
        const res = execSync(`curl -s -X POST https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/${id}/sync-vector -H "x-admin-token: paz_mundial"`).toString();
        console.log(`  Result: ${res}`);
    } catch (e) {
        console.error(`  Error: ${e.message}`);
    }
}

async function main() {
    for (const id of ids) {
        await fixAndMigrate(id);
    }
}

main();
