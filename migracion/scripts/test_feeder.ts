/**
 * @file scripts/test_feeder.ts
 * @description Integration Test Script for the Migration Feeder.
 * 
 * Extracts a small sample (first 10 and last 10 records) from the massive backup file
 * and sends them to the Cloudflare Worker to verify the end-to-end pipeline 
 * before committing to a full migration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const CONFIG = {
    FILE_PATH: path.resolve(__dirname, '../../mongoBackup/20250630_dictamenes_source_84973.txt'),
    WORKER_URL: 'https://cgr-migration-consumer.abogado.workers.dev/enqueue',
    IMPORT_TOKEN: 'TOKEN_SEGURIDAD_CGR_2026',
};

/**
 * Parses JSON records from a string block.
 * Implements the same state machine logic as the main feeder for consistency.
 * @param text Block of text potentially containing multiple dictamen objects.
 */
function parseJsonFromText(text: string): any[] {
    const records: any[] = [];
    const lines = text.split('\n');
    let buffer = '';
    let inRecord = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Start of record
        if (line.startsWith('  {') && !inRecord) {
            inRecord = true;
            buffer = '{';
            continue;
        }

        if (inRecord) {
            buffer += line + '\n';

            // End of record
            if (line.startsWith('  },') || line.startsWith('  }')) {
                try {
                    const cleanJson = buffer.trim().replace(/,$/, '');
                    const record = JSON.parse(cleanJson);

                    const id = record.id || (record.raw_data && record.raw_data.doc_id);
                    const raw_data = record.raw_data || record;

                    if (id) records.push({ id, raw_data });
                } catch (e) {
                    // Silently skip corrupted sample lines
                }
                buffer = '';
                inRecord = false;
            }
        }
    }
    return records;
}

/**
 * Sends a single batch to the Worker.
 */
async function sendBatch(items: any[]) {
    console.log(`[Test] Enviando lote de ${items.length} registros de prueba...`);
    try {
        const response = await fetch(CONFIG.WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-import-token': CONFIG.IMPORT_TOKEN,
            },
            body: JSON.stringify({ items }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Worker Error ${response.status}: ${errorText}`);
        }
        console.log('[Test] OK: Lote de prueba procesado por el Worker.');
    } catch (error) {
        console.error(`[Test] ERROR: ${(error as Error).message}`);
    }
}

/**
 * Main Testing Entry Point.
 * Uses shell commands (head/tail) to quickly sample a massive file.
 */
async function testFeeder() {
    console.log('--- INICIANDO PRUEBA DE MIGRACIÓN (SAMPLE 10+10) ---');

    if (!fs.existsSync(CONFIG.FILE_PATH)) {
        console.error(`[Test] Archivo no encontrado: ${CONFIG.FILE_PATH}`);
        return;
    }

    try {
        // Sample first lines and last lines using shell utilities for speed
        const execOptions = { maxBuffer: 10 * 1024 * 1024 };
        const startText = execSync(`head -n 500 "${CONFIG.FILE_PATH}"`, execOptions).toString();
        const endText = execSync(`tail -n 500 "${CONFIG.FILE_PATH}"`, execOptions).toString();

        const primeros = parseJsonFromText(startText).slice(0, 10);
        const ultimos = parseJsonFromText(endText).slice(-10);

        const muestraTotal = [...primeros, ...ultimos];

        console.log(`[Test] Muestra generada: ${muestraTotal.length} registros.`);

        if (muestraTotal.length > 0) {
            await sendBatch(muestraTotal);
        } else {
            console.error('[Test] Fallo al extraer registros de la muestra.');
        }

    } catch (err) {
        console.error(`[Test] Error de IO: ${(err as Error).message}`);
    }

    console.log('--- PRUEBA FINALIZADA ---');
}

testFeeder().catch(console.error);
