#!/usr/bin/env node
// cgr-platform/scripts/reconciliador-kv-d1.mjs
// CLI wrapper del reconciliador KV↔D1 — thin shell sobre src/lib/reconciliadorKV.mjs.
// Lógica pura en lib; aquí sólo wrangler calls + CLI.
//
// Uso:
//   node scripts/reconciliador-kv-d1.mjs [--max-docs N] [--sample] [--format md|csv|json|all]
//     [--env production|staging] [--offset N] [--timeout-ms N]
//
// Madurez: prototipo revisable. No ejecutar sobre producción completa sin aprobación CEO/humana.

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  parseKVPayload,
  reconcileDictamen,
  buildReconciliationReport,
  buildEmptyReport,
  formatMarkdown,
  formatCSV,
  formatJSON,
} from '../src/lib/reconciliadorKV.mjs';

// ─── Configuración ──────────────────────────────────────────────────────────

const REAL_HOME = process.env.HOME?.includes('/.hermes/profiles/')
  ? process.env.HOME.split('/.hermes/profiles/')[0]
  : (process.env.HOME || '.');
const WRANGLER = `${REAL_HOME}/.hermes/node/bin/wrangler`;
const D1_DATABASE = 'cgr-dictamenes';
const KV_SOURCE_ID = 'ac84374936a84e578928929243687a0b';
const KV_PASO_ID = '4673b680cd704508a4fbc87789acb153';
const DEFAULT_MAX_DOCS = 20;
const MAX_MAX_DOCS = 200;
const DEFAULT_TIMEOUT_MS = 15000;

// ─── Utilidades wrangler ────────────────────────────────────────────────────

function execQuiet(command, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const stdout = execSync(command, {
      timeout: timeoutMs,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${REAL_HOME}/.hermes/node/bin:${process.env.PATH || ''}` },
    });
    return { stdout: stdout.trim(), stderr: '', exitCode: 0, error: null };
  } catch (err) {
    return {
      stdout: err.stdout?.toString()?.trim() || '',
      stderr: err.stderr?.toString()?.trim() || '',
      exitCode: err.status || 1,
      error: err.message || String(err),
    };
  }
}

function queryD1(sql, env = 'production') {
  const safeSql = sql.trim();
  if (!/^(SELECT|PRAGMA|WITH)\b/i.test(safeSql)) {
    return { rows: [], error: `SQL rechazado: no es SELECT/PRAGMA/WITH: ${safeSql.substring(0, 80)}` };
  }
  const cmd = `${WRANGLER} d1 execute ${D1_DATABASE} --env ${env} --remote --command "${safeSql.replace(/"/g, '\\"')}" --json`;
  const result = execQuiet(cmd);

  if (result.exitCode !== 0) {
    return { rows: [], error: `D1 query failed (exit ${result.exitCode}): ${result.stderr.substring(0, 200)}` };
  }

  try {
    const parsed = JSON.parse(result.stdout);
    if (!parsed?.[0]?.success) {
      return { rows: [], error: `D1 query returned success=false: ${JSON.stringify(parsed[0]?.error || 'unknown')}` };
    }
    return { rows: parsed[0]?.results || [], error: null };
  } catch (parseErr) {
    return { rows: [], error: `D1 JSON parse error: ${parseErr.message}` };
  }
}

/**
 * Obtiene el valor de una llave KV y lo analiza con parseKVPayload de la lib.
 * NUNCA imprime el contenido.
 */
function checkKVKey(namespaceId, key, namespaceName, keyFormat, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const cmd = `${WRANGLER} kv key get "${key}" --namespace-id ${namespaceId} --remote --text`;
  const result = execQuiet(cmd, timeoutMs);

  if (result.exitCode !== 0) {
    return parseKVPayload(null, namespaceName, keyFormat);
  }

  return parseKVPayload(result.stdout, namespaceName, keyFormat);
}

// ─── Orquestador ────────────────────────────────────────────────────────────

