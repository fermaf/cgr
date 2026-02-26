```markdown
# 🎯 PROMPT_CODEX v36.2 — CIERRE ETAPA 1 SKILLGEN (cgr-platform)

**Destinatario**: Agente CLI con acceso directo a `/cgr`  
**Objetivo único**: Cerrar ETAPA 1 del sistema Skillgen con código production-ready, priorizando MUST-DO de auditoría.  
**Salida esperada**: Solo código, configs y comandos. Sin narrativa. Listo para ejecutar.

---

## 🧭 CONTEXTO OPERATIVO (NO ASUMIR)

1. Tienes acceso **directo al filesystem** en `/cgr`. Inspecciona código real antes de actuar.
2. Este prompt **sobrescribe** instrucciones anteriores. Si hay conflicto, prioriza ESTE documento.
3. Fase 1 = **Normalizar → Rutear → Persistir**. Cero "magia evolutiva". Cero Stage 2/3.
4. El agente NO conoce el blueprint formal. Confía en este prompt + tu inspección de código.

---

## ⚡ PRIORIDADES ABSOLUTAS (MUST-DO — AUDITORÍA CONSENSUADA)

| # | MUST-DO | Justificación | Acción Concreta |
|---|---------|---------------|-----------------|
| 1 | **Sanitización PII en `context`** | Legal Tech: nombre/DNI en logs = violación compliance | Implementar `sanitizeContext()` en `src/lib/incident.ts` antes de persistir/loggear |
| 2 | **Persistencia durable (no D1 directo en catch)** | D1 write en catch = pérdida de evidencia bajo carga | Usar `ctx.waitUntil(recordSkillEvent(...))` o encolar a Queue si existe binding |
| 3 | **Auth CGR_API_TOKEN en secrets** | Ingesta sin auth = vector de ataque crítico | Validar presencia de `env.CGR_API_TOKEN`; usar en headers de fetch a CGR |
| 4 | **Fallback router: skill `__UNMATCHED__`** | Incidente sin dueño = riesgo operativo silencioso | En `routeIncident()`: si `!matched`, asignar `skill: "__UNMATCHED__"` + log/alerta |
| 5 | **Códigos de incidente estables** | `code: "UNKNOWN"` rompe analítica y ruteo | Ampliar `IncidentCode` con: `NETWORK_DNS_LOOKUP_FAILED`, `WORKER_INTERNAL_ERROR_REFERENCE`, `HTTP_429_RATE_LIMIT` |

> ❗ **NO priorizar** (Etapa 2+): encriptación payloads, motor evolutivo, marketplace de skills, Analytics Engine.

---

## 🔍 PASO 0 — INSPECCIÓN REAL (NO ASUMIR ESTADO)

Ejecuta en orden. Si algo no coincide, **detente y reporta**:

```bash
# 1. ¿Qué router está en runtime?
grep -r "routeIncident\|evaluateSkillRouter" /cgr/src --include="*.ts"

# 2. ¿skillRouter.ts se usa o es histórico?
grep -r "skillRouter" /cgr/src --include="*.ts" | grep -v "// histórico"

# 3. ¿Qué campos inserta recordSkillEvent en D1?
cat /cgr/src/storage/skillEvents.ts | grep -A 20 "INSERT INTO"

# 4. ¿Flujo catch -> normalize -> route -> record?
grep -B 5 -A 10 "normalizeIncident\|recordSkillEvent" /cgr/src/workflows/ingestWorkflow.ts
```

**Si hay discrepancias con este prompt**:  
→ Prioriza el código real.  
→ Documenta la desviación en comentario `// AUDIT-DEVIATION: [razón]`.  
→ Continúa con MUST-DO aplicables.

---

## 🛠️ PASO 1 — UNIFICAR ROUTER (Determinista por `incident.code`)

**Regla**: Un solo router activo en Etapa 1: `src/lib/incidentRouter.ts`.

```typescript
// SI skillRouter.ts existe y se usa:
// 1. Mover a /src/lib/_historico/skillRouter.ts
// 2. Agregar comentario: "// HISTÓRICO: no usado en Etapa 1. Router activo: incidentRouter.ts"

// EN src/lib/incidentRouter.ts:
export function routeIncident(incident: Incident): RouteDecision {
  // Reglas por code estable (NUNCA por message crudo)
  const rules: Record<string, { skill: string; reason: string }> = {
    "NETWORK_DNS_LOOKUP_FAILED": { 
      skill: "cgr_network_baseurl_verify", 
      reason: "Fallo DNS en CGR_BASE_URL" 
    },
    "WORKER_INTERNAL_ERROR_REFERENCE": { 
      skill: "worker_internal_error_triage", 
      reason: "Error interno con reference ID" 
    },
    "D1_NO_SUCH_TABLE": { 
      skill: "d1_schema_migration_check", 
      reason: "Tabla D1 no existe" 
    },
    "D1_NO_SUCH_COLUMN": { 
      skill: "d1_column_validation", 
      reason: "Columna D1 no existe" 
    },
    // Fallback obligatorio
    "__DEFAULT__": { 
      skill: "__UNMATCHED__", 
      reason: "Sin regla explícita para code" 
    }
  };

  const rule = rules[incident.code] || rules["__DEFAULT__"];
  return {
    matched: rule.skill !== "__UNMATCHED__",
    skill: rule.skill,
    reason: rule.reason
  };
}
```

