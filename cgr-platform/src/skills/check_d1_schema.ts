import type { Env } from '../types';
import type { Incident } from '../lib/incident';

export const diagnostic_only = true;

const SKILL_EVENTS_COLUMNS = [
  'ts',
  'env',
  'service',
  'workflow',
  'kind',
  'system',
  'code',
  'message',
  'fingerprint',
  'decision_skill',
  'matched',
  'reason',
  'incident_json',
  'decision_json',
  'created_at'
];

const SKILL_RUNS_COLUMNS = [
  'ts',
  'incident_fingerprint',
  'incident_code',
  'skill_name',
  'mode',
  'status',
  'reason',
  'output_json',
  'created_at'
];

export type CheckD1SchemaResult = {
  status: 'success' | 'error';
  metadata: {
    skill_events_ok: boolean;
    skill_runs_ok: boolean;
    missing_columns: string[];
  };
  error?: string;
};

export async function runCheckD1Schema(
  env: Env,
  _incident: Incident
): Promise<CheckD1SchemaResult> {
  try {
    const db = env.DB;
    if (!db) {
      return {
        status: 'error',
        metadata: {
          skill_events_ok: false,
          skill_runs_ok: false,
          missing_columns: ['DB_BINDING_MISSING']
        },
        error: 'DB binding missing'
      };
    }

    const skillEvents = await db.prepare('PRAGMA table_info(skill_events);').all<any>();
    const skillRuns = await db.prepare('PRAGMA table_info(skill_runs);').all<any>();

    const eventsCols = new Set((skillEvents.results ?? []).map((row: any) => row.name));
    const runsCols = new Set((skillRuns.results ?? []).map((row: any) => row.name));

    const missingEvents = SKILL_EVENTS_COLUMNS.filter((col) => !eventsCols.has(col));
    const missingRuns = SKILL_RUNS_COLUMNS.filter((col) => !runsCols.has(col));

    return {
      status: 'success',
      metadata: {
        skill_events_ok: missingEvents.length === 0,
        skill_runs_ok: missingRuns.length === 0,
        missing_columns: [...missingEvents, ...missingRuns]
      }
    };
  } catch (error) {
    return {
      status: 'error',
      metadata: {
        skill_events_ok: false,
        skill_runs_ok: false,
        missing_columns: ['PRAGMA_FAILED']
      },
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
