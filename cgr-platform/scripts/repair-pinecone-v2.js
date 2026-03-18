import https from 'https';

// Endpoint masivo que procesa registros con version < 2
const API_URL = 'https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/sync-vector-mass';
const ADMIN_TOKEN = 'paz_mundial'; // Tomado de wrangler.jsonc / .dev.vars

async function runSyncBatch(limit) {
    return new Promise((resolve, reject) => {
        console.log(`[Batch] Solicitando sincronización de ${limit} registros...`);
        const body = JSON.stringify({ limit });

        const req = https.request(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': ADMIN_TOKEN
            }
        }, (res) => {
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
        req.write(body);
        req.end();
    });
}

async function main() {
    console.log(`--- INICIANDO REPARACIÓN MASIVA PINECONE V2 ---`);
    let totalProcesados = 0;
    const batchSize = 100;

    while (true) {
        try {
            const result = await runSyncBatch(batchSize);

            if (!result.success) {
                console.error('Error en el procesamiento:', result.error);
                break;
            }

            totalProcesados += result.processed;
            console.log(`Procesados en este lote: ${result.processed}. Total acumulado: ${totalProcesados}`);

            if (result.processed === 0) {
                console.log('\n--- REPARACIÓN COMPLETADA: No quedan registros pendientes ---');
                break;
            }

            // Pequeña pausa para no saturar
            await new Promise(r => setTimeout(r, 1000));

        } catch (e) {
            console.error('Error fatal durante la ejecución:', e);
            break;
        }
    }
}

main();
