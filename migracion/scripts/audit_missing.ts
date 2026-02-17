/**
 * @file scripts/audit_missing.ts
 * @description Data Integrity Auditor for CGR Migration.
 * 
 * This script reconciles the records imported into Cloudflare D1 against the original 
 * MongoDB source file. It identifies any IDs that failed to migrate.
 * 
 * Pre-requisite:
 * Run `wrangler d1 execute cgr-dictamenes --command "SELECT id FROM dictamenes" --format=json > scripts/logs/d1_ids.json`
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

/**
 * Compares IDs in the source text file with a JSON dump from D1.
 * Generates a list of missing records for re-ingestion.
 */
async function findMissing() {
    const FILE_PATH = path.resolve(__dirname, '../../mongoBackup/20250630_dictamenes_source_84973.txt');
    const D1_IDS_PATH = path.resolve(__dirname, '../logs/d1_ids.json');
    const MISSING_LOG_PATH = path.resolve(__dirname, '../logs/missing_ids.log');

    console.log('--- BUSCANDO REGISTROS FALTANTES ---');

    if (!fs.existsSync(D1_IDS_PATH)) {
        console.error('Error: No se encontró scripts/logs/d1_ids.json.');
        console.info('Uso: wrangler d1 execute <DB> --command "SELECT id FROM dictamenes" --format=json > scripts/logs/d1_ids.json');
        return;
    }

    // Load D1 IDs from the JSON dump
    // Handles both array of results and response object formats from wrangler
    const d1Data = JSON.parse(fs.readFileSync(D1_IDS_PATH, 'utf8'));
    let results: any[] = [];

    if (Array.isArray(d1Data)) {
        results = d1Data[0]?.results || [];
    } else if (d1Data && d1Data.results) {
        results = d1Data.results;
    }

    const d1Ids = new Set(results.map((r: any) => r.id));
    console.log(`Leídos ${d1Ids.size} IDs desde D1.`);

    // Stream the source file to check against the Set of IDs
    const fileStream = fs.createReadStream(FILE_PATH);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    const missing: string[] = [];
    let processed = 0;
    let currentId = '';

    for await (const line of rl) {
        // Fast ID extraction using regex
        if (line.includes('"id":')) {
            const match = line.match(/"id":\s*"([^"]+)"/);
            if (match) {
                currentId = match[1];
                if (!d1Ids.has(currentId)) {
                    missing.push(currentId);
                }
                processed++;
            }
        }
    }

    console.log(`\nRevisión completada. Procesados en fuente: ${processed}`);
    console.log(`Faltan en D1: ${missing.length} registros.`);

    // Save results for the feeder or manual review
    fs.writeFileSync(MISSING_LOG_PATH, missing.join('\n'));
    console.log(`Lista guardada en: ${MISSING_LOG_PATH}`);
}

// Start Audit
findMissing().catch(console.error);
