import https from 'https';

const API_URL = 'https://cgr-platform.abogado.workers.dev/api/v1/jobs/repair-nulls?limit=300';
let totalRepaired = 0;
let totalErrors = 0;
let batchCount = 0;

async function runBatch() {
    return new Promise((resolve, reject) => {
        console.log(`[Batch ${batchCount + 1}] Starting request...`);
        const req = https.request(API_URL, { method: 'POST' }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    console.error("Failed to parse JSON", data);
                    reject(e);
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
}

async function loop() {
    console.log('--- STARTING BULK NULLS REPAIR ---');
    while (true) {
        try {
            const response = await runBatch();
            if (response.count === 0 || response.msg === 'No pending null records to repair.') {
                console.log(`\nDONE. No more pending records found. Purgado completo.`);
                break;
            }

            const repaired = response.repairedCount || 0;
            const errors = response.errors || 0;

            totalRepaired += repaired;
            totalErrors += errors;
            batchCount++;

            console.log(`[Batch ${batchCount}] Repaired: ${repaired} | Errors: ${errors} | Total Repaired So Far: ${totalRepaired}`);

            if (errors > 0) {
                console.warn(`[!] Encountered ${errors} errors in this batch.`);
            }

            await new Promise(r => setTimeout(r, 600));

        } catch (e) {
            console.error('Fatal error during request loop:', e);
            break;
        }
    }
}

loop();