---

## 🧹 PASO 2 — NORMALIZACIÓN ROBUSTA (src/lib/incident.ts)

```typescript
// 1. Ampliar IncidentCode (union type)
export type IncidentCode = 
  | "NETWORK_DNS_LOOKUP_FAILED"
  | "NETWORK_FETCH_FAILED"
  | "WORKER_INTERNAL_ERROR_REFERENCE"
  | "HTTP_429_RATE_LIMIT"
  | "HTTP_4XX_CLIENT_ERROR"
  | "HTTP_5XX_SERVER_ERROR"
  | "D1_NO_SUCH_TABLE"
  | "D1_NO_SUCH_COLUMN"
  | "WORKFLOW_TEST_ERROR"
  | "UNKNOWN";

// 2. Implementar sanitizeContext (MUST-DO #1)
const SENSITIVE_KEYS = ['token','password','secret','api_key','authorization','pii','dni','rut','email','phone'];
export function sanitizeContext(ctx: Record<string, any>): Record<string, any> {
  const safe: Record<string, any> = {};
  for (const [k, v] of Object.entries(ctx)) {
    const key = k.toLowerCase();
    if (SENSITIVE_KEYS.some(s => key.includes(s))) {
      safe[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      safe[k] = sanitizeContext(v);
    } else {
      safe[k] = v;
    }
  }
  return safe;
}

// 3. Mejorar normalizeIncident para detectar casos reales
export function normalizeIncident(error: unknown, service: string, env: Env): Incident {
  const err = error instanceof Error ? error : new Error(String(error));
  const msg = err.message.toLowerCase();
  
  // Detectar DNS lookup failed
  if (msg.includes('dns lookup failed') || msg.includes('failed: dns')) {
    return {
      ts: new Date().toISOString(),
      env: env.ENVIRONMENT || 'unknown',
      service,
      kind: 'network',
      system: 'http',
      code: 'NETWORK_DNS_LOOKUP_FAILED',
      message: err.message,
      context: sanitizeContext({ host: extractHostFromError(err) })
    };
  }
  
  // Detectar internal error con reference
  if (msg.includes('internal error') && msg.includes('reference')) {
    const ref = err.message.match(/reference[=:]\s*(\S+)/i)?.[1];
    return {
      ts: new Date().toISOString(),
      env: env.ENVIRONMENT || 'unknown',
      service,
      kind: 'workflow',
      system: 'workflows',
      code: 'WORKER_INTERNAL_ERROR_REFERENCE',
      message: err.message,
      context: sanitizeContext({ reference: ref })
    };
  }
  
  // Fallback (solo si no hay match)
  return {
    ts: new Date().toISOString(),
    env: env.ENVIRONMENT || 'unknown',
    service,
    kind: 'runtime',
    system: 'worker',
    code: 'UNKNOWN',
    message: err.message,
    context: sanitizeContext({ stack: err.stack })
  };
}

function extractHostFromError(err: Error): string | undefined {
  // Intentar extraer host de mensaje o stack
  const match = err.message.match(/https?:\/\/([^\/\s]+)/i);
  return match?.[1];
}
```

---

## 🔄 PASO 3 — SKILL_TEST_ERROR SIN COLATERALES (ingestWorkflow.ts)

```typescript
// EN src/workflows/ingestWorkflow.ts:
// Reemplazar lógica de SKILL_TEST_ERROR:

if (env.SKILL_TEST_ERROR === '1') {
  // Forzar error controlado, NO "no such column"
  throw new Error('SKILL_TEST_ERROR_FORCED: workflow_test_error');
}

// En normalizeIncident, agregar detector:
if (msg.includes('skill_test_error_forced')) {
  return {
    // ... campos base
    code: 'WORKFLOW_TEST_ERROR',
    kind: 'test',
    system: 'workflow',
    // ...
  };
}
```

---

## 💾 PASO 4 — PERSISTENCIA DURABLE (skillEvents.ts)

```typescript
// EN src/storage/skillEvents.ts:
export async function recordSkillEvent(
  incident: Incident, 
  decision: RouteDecision, 
  env: Env,
  ctx?: ExecutionContext // <-- NUEVO: para waitUntil
): Promise<void> {
  const fingerprint = await generateFingerprint(incident);
  
  const stmt = env.DB.prepare(`
    INSERT OR IGNORE INTO skill_events 
    (ts, env, service, workflow, kind, system, code, message, fingerprint, decision_skill, matched, reason, incident_json, decision_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  
  const query = stmt.bind(
    incident.ts, incident.env, incident.service, incident.workflow,
    incident.kind, incident.system, incident.code, incident.message,
    fingerprint, decision.skill, decision.matched ? 1 : 0, decision.reason,
    JSON.stringify(incident), JSON.stringify(decision)
  );
  
  // MUST-DO #2: No bloquear respuesta por escritura D1
  if (ctx) {
    ctx.waitUntil(query.run());
  } else {
    await query.run(); // fallback síncrono si no hay ctx
  }
}

