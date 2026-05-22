#!/usr/bin/env node
/**
 * Smoke harness read-only para comparar compatibilidad entre embeddings NVIDIA históricos
 * y llama-nemotron-embed-1b-v2 contra el namespace histórico Pinecone.
 *
 * Seguridad:
 * - No imprime secretos.
 * - No ejecuta upsert/delete/admin en Pinecone; solo /query.
 * - Genera como máximo 2 embeddings por corrida normal: modelo histórico y modelo nuevo.
 *
 * Uso sugerido:
 *   node --experimental-strip-types scripts/smoke-nvidia-nemotron-compat.ts
 *   QUERY="permiso administrativo confianza legítima" TOP_K=5 node --experimental-strip-types scripts/smoke-nvidia-nemotron-compat.ts
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type EmbeddingOutcome =
  | { ok: true; model: string; vector: number[]; status: number; ms: number }
  | { ok: false; model: string; status?: number; ms: number; error: string; retired410?: boolean };

type PineconeMatch = {
  id: string;
  score: number | null;
  metadata?: Record<string, unknown>;
};

type PineconeOutcome =
  | { ok: true; label: string; matches: PineconeMatch[]; ms: number }
  | { ok: false; label: string; status?: number; error: string; ms: number };

const ROOT = process.cwd();
const WRANGLER_PATH = resolve(ROOT, 'wrangler.jsonc');
const ENV_VARS_PATH = resolve(ROOT, '.env.vars');

function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    const hash = value.indexOf(' #');
    if (hash >= 0) value = value.slice(0, hash).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function stripJsonc(input: string): string {
  let out = '';
  let inString = false;
  let quote = '';
  let escaped = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        inString = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < input.length && input[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

function loadConfig(): Record<string, string> {
  const config: Record<string, string> = {};
  if (existsSync(WRANGLER_PATH)) {
    const wrangler = JSON.parse(stripJsonc(readFileSync(WRANGLER_PATH, 'utf8')));
    Object.assign(config, wrangler.vars || {});
  }
  if (existsSync(ENV_VARS_PATH)) {
    Object.assign(config, parseDotEnv(readFileSync(ENV_VARS_PATH, 'utf8')));
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && value.length > 0) config[key] = value;
  }
  return config;
}

function boolEnv(value: unknown, fallback: boolean): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'y', 'si', 'sí'].includes(v);
}

function safeErrorText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
    .replace(/pcsk_[A-Za-z0-9_\-]+/g, 'pcsk_[REDACTED]')
    .replace(/sk-[A-Za-z0-9_\-]+/g, 'sk-[REDACTED]')
    .slice(0, 800);
}

function norm(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function cosine(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length === 0) return null;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  const denom = norm(a) * norm(b);
  return denom === 0 ? null : dot / denom;
}

function fmtNumber(value: number | null | undefined, digits = 6): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

async function embed(config: Record<string, string>, model: string, query: string): Promise<EmbeddingOutcome> {
  const started = Date.now();
  const apiUrl = config.NVIDIA_EMBEDDING_API_URL || 'https://integrate.api.nvidia.com/v1/embeddings';
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.NVIDIA_API_KEY}`
      },
      body: JSON.stringify({
        input: [query],
        model,
        input_type: 'query',
        encoding_format: 'float',
        truncate: 'END',
        dimensions: Number.parseInt(config.NVIDIA_EMBEDDING_DIMENSIONS || '1024', 10) || 1024
      })
    });

    if (!response.ok) {
      const detail = safeErrorText(await response.text().catch(() => ''));
      return {
        ok: false,
        model,
        status: response.status,
        ms: Date.now() - started,
        retired410: response.status === 410,
        error: `HTTP ${response.status}${detail ? `: ${detail}` : ''}`
      };
    }

    const data = await response.json() as { data?: Array<{ embedding?: unknown }> };
    const raw = data.data?.[0]?.embedding;
    if (!Array.isArray(raw)) throw new Error('respuesta sin data[0].embedding[]');
    const vector = raw.map(Number);
    if (vector.some((x) => !Number.isFinite(x))) throw new Error('embedding con valores no finitos');
    return { ok: true, model, vector, status: response.status, ms: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      model,
      ms: Date.now() - started,
      error: safeErrorText(error instanceof Error ? error.message : String(error))
    };
  }
}

async function queryPinecone(
  config: Record<string, string>,
  label: string,
  vector: number[],
  topK: number
): Promise<PineconeOutcome> {
  const started = Date.now();
  try {
    const base = (config.PINECONE_INDEX_HOST || '').replace(/\/$/, '');
    const response = await fetch(`${base}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': config.PINECONE_API_KEY
      },
      body: JSON.stringify({
        namespace: config.PINECONE_NAMESPACE || 'mistralLarge2512',
        vector,
        topK,
        includeMetadata: true,
        includeValues: false
      })
    });

    if (!response.ok) {
      const detail = safeErrorText(await response.text().catch(() => ''));
      return { ok: false, label, status: response.status, error: `HTTP ${response.status}${detail ? `: ${detail}` : ''}`, ms: Date.now() - started };
    }

    const data = await response.json() as any;
    const hits = Array.isArray(data.matches) ? data.matches : Array.isArray(data.result?.hits) ? data.result.hits : [];
    const matches = hits.map((hit: any) => ({
      id: String(hit.id ?? hit._id ?? ''),
      score: typeof (hit.score ?? hit._score) === 'number' ? (hit.score ?? hit._score) : null,
      metadata: hit.metadata ?? hit.fields ?? {}
    })).filter((hit: PineconeMatch) => hit.id);
    return { ok: true, label, matches, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, label, ms: Date.now() - started, error: safeErrorText(error instanceof Error ? error.message : String(error)) };
  }
}

function compareMatches(oldMatches: PineconeMatch[], newMatches: PineconeMatch[]) {
  const oldRank = new Map(oldMatches.map((m, i) => [m.id, i + 1]));
  const newRank = new Map(newMatches.map((m, i) => [m.id, i + 1]));
  const overlap = oldMatches.filter((m) => newRank.has(m.id)).map((m) => m.id);
  return { oldRank, newRank, overlap };
}

async function compareBackend(query: string, limit: number, urlBase: string) {
  const started = Date.now();
  try {
    const url = new URL(urlBase);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(limit));
    const response = await fetch(url.toString(), { method: 'GET' });
    const text = await response.text();
    if (!response.ok) return { ok: false, status: response.status, ms: Date.now() - started, error: safeErrorText(text) };
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* noop */ }
    const ids: string[] = [];
    const collect = (value: any) => {
      if (!value || ids.length >= limit) return;
      if (Array.isArray(value)) return value.forEach(collect);
      if (typeof value === 'object') {
        const id = value.id ?? value.dictamen_id ?? value.numero ?? value.representative_dictamen_id ?? value.semantic_anchor_dictamen;
        if (id != null) ids.push(String(id));
        for (const key of ['results', 'items', 'dictamenes', 'lines', 'doctrine_lines']) collect(value[key]);
      }
    };
    collect(parsed);
    return { ok: true, status: response.status, ms: Date.now() - started, ids: Array.from(new Set(ids)).slice(0, limit) };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: safeErrorText(error instanceof Error ? error.message : String(error)) };
  }
}

