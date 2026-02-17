/**
 * @file scripts/feeder.ts
 * @description Turbo Data Feeder for CGR Migration.
 * 
 * This script reads a massive JSON backup file (85k+ records) using Node.js Streams
 * to maintain a low memory footprint. It pushes data to the Cloudflare Worker 
 * in parallel batches using a promise-based concurrency pool.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// --- Configuration ---
const CONFIG = {
    // Path to the large MongoDB dump (outside the current folder)
    FILE_PATH: path.resolve(__dirname, '../../mongoBackup/20250630_dictamenes_source_84973.txt'),
    // Cloudflare Worker endpoint
    WORKER_URL: 'https://cgr-migration-consumer.abogado.workers.dev/enqueue',
    // Security token expected by the Worker
    IMPORT_TOKEN: 'TOKEN_SEGURIDAD_CGR_2026',
    // Number of records per HTTP request
    BATCH_SIZE: 25,
    // Max simultaneous HTTP requests to optimize throughput (Turbo Mode)
    CONCURRENCY: 25,
    // Error log location
    LOG_PATH: path.resolve(__dirname, '../logs/migration_errors.log'),
};

/**
 * Main Feeder logic.
 * Uses a State Machine to parse non-standard large JSON streams.
 */
async function feeder() {
    console.log('--- INICIANDO FEEDER DE MIGRACIÓN PROFESIONAL (TURBO) ---');
    console.log(`Archivo: ${CONFIG.FILE_PATH}`);

    // Ensure logs directory exists
    const logDir = path.dirname(CONFIG.LOG_PATH);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    // Clear previous logs
    fs.writeFileSync(CONFIG.LOG_PATH, `Iniciando migración: ${new Date().toISOString()}\n\n`);

    if (!fs.existsSync(CONFIG.FILE_PATH)) {
        console.error('Error: El archivo de backup no existe.');
        process.exit(1);
    }

    // Stream interface for line-by-line reading (high performance)
    const fileStream = fs.createReadStream(CONFIG.FILE_PATH);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let currentBatch: any[] = [];
    let totalProcessed = 0;
    let totalEnqueued = 0;
    let totalErrors = 0;
    let lineBuffer = '';
    let inRecord = false;
    let currentId = '';

    // Concurrency Engine: Promise Pool to saturate the Worker binding
    const activePromises: Set<Promise<void>> = new Set();

    console.log(`Procesando con BATCH=${CONFIG.BATCH_SIZE} y CONCURRENCIA=${CONFIG.CONCURRENCY}...`);

    for await (const line of rl) {
        // Detect START of a JSON object (based on indentation of 2 spaces)
        if (line.startsWith('  {') && !inRecord) {
            inRecord = true;
            lineBuffer = '{';
            continue;
        }

        if (inRecord) {
            lineBuffer += line + '\n';

            // Pre-extract ID for logging purposes if parsing fails later
            if (!currentId && line.includes('"id":')) {
                const match = line.match(/"id":\s*"([^"]+)"/);
                if (match) currentId = match[1];
            }

            // Detect END of a JSON object (based on indentation of 2 spaces)
            if (line.startsWith('  },') || line.startsWith('  }')) {
                try {
                    // Clean up trailing commas for valid JSON.parse
                    const cleanJson = lineBuffer.trim().replace(/,$/, '');
                    const record = JSON.parse(cleanJson);

                    // Unified ID and Data structure
                    const id = record.id || (record.raw_data && record.raw_data.doc_id);
                    const raw_data = record.raw_data || record;

                    if (id) {
                        currentBatch.push({ id, raw_data });
                        totalProcessed++;
                    }

                    // Once batch is full, send to Worker via Promise Pool
                    if (currentBatch.length >= CONFIG.BATCH_SIZE) {
                        const batchToSend = [...currentBatch];
                        currentBatch = [];

                        // Execute Send in background
                        const p = sendBatch(batchToSend).then(() => {
                            totalEnqueued += batchToSend.length;
                            process.stdout.write(`\rProgreso: ${totalEnqueued} ok / ${totalErrors} errores...`);
                            activePromises.delete(p);
                        });
                        activePromises.add(p);

                        // If pool is saturated, wait for at least one slot to open before reading more
                        if (activePromises.size >= CONFIG.CONCURRENCY) {
                            await Promise.race(activePromises);
                        }
                    }
                } catch (e) {
                    totalErrors++;
                    const msg = `[Error JSON] ID: ${currentId || 'Desconocido'} | Error: ${(e as Error).message}\n`;
                    fs.appendFileSync(CONFIG.LOG_PATH, msg);
                }

                // Reset state machine for next record
                lineBuffer = '';
                inRecord = false;
                currentId = '';
            }
        }
    }

    // Await all background tasks to finish
    await Promise.all(activePromises);

    // Final residual batch
    if (currentBatch.length > 0) {
        await sendBatch(currentBatch);
        totalEnqueued += currentBatch.length;
    }

    console.log('\n\n--- MIGRACIÓN COMPLETADA ---');
    console.log(`Total registros leídos: ${totalProcessed}`);
    console.log(`Total registros encolados: ${totalEnqueued} ok / ${totalErrors} errores.`);
}

/**
 * Sends a single batch to the Worker endpoint via HTTP POST.
 * @param items Array of records formatted for the Queue consumer
 */
async function sendBatch(items: any[]) {
    try {
        const response = await fetch(CONFIG.WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-import-token': CONFIG.IMPORT_TOKEN,
            },
            body: JSON.stringify({ items }),
        });
        if (!response.ok) throw new Error(`Status ${response.status}`);
    } catch (error) {
        fs.appendFileSync(CONFIG.LOG_PATH, `[Error Red] Lote fallido: ${(error as Error).message}\n`);
    }
}

// Global invocation
feeder().catch(console.error);
