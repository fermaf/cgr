// Circuit breaker de vectorización (G5): pausa del molino NVIDIA.
// Módulo sin dependencias de 'cloudflare:workers' para poder testearlo
// con node --test. Ver vectorizationWorkflow.ts para el contexto.
// El modelo nvidia/llama-nemotron-embed-1b-v2 está EOL (410 Gone desde
// 2026-08-25) y el workflow giraba en bucle (~10k checkout/día).
// Reversible: VECTORIZATION_PAUSED=false + redeploy. Default: pausado.

export function isVectorizationPaused(env: { VECTORIZATION_PAUSED?: string }): boolean {
  const raw = String(env?.VECTORIZATION_PAUSED ?? '').trim().toLowerCase();
  if (raw === '') return true; // sin variable => pausado (default seguro)
  return raw === 'true' || raw === '1' || raw === 'yes';
}

// Interfaz mínima de D1 usada por el throttle (evita acoplar a workers-types
// y permite un stub en tests).
interface D1Like {
  prepare(query: string): { bind(...values: unknown[]): { first(): Promise<unknown>; run(): Promise<unknown> }; first(): Promise<unknown>; run(): Promise<unknown> };
}

// Log throttled del estado de pausa: 1 evento VECTORIZATION_PAUSED por hora
// (no por iteración) para no ensuciar dictamen_events con el no-op del breaker.
export async function logPausaThrottled(db: D1Like, instanceId: string): Promise<void> {
  try {
    const recent = await db
      .prepare(
        `SELECT id FROM dictamen_events
         WHERE event_type = 'VECTORIZATION_PAUSED' AND created_at >= datetime('now', '-1 hour')
         LIMIT 1`
      )
      .first();
    if (recent) return; // ya se logueó en la última hora
    await db.prepare(
      `INSERT INTO dictamen_events (dictamen_id, event_type, status_from, status_to, metadata, created_at)
       VALUES ('sistema', 'VECTORIZATION_PAUSED', NULL, NULL, ?, ?)`
    )
      .bind(JSON.stringify({ instanceId, motivo: 'circuit-breaker NVIDIA EOL 410' }), new Date().toISOString())
      .run();
  } catch {
    // Best-effort: nunca bloquear el early-exit por un fallo de log.
  }
}