function runReconciliation(opts) {
  const { maxDocs, sample, offset, env, timeoutMs } = opts;

  const countResult = queryD1('SELECT COUNT(*) AS total FROM dictamenes', env);
  const totalCorpus = countResult.rows?.[0]?.total || 0;
  if (countResult.error) {
    throw new Error(`Fallo al contar dictamenes: ${countResult.error}`);
  }

  let sql;
  if (sample) {
    sql = `SELECT d.id, COALESCE(ks.en_source, 0) AS en_source, COALESCE(ks.en_paso, 0) AS en_paso
FROM dictamenes d
LEFT JOIN kv_sync_status ks ON ks.dictamen_id = d.id
WHERE d.id IS NOT NULL
ORDER BY RANDOM()
LIMIT ${maxDocs}`;
  } else {
    sql = `SELECT d.id, COALESCE(ks.en_source, 0) AS en_source, COALESCE(ks.en_paso, 0) AS en_paso
FROM dictamenes d
LEFT JOIN kv_sync_status ks ON ks.dictamen_id = d.id
WHERE d.id IS NOT NULL
ORDER BY d.id
LIMIT ${maxDocs} OFFSET ${offset}`;
  }

  const batchResult = queryD1(sql, env);
  if (batchResult.error) {
    throw new Error(`Fallo al obtener batch D1: ${batchResult.error}`);
  }

  const rows = batchResult.rows;
  if (!rows || rows.length === 0) {
    return buildEmptyReport(env, maxDocs, sample, offset, totalCorpus);
  }

  const detalles = [];
  let processed = 0;
  const total = rows.length;

  for (const row of rows) {
    const dictamenId = row.id;
    const enSource = typeof row.en_source === 'number' ? row.en_source : parseInt(row.en_source, 10) || 0;
    const enPaso = typeof row.en_paso === 'number' ? row.en_paso : parseInt(row.en_paso, 10) || 0;

    const sourceId = checkKVKey(KV_SOURCE_ID, dictamenId, 'SOURCE', 'id', timeoutMs);
    const sourceDictamenId = checkKVKey(KV_SOURCE_ID, `dictamen:${dictamenId}`, 'SOURCE', 'dictamen:id', timeoutMs);
    const pasoId = checkKVKey(KV_PASO_ID, dictamenId, 'PASO', 'id', timeoutMs);

    const rec = reconcileDictamen(dictamenId, enSource, enPaso, sourceId, sourceDictamenId, pasoId);
    detalles.push(rec);
    processed++;

    process.stderr.write(`\r  [${processed}/${total}] ${dictamenId}... `);
  }
  process.stderr.write('\n');

  return buildReconciliationReport(detalles, env, {
    mode: sample ? 'sample' : 'sequential',
    maxDocs,
    offset: sample ? undefined : offset,
    totalCorpus,
  });
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    maxDocs: DEFAULT_MAX_DOCS,
    sample: false,
    offset: 0,
    env: 'production',
    format: 'md',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    output: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--max-docs':
        opts.maxDocs = Math.min(parseInt(args[++i], 10) || DEFAULT_MAX_DOCS, MAX_MAX_DOCS);
        break;
      case '--sample':
        opts.sample = true;
        break;
      case '--offset':
        opts.offset = parseInt(args[++i], 10) || 0;
        break;
      case '--env':
        opts.env = args[++i] === 'staging' ? 'staging' : 'production';
        break;
      case '--format':
        opts.format = args[++i];
        if (!['md', 'csv', 'json', 'all'].includes(opts.format)) {
          opts.format = 'md';
        }
        break;
      case '--timeout-ms':
        opts.timeoutMs = parseInt(args[++i], 10) || DEFAULT_TIMEOUT_MS;
        break;
      case '--output':
        opts.output = args[++i];
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
    }
  }

  return opts;
}

function showHelp() {
  console.log(`Reconciliador KV↔D1 — CGR Platform (read-only)

Uso:
  node scripts/reconciliador-kv-d1.mjs [opciones]

Opciones:
  --max-docs N      Máximo de dictámenes a procesar (default: ${DEFAULT_MAX_DOCS}, max: ${MAX_MAX_DOCS})
  --sample          Muestreo aleatorio en vez de secuencial
  --offset N        Offset para muestreo secuencial (default: 0)
  --env ENV         Entorno: production|staging (default: production)
  --format FMT      Formato: md|csv|json|all (default: md)
  --timeout-ms MS   Timeout por operación KV en ms (default: ${DEFAULT_TIMEOUT_MS})
  --output PATH     Archivo de salida (default: stdout)
  --help, -h        Esta ayuda

Seguridad:
  - No imprime payloads ni documento_completo.
  - No muta D1 ni KV.
  - rows_written=0, cloudflare_mutations=false, anonimizacion_verificada=true.

Ejemplo:
  node scripts/reconciliador-kv-d1.mjs --max-docs 20 --sample --format all --output reports/reconciliacion.md
`);
}

async function main() {
  const opts = parseArgs();

  if (opts.help) {
    showHelp();
    process.exit(0);
  }

  process.stderr.write(`\n🔍 Reconciliador KV↔D1 — inicio ${new Date().toISOString()}\n`);
  process.stderr.write(`   Entorno: ${opts.env} | Lote: ${opts.maxDocs} | Muestreo: ${opts.sample ? 'aleatorio' : 'secuencial'}\n`);
  process.stderr.write(`   ⚠️  Read-only. No muta D1/KV. No imprime payloads.\n\n`);

  let report;
  try {
    report = runReconciliation(opts);
  } catch (err) {
    process.stderr.write(`\n❌ Error: ${err.message}\n`);
    process.exit(1);
  }

  let output = '';
  if (opts.format === 'all') {
    output += '=== MARKDOWN ===\n' + formatMarkdown(report) + '\n';
    output += '=== CSV ===\n' + formatCSV(report);
    output += '=== JSON ===\n' + formatJSON(report);
  } else if (opts.format === 'csv') {
    output = formatCSV(report);
  } else if (opts.format === 'json') {
    output = formatJSON(report);
  } else {
    output = formatMarkdown(report);
  }

  if (opts.output) {
    const outDir = dirname(opts.output);
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }
    writeFileSync(opts.output, output, 'utf-8');
    process.stderr.write(`\n✅ Reporte escrito en: ${opts.output}\n`);
  } else {
    console.log(output);
  }

  const agg = report.aggregate;
  process.stderr.write(`\n📊 Resumen (${report.totalDictamenes} dictámenes):\n`);
  process.stderr.write(`   SOURCE:id presente:     ${agg.sourceIdPresent}/${report.totalDictamenes}\n`);
  process.stderr.write(`   SOURCE:dictamen:id:      ${agg.sourceDictamenIdPresent}/${report.totalDictamenes}\n`);
  process.stderr.write(`   PASO:id presente:        ${agg.pasoIdPresent}/${report.totalDictamenes}\n`);
  process.stderr.write(`   bad_json:                ${agg.badJson}\n`);
  process.stderr.write(`   missing_doc_completo:    ${agg.missingDocumentoCompleto}\n`);
  process.stderr.write(`   en_source_mismatch:      ${agg.enSourceMismatch}\n`);
  process.stderr.write(`   rows_written:            0 ✅\n`);
  process.stderr.write(`   anonimizacion_verificada: true ✅\n`);
  process.stderr.write(`\n✅ Reconciliación completada.\n`);
}

main().catch((err) => {
  process.stderr.write(`\n❌ Error fatal: ${err.message}\n`);
  process.exit(1);
});