async function main() {
  const config = loadConfig();
  const query = config.QUERY || 'confianza legítima permiso municipal invalidación acto administrativo';
  const topK = Number.parseInt(config.TOP_K || '10', 10) || 10;
  const oldModel = config.OLD_NVIDIA_EMBEDDING_MODEL || 'nvidia/llama-3.2-nv-embedqa-1b-v2';
  const newModel = config.NEW_NVIDIA_EMBEDDING_MODEL || config.NEMOTRON_EMBEDDING_MODEL || 'nvidia/llama-nemotron-embed-1b-v2';
  const backendUrl = config.BACKEND_SEARCH_URL || 'https://cgr-platform.abogado.workers.dev/api/v1/insights/doctrine-search';
  const runBackend = boolEnv(config.RUN_BACKEND_COMPARE, true);

  console.log('== Smoke compatibilidad NVIDIA histórico vs Nemotron nuevo ==');
  console.log(`Consulta: ${query}`);
  console.log(`TopK Pinecone: ${topK}`);
  console.log(`Modelo histórico: ${oldModel}`);
  console.log(`Modelo nuevo: ${newModel}`);
  console.log(`Pinecone host configurado: ${config.PINECONE_INDEX_HOST ? 'sí' : 'no'}`);
  console.log(`Pinecone namespace: ${config.PINECONE_NAMESPACE || 'mistralLarge2512'}`);
  console.log(`NVIDIA_API_KEY presente: ${config.NVIDIA_API_KEY ? 'sí' : 'no'}`);
  console.log(`PINECONE_API_KEY presente: ${config.PINECONE_API_KEY ? 'sí' : 'no'}`);

  if (!config.NVIDIA_API_KEY) {
    console.log('\nSin NVIDIA_API_KEY: no se generan embeddings. Script listo para ejecutar cuando exista credencial.');
    return;
  }

  console.log('\n-- Embeddings --');
  const [oldEmbedding, newEmbedding] = await Promise.all([embed(config, oldModel, query), embed(config, newModel, query)]);
  for (const result of [oldEmbedding, newEmbedding]) {
    if (result.ok === true) {
      console.log(`${result.model}: OK status=${result.status} dim=${result.vector.length} norma=${fmtNumber(norm(result.vector))} ms=${result.ms}`);
    } else {
      const retired = result.retired410 ? ' (API/modelo retirado 410)' : '';
      console.log(`${result.model}: ERROR${retired} status=${result.status ?? 'n/a'} ms=${result.ms} detalle=${result.error}`);
    }
  }

  if (oldEmbedding.ok === true && newEmbedding.ok === true) {
    console.log('\n-- Comparación vectorial --');
    console.log(`Dimensiones: viejo=${oldEmbedding.vector.length}, nuevo=${newEmbedding.vector.length}, iguales=${oldEmbedding.vector.length === newEmbedding.vector.length ? 'sí' : 'no'}`);
    console.log(`Normas: viejo=${fmtNumber(norm(oldEmbedding.vector))}, nuevo=${fmtNumber(norm(newEmbedding.vector))}`);
    console.log(`Cosine(viejo,nuevo): ${fmtNumber(cosine(oldEmbedding.vector, newEmbedding.vector))}`);
  }

  if (!config.PINECONE_API_KEY || !config.PINECONE_INDEX_HOST) {
    console.log('\nSin PINECONE_API_KEY o PINECONE_INDEX_HOST: se omite consulta Pinecone.');
  } else {
    const pineconeRuns: PineconeOutcome[] = [];
    if (oldEmbedding.ok === true) pineconeRuns.push(await queryPinecone(config, 'viejo', oldEmbedding.vector, topK));
    if (newEmbedding.ok === true) pineconeRuns.push(await queryPinecone(config, 'nuevo', newEmbedding.vector, topK));

    console.log('\n-- Pinecone histórico read-only --');
    for (const run of pineconeRuns) {
      if (run.ok === false) {
        console.log(`${run.label}: ERROR status=${run.status ?? 'n/a'} ms=${run.ms} detalle=${run.error}`);
        continue;
      }
      console.log(`${run.label}: OK matches=${run.matches.length} ms=${run.ms}`);
      run.matches.forEach((m, i) => {
        const title = typeof m.metadata?.titulo === 'string' ? ` | ${String(m.metadata.titulo).slice(0, 90)}` : '';
        console.log(`  ${i + 1}. ${m.id} score=${fmtNumber(m.score)}${title}`);
      });
    }

    const oldRun = pineconeRuns.find((r) => r.ok && r.label === 'viejo') as Extract<PineconeOutcome, { ok: true }> | undefined;
    const newRun = pineconeRuns.find((r) => r.ok && r.label === 'nuevo') as Extract<PineconeOutcome, { ok: true }> | undefined;
    if (oldRun && newRun) {
      const cmp = compareMatches(oldRun.matches, newRun.matches);
      console.log('\n-- Comparación top-k Pinecone --');
      console.log(`Overlap IDs: ${cmp.overlap.length}/${Math.max(oldRun.matches.length, newRun.matches.length)} (${cmp.overlap.join(', ') || 'sin coincidencias'})`);
      for (const id of cmp.overlap) {
        const oldM = oldRun.matches.find((m) => m.id === id)!;
        const newM = newRun.matches.find((m) => m.id === id)!;
        console.log(`  ${id}: rank viejo=${cmp.oldRank.get(id)} nuevo=${cmp.newRank.get(id)} | score viejo=${fmtNumber(oldM.score)} nuevo=${fmtNumber(newM.score)}`);
      }
    }
  }

  if (runBackend) {
    console.log('\n-- Endpoint público backend (opcional, GET) --');
    const backend = await compareBackend(query, topK, backendUrl);
    if (backend.ok) {
      console.log(`Backend OK status=${backend.status} ms=${backend.ms} ids_detectados=${backend.ids.length ? backend.ids.join(', ') : 'n/a'}`);
    } else {
      console.log(`Backend ERROR status=${backend.status ?? 'n/a'} ms=${backend.ms} detalle=${backend.error}`);
    }
  }

  console.log('\nFin smoke. No se ejecutaron upserts, deletes ni operaciones admin.');
}

main().catch((error) => {
  console.error(`Error fatal sanitizado: ${safeErrorText(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 1;
});
