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

async function fixKv(id) {
    const key = `dictamen:${id}`;
    console.log(`Fixing KV for ${id}...`);

    // 1. Get
    const raw = execSync(`npx wrangler kv key get --binding DICTAMENES_SOURCE "${key}" --remote`).toString();
    const json = JSON.parse(raw);

    // 2. Normalize date to YYYY-MM-DD
    let rawDate = json._source.fecha_documento; // e.g. "18-11-2025" or "2025-07-22T00:00:00+00:00"
    let newDate = "";

    if (rawDate && rawDate.includes('T')) {
        newDate = rawDate.split('T')[0];
    } else if (rawDate && rawDate.includes('-') && rawDate.split('-')[0].length === 2) {
        const [d, m, y] = rawDate.split('-');
        newDate = `${y}-${m}-${d}`;
    } else {
        newDate = rawDate;
    }

    if (newDate && newDate !== rawDate) {
        json._source.fecha_documento = newDate;
        console.log(`  Normalized date: ${rawDate} -> ${newDate}`);

        // 3. Put back
        const tmpFile = join('/tmp', `kv_${id}.json`);
        writeFileSync(tmpFile, JSON.stringify(json));
        execSync(`npx wrangler kv key put --binding DICTAMENES_SOURCE "${key}" --path "${tmpFile}" --remote`);
    } else {
        console.log(`  Date already normalized or missing: ${oldDate}`);
    }
}

async function sync(id) {
    console.log(`Syncing ${id}...`);
    const res = execSync(`curl -s -X POST https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/${id}/sync-vector -H "x-admin-token: paz_mundial"`).toString();
    console.log(`  Result: ${res}`);
}

async function main() {
    for (const id of ids) {
        try {
            await fixKv(id);
            await sync(id);
        } catch (e) {
            console.error(`Error for ${id}:`, e.message);
        }
    }

    // Sync easy ones remaining
    const easyIds = ['002746N20', '002749N20', '002761N20', '008890N20', 'E362558N23', 'E422382N23'];
    for (const id of easyIds) {
        await sync(id);
    }
}

main();