// Helper para fingerprint (SHA-256 de campos clave)
async function generateFingerprint(inc: Incident): Promise<string> {
  const data = `${inc.ts}|${inc.service}|${inc.code}|${inc.message}`;
  const enc = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}
```

---

## 🧪 PASO 5 — PRUEBAS REPRODUCIBLES (comandos exactos)

```bash
# === PREPARACIÓN ===
cd /cgr
npm install  # si aplica
npx wrangler d1 migrations apply skillgen --local  # aplicar migración

# === PRUEBA A: Error real DNS (CGR_BASE_URL inválida) ===
# 1. Backup y modificar wrangler.jsonc
cp wrangler.jsonc wrangler.jsonc.bak
jq '.vars.CGR_BASE_URL = "https://invalid.invalid"' wrangler.jsonc.bak > wrangler.jsonc

# 2. Iniciar dev server
npx wrangler dev --env local

# 3. En otra terminal, disparar ingesta
curl -X POST http://localhost:8787/ingest/trigger \
  -H "Content-Type: application/json" \
  -d '{"limit": 1}'

# 4. Esperar ~10s, luego verificar D1
npx wrangler d1 execute skillgen --local --command "SELECT COUNT(*) as total, code, decision_skill FROM skill_events ORDER BY created_at DESC LIMIT 3;"

# 5. Esperado: COUNT >=1, code='NETWORK_DNS_LOOKUP_FAILED', decision_skill='cgr_network_baseurl_verify'

# 6. Restaurar CGR_BASE_URL
mv wrangler.jsonc.bak wrangler.jsonc

# === PRUEBA B: Error sintético controlado ===
# 1. Asegurar CGR_BASE_URL correcto en wrangler.jsonc
# 2. Iniciar con variable de test
SKILL_TEST_ERROR=1 npx wrangler dev --env local

# 3. Disparar ingesta
curl -X POST http://localhost:8787/ingest/trigger \
  -H "Content-Type: application/json" \
  -d '{"limit": 1}'

# 4. Verificar D1
npx wrangler d1 execute skillgen --local --command "SELECT code, decision_skill, matched FROM skill_events WHERE code='WORKFLOW_TEST_ERROR' ORDER BY created_at DESC LIMIT 1;"

# 5. Esperado: code='WORKFLOW_TEST_ERROR', matched=0 o 1 según regla, skill='__UNMATCHED__' o específica
```

---

## 📦 ENTREGABLES FINALES (formato estricto)

Al terminar, genera **SOLO** esto:

```diff
# 1. diff_final.patch (cambios netos, sin logs temporales)
diff -u /cgr/original /cgr/modified > diff_final.patch

# 2. comandos_verificacion.sh (script ejecutable)
#!/bin/bash
# [pegar comandos de prueba de arriba]

# 3. snapshot_d1.txt (output de queries de verificación)
# [pegar output real de SELECT COUNT(*)...]

# 4. CHECKLIST_ETAPA1.md
- [x] sanitizeContext() implementado
- [x] recordSkillEvent usa waitUntil o Queue
- [x] CGR_API_TOKEN validado en secrets
- [x] Router tiene fallback __UNMATCHED__
- [x] IncidentCode incluye DNS/Reference cases
- [x] Pruebas A y B reproducibles y documentadas
- [ ] [cualquier MUST-DO pendiente + razón]
```

---

## 🚫 PROHIBIDO EN ESTE PROMPT

- Agregar Stage 2/3 features (motor evolutivo, marketplace, IA).
- Modificar código fuera de `/cgr/src` sin justificación MUST-DO.
- Dejar `console.log` de debugging en código final.
- Hardcodear URLs, tokens o paths.
- Asumir estado del código sin inspeccionar primero.

---

## ✅ CRITERIO DE ÉXITO

Etapa 1 está **CERRADA** cuando:

1. Un error real de DNS en CGR_BASE_URL → genera fila en `skill_events` con `code='NETWORK_DNS_LOOKUP_FAILED'` y `decision_skill='cgr_network_baseurl_verify'`.
2. `SKILL_TEST_ERROR=1` → genera fila con `code='WORKFLOW_TEST_ERROR'` (NUNCA `D1_NO_SUCH_COLUMN`).
3. Ningún incidente con `code='UNKNOWN'` en pruebas controladas (si hay, es bug).
4. `sanitizeContext()` redacta campos sensibles en todos los logs/persistencia.
5. El router NUNCA devuelve `skill=null`; siempre hay fallback `__UNMATCHED__`.

**Si cumples 5/5**: Etapa 1 = ✅ CERRADA.  
**Si fallas en 1+**: Reporta cuál + por qué + propuesta de fix.

---

> 🧭 **Última instrucción**: Ejecuta PASO 0 (inspección). Si el código real difiere de este prompt, prioriza el código + MUST-DO. Entrega solo los 4 artefactos finales. Sin narrativa. Sin "próximos pasos". Solo cierre limpio de Etapa 1.

**¡A codificar!** ⚡
```