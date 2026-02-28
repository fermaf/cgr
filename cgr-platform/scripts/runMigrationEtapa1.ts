import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.cwd();
const configPath = join(cwd, 'wrangler.jsonc');
const rawConfig = readFileSync(configPath, 'utf8');
const config = JSON.parse(rawConfig);
const db = config?.d1_databases?.[0]?.database_name;

if (!db) {
  throw new Error('No se encontro database_name en wrangler.jsonc');
}

const args = process.argv.slice(2);
const remoteOnly = args.includes('--remote');
if (!remoteOnly) {
  throw new Error('Este script solo puede ejecutarse con --remote');
}

function run(command: string): string {
  return execSync(command, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function parseJson(stdout: string): any {
  const idx = stdout.indexOf('[');
  if (idx === -1) {
    throw new Error(`Salida inesperada de wrangler: ${stdout}`);
  }
  return JSON.parse(stdout.slice(idx));
}

function d1Execute(command: string): any {
  const stdout = run(`wrangler d1 execute ${db} --remote --command "${command.replace(/"/g, '\\"')}"`);
  return parseJson(stdout);
}

function d1ExecuteFile(filePath: string): any {
  const stdout = run(`wrangler d1 execute ${db} --remote --file ${filePath}`);
  return parseJson(stdout);
}

const expectedColumns: Record<string, { type: string; notnull?: boolean; default?: string | null }> = {
  ts: { type: 'TEXT', notnull: true },
  env: { type: 'TEXT', notnull: true },
  service: { type: 'TEXT', notnull: true },
  workflow: { type: 'TEXT', notnull: true },
  kind: { type: 'TEXT', notnull: true },
  system: { type: 'TEXT', notnull: true },
  code: { type: 'TEXT', notnull: true },
  message: { type: 'TEXT', notnull: true },
  fingerprint: { type: 'TEXT', notnull: true },
  decision_skill: { type: 'TEXT' },
  matched: { type: 'INTEGER', notnull: true, default: '0' },
  reason: { type: 'TEXT' },
  incident_json: { type: 'TEXT', notnull: true },
  decision_json: { type: 'TEXT', notnull: true },
  created_at: { type: 'TEXT', notnull: true, default: "datetime('now')" }
};

const tableInfo = d1Execute("SELECT name FROM sqlite_master WHERE type='table' AND name='skill_events';");
const hasTable = Array.isArray(tableInfo?.[0]?.results) && tableInfo[0].results.length > 0;

if (!hasTable) {
  console.log('skill_events no existe. Aplicando migracion 0001_create_skill_events.sql');
  d1ExecuteFile('migrations/0001_create_skill_events.sql');
} else {
  const pragma = d1Execute('PRAGMA table_info(skill_events);');
  const rows = pragma?.[0]?.results ?? [];
  const existing = new Set(rows.map((row: any) => row.name));

  for (const [name, def] of Object.entries(expectedColumns)) {
    if (existing.has(name)) continue;
    let ddl = `ALTER TABLE skill_events ADD COLUMN ${name} ${def.type}`;
    if (def.notnull) {
      const fallbackDefault = def.default ?? "''";
      ddl += ` NOT NULL DEFAULT ${fallbackDefault}`;
    }
    d1Execute(ddl);
    console.log(`Columna agregada: ${name}`);
  }

  d1Execute('CREATE INDEX IF NOT EXISTS idx_skill_events_fingerprint ON skill_events(fingerprint);');
  d1Execute('CREATE INDEX IF NOT EXISTS idx_skill_events_code ON skill_events(code);');
  d1Execute('CREATE INDEX IF NOT EXISTS idx_skill_events_service_workflow ON skill_events(service, workflow);');
  d1Execute('CREATE INDEX IF NOT EXISTS idx_skill_events_created_at ON skill_events(created_at);');
}

console.log('Migracion Etapa 1 remota completada.');
