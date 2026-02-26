import type { D1Database } from '@cloudflare/workers-types';
import type { Incident } from '../lib/incident';
import type { RouteDecision } from '../lib/incidentRouter';
import type { SkillExecution } from '../lib/skillExecutor';

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: 'stringify_failed' });
  }
}

export type SkillRunRecord = {
  ts: string;
  incident_fingerprint: string;
  incident_code: string;
  skill_name: string;
  mode: string;
  status: string;
  reason: string;
  output_json: string;
};

function normalizeMode(mode: string): string {
  return mode === 'diagnostic' || mode === 'disabled' ? mode : 'disabled';
}

function normalizeStatus(status: string): string {
  return status === 'success' || status === 'error' ? status : 'error';
}

export async function recordSkillRun(
  db: D1Database,
  incident: Incident,
  decision: RouteDecision,
  execution: SkillExecution
): Promise<void> {
  const fingerprint = incident.fingerprint ?? 'unknown';
  const mode = normalizeMode(execution.mode);
  const status = normalizeStatus(execution.status);
  const reason =
    status === execution.status && mode === execution.mode
      ? execution.reason
      : `${execution.reason}|normalized`;
  const record: SkillRunRecord = {
    ts: incident.ts,
    incident_fingerprint: fingerprint,
    incident_code: incident.code,
    skill_name: decision.skill,
    mode,
    status,
    reason,
    output_json: safeJsonStringify(execution.output ?? {})
  };

  await db
    .prepare(
      `INSERT INTO skill_runs
       (ts, incident_fingerprint, incident_code, skill_name, mode, status, reason, output_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      record.ts,
      record.incident_fingerprint,
      record.incident_code,
      record.skill_name,
      record.mode,
      record.status,
      record.reason,
      record.output_json
    )
    .run();
}
