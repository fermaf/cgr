#!/usr/bin/env node
/**
 * Smoke Suite Read-Only — Capa 1 Cloudflare
 * cgr-platform/scripts/smoke-readonly-local.mjs
 *
 * Ejecutable sin argumentos contra producción pública.
 * Read-only: solo GET/HEAD, ningún endpoint admin, ningún token.
 *
 * Uso:
 *   node scripts/smoke-readonly-local.mjs [BASE_URL]
 *
 * BASE_URL por defecto: https://cgr-platform.abogado.workers.dev
 */

const BASE = process.argv[2] || 'https://cgr-platform.abogado.workers.dev';
const TIMEOUT_MS = 10_000;
const TEST_IDS = ['D286N26', 'E189759N22'];
const SENSITIVE_KEYS = [
  'documento_completo', '_source', 'source', 'raw_data', 'raw.source',
  'raw._source', 'raw.documento_completo', 'autor', 'parte_denunciada',
  'parte_requirente', 'nombre_persona', 'rut', 'cedula'
];

async function safeFetch(url, init = {}, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') throw new Error('TIMEOUT >' + timeout + 'ms: ' + url);
    throw err;
  }
}

function assertNoSensitive(obj, label) {
  if (!obj || typeof obj !== 'object') return;
  const seen = new Set();
  const queue = [obj];
  while (queue.length) {
    const current = queue.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) { queue.push(...current); continue; }
    if (typeof current !== 'object') continue;
    for (const [k, v] of Object.entries(current)) {
      const key = k.toLowerCase();
      if (SENSITIVE_KEYS.some(sk => key.includes(sk))) {
        throw new Error('SENSITIVE_FIELD_DETECTED: clave "' + k + '" en ' + label);
      }
      if (v && typeof v === 'object' && seen.size < 5000) queue.push(v);
    }
  }
}

function report(name, pass, detail) {
  const icon = pass ? 'PASS' : 'FAIL';
  console.log('[' + icon + '] ' + name + (detail ? ' - ' + detail : ''));
  return pass;
}

async function t1_health() {
  const res = await safeFetch(BASE + '/');
  return report('T1 health root', res.status === 200, 'HTTP ' + res.status);
}

async function t2_stats() {
  const res = await safeFetch(BASE + '/api/v1/stats');
  if (res.status !== 200) return report('T2 stats', false, 'HTTP ' + res.status);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { return report('T2 stats', false, 'JSON invalido'); }
  const hasAgg = ['dictamenes_total', 'total', 'count', 'n'].some(function(k) { return k in (data || {}); });
  assertNoSensitive(data, 'stats');
  return report('T2 stats', hasAgg, hasAgg ? 'campos agregados OK' : 'sin campos de agregacion');
}

async function t3_search_no_leak() {
  const res = await safeFetch(BASE + '/api/v1/dictamenes?q=D286N26&limit=3');
  if (res.status !== 200) return report('T3 search', false, 'HTTP ' + res.status);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { return report('T3 search', false, 'JSON invalido'); }
  const results = Array.isArray(data) ? data : (data && data.results) || (data && data.items) || [];
  if (results.length === 0) return report('T3 search', false, 'sin resultados para D286N26');
  assertNoSensitive(results, 'search-results');
  return report('T3 search', true, 'results=' + results.length + ' sin fuga');
}

async function t4_detalle_fuente_local() {
  var id = TEST_IDS[0];
  var res = await safeFetch(BASE + '/api/v1/dictamenes/' + id);
  if (res.status !== 200) return report('T4 detalle', false, 'HTTP ' + res.status);
  var text = await res.text();
  var data;
  try { data = JSON.parse(text); } catch { return report('T4 detalle', false, 'JSON invalido'); }
  var hasMeta = !!(data && typeof data === 'object' && 'meta' in data);
  var hasDocCompleto = SENSITIVE_KEYS.some(function(sk) { return JSON.stringify(data).indexOf(sk) !== -1; });
  assertNoSensitive(data, 'dictamen-detalle');
  return report('T4 detalle', hasMeta && !hasDocCompleto,
    'meta=' + hasMeta + ' doc_completo=' + (hasDocCompleto ? 'EXPUESTO' : 'limpio'));
}

