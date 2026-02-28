import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import type { Incident } from '../lib/incident';
import type { RouteDecision } from '../lib/incidentRouter';

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: 'stringify_failed' });
  }
}

function buildFingerprint(incident: Incident): string {
  const parts = [
    incident.code,
    incident.system,
    incident.service,
    incident.workflow ?? 'unknown',
    incident.table ?? '',
    incident.column ?? ''
  ];
  return parts.join('|');
}

function fallbackKey(incident: Incident, fingerprint: string): string {
  const ts = incident.ts.replace(/[:.]/g, '-');
  return `skill-events-fallback/${ts}/${fingerprint}-${crypto.randomUUID()}`;
}

export async function recordSkillEvent(
  db: D1Database,
  incident: Incident,
  decision: RouteDecision,
  fallbackKv?: KVNamespace
): Promise<void> {
  const fingerprint = incident.fingerprint ?? buildFingerprint(incident);
  const workflow = incident.workflow ?? 'unknown';
  const matched = decision.matched ? 1 : 0;
  const incidentJson = safeJsonStringify({ ...incident, fingerprint });
  const decisionJson = safeJsonStringify(decision);

  try {
    const duplicate = await db
      .prepare(
        `SELECT id
         FROM skill_events
         WHERE fingerprint = ?
           AND service = ?
           AND workflow = ?
           AND code = ?
           AND created_at >= datetime('now', '-2 minutes')
         ORDER BY id DESC
         LIMIT 1`
      )
      .bind(fingerprint, incident.service, workflow, incident.code)
      .first<{ id: number }>();

    if (duplicate?.id) {
      return;
    }

    await db
      .prepare(
        `INSERT INTO skill_events
         (ts, env, service, workflow, kind, system, code, message,
          fingerprint, decision_skill, matched, reason, incident_json, decision_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        incident.ts,
        incident.env,
        incident.service,
        workflow,
        incident.kind,
        incident.system,
        incident.code,
        incident.message,
        fingerprint,
        decision.skill,
        matched,
        decision.reason,
        incidentJson,
        decisionJson
      )
      .run();
  } catch (error) {
    if (!fallbackKv) {
      throw error;
    }

    const payload = safeJsonStringify({
      ts: incident.ts,
      fingerprint,
      incident,
      decision,
      insertError: error instanceof Error ? error.message : String(error)
    });

    await fallbackKv.put(fallbackKey(incident, fingerprint), payload);
  }
}