async function t5_fuente_faltante_graceful() {
  var res = await safeFetch(BASE + '/api/v1/dictamenes/D99999999');
  var isGraceful = res.status === 404 || res.status === 200;
  if (!isGraceful) return report('T5 fuente-faltante', false, 'HTTP ' + res.status + ' (esperado 404 o 200)');
  if (res.status === 200) {
    var text = await res.text();
    if (text.trim().charAt(0) === '{') {
      var data = JSON.parse(text);
      var hasRaw = !!(data && data.raw && Object.keys(data.raw).length > 0);
      if (hasRaw) return report('T5 fuente-faltante', false, 'HTTP 200 con raw no vacio para ID inexistente');
    }
  }
  return report('T5 fuente-faltante', true, 'HTTP ' + res.status + ' graceful');
}

async function t6_regimen() {
  var id = TEST_IDS[0];
  var res = await safeFetch(BASE + '/api/v1/public/dictamenes/' + id + '/regimen');
  if (res.status !== 200) return report('T6 regimen', false, 'HTTP ' + res.status);
  var text = await res.text();
  try { JSON.parse(text); } catch { return report('T6 regimen', false, 'JSON invalido'); }
  return report('T6 regimen', true, 'JSON valido');
}

async function t7_headers_limpios() {
  var id = TEST_IDS[0];
  var res = await safeFetch(BASE + '/api/v1/dictamenes/' + id, { method: 'HEAD' });
  var sensitive = [];
  var allowed = ['server', 'date', 'content-type', 'content-length', 'x-request-id', 'cf-ray'];
  var headers = res.headers.entries();
  for (var entry of headers) {
    var k = entry[0], v = entry[1];
    var kl = k.toLowerCase();
    if (allowed.some(function(a) { return kl.indexOf(a) !== -1; })) continue;
    if (/x-admin|x-token|authorization|cookie|secret|key|bearer|api[_-]?key|pcsk/i.test(kl)) {
      sensitive.push(k);
    }
  }
  var clean = sensitive.length === 0;
  return report('T7 headers-limpios', clean,
    clean ? 'ningun header sensible' : 'ERRORES: ' + sensitive.join(', '));
}

async function t8_pjo_publico() {
  var res = await safeFetch(BASE + '/api/v1/public/pjos?limit=1');
  if (res.status !== 200) return report('T8 pjo-publico', false, 'HTTP ' + res.status);
  var text = await res.text();
  var data;
  try { data = JSON.parse(text); } catch { return report('T8 pjo-publico', false, 'JSON invalido'); }
  var hasData = Array.isArray(data) ? true : !!(data && typeof data === 'object');
  return report('T8 pjo-publico', hasData, 'JSON valido');
}

async function main() {
  console.log('=== Smoke Suite Read-Only - Capa 1 Cloudflare ===');
  console.log('Base: ' + BASE);
  console.log('Fecha: ' + new Date().toISOString());
  console.log('Modo: READ-ONLY (GET/HEAD, sin auth, sin admin)\n');

  var tests = [t1_health, t2_stats, t3_search_no_leak, t4_detalle_fuente_local,
               t5_fuente_faltante_graceful, t6_regimen, t7_headers_limpios, t8_pjo_publico];

  var results = [];
  for (var i = 0; i < tests.length; i++) {
    try {
      results.push(await tests[i]());
    } catch (err) {
      var msg = err instanceof Error ? err.message.slice(0, 120) : String(err);
      console.log('[ERR] ' + tests[i].name + ' - ' + msg);
      results.push(false);
    }
  }

  var passed = results.filter(Boolean).length;
  var total = results.length;
  console.log('\n=== Resumen: ' + passed + '/' + total + ' PASS ===');

  if (passed < total) {
    console.log('Suite incompleta. Revisar errores antes de promotion.');
    process.exitCode = 1;
  } else {
    console.log('Suite PASS. Endpoints publicos operativos y limpios.');
  }

  console.log('\nComando de ejecucion repetible:');
  console.log('  node scripts/smoke-readonly-local.mjs ' + BASE);
}

main().catch(function(err) {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
