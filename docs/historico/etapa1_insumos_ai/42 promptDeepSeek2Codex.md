**¡Excelente, colega!** Hemos recibido múltiples auditorías y tenemos un `prompt_codex` muy detallado. Ahora toca sintetizar todo en una **única instrucción final** para el agente CLI, que debe ejecutarse en el entorno real (`/cgr`). Este prompt incorpora las correcciones críticas (seguridad, durabilidad, normalización) y respeta al máximo el código existente, haciendo sólo los cambios necesarios para cerrar la Etapa 1 de forma sólida y verificable.

El objetivo es que el agente pueda copiar y pegar este bloque en su terminal (como instrucción) y proceder paso a paso. El formato es texto plano, con bloques de código y comandos exactos.

---

## 🚀 Prompt final para el agente CLI (cgr-platform – Etapa 1)

### Objetivo
Cerrar la **Etapa 1** del sistema Skillgen:  
- **Normalización** confiable de incidentes (especialmente DNS y errores internos).  
- **Router determinista** basado exclusivamente en `incident.code`.  
- **Persistencia verificable** en D1 (`skill_events`) usando **Queue** para desacoplar la escritura.  
- **Pruebas reproducibles** en local: (1) error real por DNS inválido, (2) error sintético controlado por `SKILL_TEST_ERROR`.  
- **Sin magia evolutiva**: sólo normalizar → rutear → registrar.

**Importante:**  
- No usar `--persist-to`. Todo debe funcionar con el almacenamiento local por defecto de `wrangler`.  
- Minimizar cambios. Si hay código histórico no usado, **marcarlo claramente** con comentarios `// HISTÓRICO – NO USADO EN ETAPA 1`, pero no eliminarlo.  
- Todas las modificaciones deben seguir las mejores prácticas de Cloudflare Workers: TypeScript, ES modules, importaciones completas, bindings en `wrangler.jsonc`.

---

### 📋 Paso 0 – Levantamiento inicial (ejecuta esto primero)
Antes de modificar nada, identifica el estado actual:

```bash
cd /cgr

# 1. Busca referencias al router
grep -r "routeIncident" --include="*.ts" src/
grep -r "evaluateSkillRouter" --include="*.ts" src/
grep -r "skillRouter" --include="*.ts" src/

# 2. Determina si src/lib/skillRouter.ts está en uso real
#    (si aparece en algún import y se llama, habrá que desactivarlo)

# 3. Busca dónde se llama a recordSkillEvent
grep -r "recordSkillEvent" --include="*.ts" src/

# 4. Examina el flujo actual de captura de errores (busca try/catch en ingest y workflows)
grep -r "catch" --include="*.ts" src/workflows/
grep -r "catch" --include="*.ts" src/lib/ingest.ts
```

Anota los hallazgos. En base a ellos, aplica los cambios siguientes.

---

### 🔧 Paso 1 – Unificar router determinista (por `incident.code`)

**Archivo:** `src/lib/incidentRouter.ts`

- Asegúrate de que `routeIncident` recibe un `Incident` y devuelve `RouteDecision`.
- La decisión debe basarse **sólo en `incident.code`** (nunca en strings crudos del mensaje).
- Agrega las reglas para los nuevos códigos que vas a generar:

```typescript
// src/lib/incidentRouter.ts (fragmento)
export function routeIncident(incident: Incident): RouteDecision {
  switch (incident.code) {
    case 'D1_NO_SUCH_TABLE':
      return { matched: true, skill: 'd1_schema_repair', reason: 'Tabla faltante en D1' };
    case 'D1_NO_SUCH_COLUMN':
      return { matched: true, skill: 'd1_column_migration', reason: 'Columna faltante' };
    case 'NETWORK_DNS_LOOKUP_FAILED':
      return { matched: true, skill: 'cgr_network_baseurl_verify', reason: 'Fallo de resolución DNS' };
    case 'WORKER_INTERNAL_ERROR_REFERENCE':
      return { matched: true, skill: 'worker_internal_error_triage', reason: 'Error interno con referencia' };
    case 'WORKFLOW_TEST_ERROR':
      return { matched: true, skill: 'skill_test_handler', reason: 'Error sintético de prueba' };
    default:
      return { matched: false, skill: null, reason: 'Código no reconocido' };
  }
}
```

- Si `src/lib/skillRouter.ts` estaba en uso, **desactívalo**:
  - Comenta su exportación o, mejor, modifica el código que lo llama para que use `incidentRouter` en su lugar.
  - Agrega un comentario al inicio del archivo: `// HISTÓRICO – NO USADO EN ETAPA 1`.

---

### 🔧 Paso 2 – Mejorar normalización de incidentes (y sanitizar contexto)

**Archivo:** `src/lib/incident.ts`

1. **Define los nuevos códigos** en el tipo `IncidentCode` (si existe) o en constantes.
2. **Implementa `sanitizeContext`** para eliminar PII (contraseñas, tokens, RUT, etc.) antes de guardar.
3. **Mejora `normalizeIncident`** para detectar:
   - **DNS lookup failed**: si el mensaje contiene "DNS lookup failed" o "fetch failed" con indicios de host, extrae el host y asigna `code: 'NETWORK_DNS_LOOKUP_FAILED'`.
   - **Internal error with reference**: si el mensaje contiene "internal error; reference =", extrae la referencia y asigna `code: 'WORKER_INTERNAL_ERROR_REFERENCE'`.
   - **Mantén** los detectores existentes para D1.
   - **Siempre** llama a `sanitizeContext` sobre el objeto `context`.

Ejemplo de implementación:

```typescript
// src/lib/incident.ts
const SENSITIVE_KEYS = ['token', 'password', 'secret', 'api_key', 'authorization', 'rut', 'dni'];

export function sanitizeContext(context: Record<string, any>): Record<string, any> {
  // ... recursivo, reemplaza valores sensibles por '[REDACTED]'
}

export function normalizeIncident(error: unknown, service: string, env: string): Incident {
  const err = error instanceof Error ? error : new Error(String(error));
  let code = 'UNKNOWN';
  let kind = 'runtime_error';
  let system = 'worker';
  let context: Record<string, any> = {};

  const msg = err.message.toLowerCase();

  // Detección DNS
  if (msg.includes('dns lookup failed') || (msg.includes('fetch failed') && msg.includes('dns'))) {
    code = 'NETWORK_DNS_LOOKUP_FAILED';
    kind = 'network';
    system = 'http';
    // intentar extraer host del error (puede estar en err.cause o en el mensaje)
    const hostMatch = err.message.match(/host[:\s]*([^\s]+)/i);
    if (hostMatch) context.host = hostMatch[1];
  }
  // Detección error interno con referencia
  else if (msg.includes('internal error') && msg.includes('reference')) {
    code = 'WORKER_INTERNAL_ERROR_REFERENCE';
    kind = 'workflow';
    system = 'workflows';
    const refMatch = err.message.match(/reference[:\s]*([^\s]+)/i);
    if (refMatch) context.reference = refMatch[1];
  }
  // ... otros detectores

  return {
    ts: new Date().toISOString(),
    env: env as any,
    service,
    kind,
    system,
    code,
    message: err.message,
    context: sanitizeContext(context),
    fingerprint: generateFingerprint(err, code), // opcional pero recomendado
  };
}
```

---

### 🔧 Paso 3 – Persistencia durable con Queue (en lugar de escritura directa a D1)

**Archivo:** `src/storage/skillEvents.ts`

- Cambia `recordSkillEvent` para que **envíe el evento a una Queue** en lugar de insertar directamente en D1.
- Crea un **consumer** (puede estar en el mismo Worker o en otro archivo) que lea de la cola y haga `batch` inserts en D1.

**Ejemplo:**

```typescript
// src/storage/skillEvents.ts
import { Incident } from '../lib/incident';
import { RouteDecision } from '../lib/incidentRouter';

export interface SkillEventRecord {
  incident: Incident;
  decision: RouteDecision;
  fingerprint?: string;
}

export async function recordSkillEvent(
  queue: Queue,
  event: SkillEventRecord
): Promise<void> {
  await queue.send(event, { contentType: 'json' });
}

// Consumer (puede estar en el mismo archivo o en src/index.ts)
export async function consumeSkillEvents(batch: MessageBatch<SkillEventRecord>, env: Env) {
  const stmt = env.DB.prepare(`
    INSERT INTO skill_events 
      (ts, env, service, workflow, kind, system, code, message, fingerprint, decision_skill, matched, reason, incident_json, decision_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const queries = batch.messages.map(msg => {
    const { incident, decision, fingerprint } = msg.body;
    return stmt.bind(
      incident.ts,
      incident.env,
      incident.service,
      incident.workflow || null,
      incident.kind,
      incident.system,
      incident.code,
      incident.message,
      fingerprint || null,
      decision.skill,
      decision.matched ? 1 : 0,
      decision.reason,
      JSON.stringify(incident),
      JSON.stringify(decision)
    );
  });

  await env.DB.batch(queries);
}
```

**En `src/index.ts`** (o donde definas el export del Worker), añade el handler de la cola:

```typescript
export default {
  async fetch(request, env, ctx) { ... },
  async queue(batch, env, ctx) {
    if (batch.queue === 'skill-events-queue') {
      await consumeSkillEvents(batch, env);
    }
  },
} satisfies ExportedHandler<Env>;
```

---

### 🔧 Paso 4 – Ajustar el manejo de `SKILL_TEST_ERROR` en `ingestWorkflow.ts`

**Archivo:** `src/workflows/ingestWorkflow.ts`

- Busca el lugar donde se evalúa `env.SKILL_TEST_ERROR`.
- Cambia la lógica para que, si `SKILL_TEST_ERROR === '1'`, **lance un error explícito** con mensaje `'SKILL_TEST_ERROR_FORCED'` (para que `normalizeIncident` lo clasifique como `WORKFLOW_TEST_ERROR`).
- **No debe** simular errores de D1 (como "no such column"), porque eso ensucia las pruebas.

```typescript
// Dentro del paso del workflow o donde corresponda
if (env.SKILL_TEST_ERROR === '1') {
  throw new Error('SKILL_TEST_ERROR_FORCED');
}
```

- Asegúrate de que todo `try/catch` en el workflow llame a `normalizeIncident` y luego a `recordSkillEvent` (con la queue). Ejemplo:

```typescript
try {
  // ... lógica de ingesta
} catch (error) {
  const incident = normalizeIncident(error, 'ingest', env.ENVIRONMENT);
  const decision = routeIncident(incident);
  // Envía a la cola (no await para no bloquear)
  ctx.waitUntil(recordSkillEvent(env.EVENTS_QUEUE, { incident, decision }));
  // Re-lanza si quieres que el workflow falle, o manéjalo según diseño
  throw error;
}
```

---

### 🔧 Paso 5 – Actualizar `wrangler.jsonc` y migraciones

**Archivo:** `wrangler.jsonc`

- Agrega el binding de la Queue (`EVENTS_QUEUE`) y de Analytics Engine si lo deseas.
- Ajusta las variables de entorno: elimina `MISTRAL_API_URL` si no se usa, añade `ENVIRONMENT` y `SKILL_TEST_ERROR` (solo para desarrollo, no en producción).
- Asegúrate de que los secrets (`CGR_API_KEY`, `ENCRYPTION_KEY`) están definidos.

```jsonc
{
  "name": "skillgen-cgr",
  "main": "src/index.ts",
  "compatibility_date": "2025-03-07",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true, "head_sampling_rate": 1 },
  "vars": {
    "ENVIRONMENT": "dev",
    "LOG_LEVEL": "info",
    "APP_TIMEZONE": "America/Santiago",
    "CGR_BASE_URL": "https://api.cgr.cl",
    "CGR_RATE_LIMIT": "60",
    "SKILL_TEST_ERROR": "0"   // solo para pruebas locales, en prod no se define
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "skillgen",
      "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "DICTAMENES_SOURCE",
      "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    }
  ],
  "queues": {
    "producers": [
      {
        "queue": "skill-events-queue",
        "binding": "EVENTS_QUEUE"
      }
    ],
    "consumers": [
      {
        "queue": "skill-events-queue",
        "dead_letter_queue": "skill-events-dlq"
      }
    ]
  },
  "analytics_engine_datasets": [
    {
      "binding": "SKILL_METRICS",
      "dataset": "skill_metrics"
    }
  ],
  "workflows": [
    {
      "name": "ingest-workflow",
      "binding": "INGEST_WORKFLOW",
      "class_name": "IngestWorkflow"
    }
  ]
}
```

**Migraciones:**  
- Crea `migrations/0002_add_indexes.sql` para añadir índices a `skill_events` si no existen:
```sql
CREATE INDEX IF NOT EXISTS idx_skill_events_code ON skill_events(code);
CREATE INDEX IF NOT EXISTS idx_skill_events_fingerprint ON skill_events(fingerprint);
CREATE INDEX IF NOT EXISTS idx_skill_events_ts ON skill_events(ts);
```
- Aplica la migración localmente:
```bash
npx wrangler d1 migrations apply skillgen --local
```

---

### 🧪 Paso 6 – Pruebas end-to-end (ejecutar y verificar)

#### A) Prueba de error real (DNS inválido)

1. Temporalmente cambia `CGR_BASE_URL` en `wrangler.jsonc` a `https://invalid.invalid` (o un dominio que no exista).
2. En una terminal, inicia el worker en modo desarrollo:
   ```bash
   npm run dev
   ```
3. En otra terminal, dispara la ingesta:
   ```bash
   curl -X POST http://localhost:8787/ingest/trigger -H "Content-Type: application/json" -d '{"limit":1}'
   ```
4. El worker fallará al hacer fetch. Verifica en los logs que se llama a `recordSkillEvent`.
5. Consulta la base local:
   ```bash
   npx wrangler d1 execute skillgen --local --command "SELECT code, decision_skill, matched FROM skill_events ORDER BY id DESC LIMIT 5;"
   ```
   Debe aparecer una fila con `code = 'NETWORK_DNS_LOOKUP_FAILED'` y `decision_skill = 'cgr_network_baseurl_verify'`, `matched = 1`.
6. **No olvides revertir** `CGR_BASE_URL` a su valor original.

#### B) Prueba de error sintético (SKILL_TEST_ERROR)

1. Asegúrate de que `CGR_BASE_URL` apunta a la URL correcta.
2. En `wrangler.jsonc`, establece `"SKILL_TEST_ERROR": "1"` (o pásalo como variable de entorno al ejecutar `wrangler dev`).
3. Reinicia el worker (`npm run dev`).
4. Dispara la ingesta:
   ```bash
   curl -X POST http://localhost:8787/ingest/trigger -H "Content-Type: application/json" -d '{"limit":1}'
   ```
5. Verifica en D1:
   ```bash
   npx wrangler d1 execute skillgen --local --command "SELECT code, decision_skill, matched FROM skill_events ORDER BY id DESC LIMIT 5;"
   ```
   Debe aparecer una fila con `code = 'WORKFLOW_TEST_ERROR'` y `matched = 1` (skill 'skill_test_handler').
6. Vuelve a poner `SKILL_TEST_ERROR: "0"` en `wrangler.jsonc`.

---

### 📦 Entregables finales

Al terminar, debes proporcionar:

1. **Diff final** con todos los cambios realizados (puedes generarlo con `git diff` o similar).
2. **Comandos exactos** que usaste para las pruebas (los mismos de arriba).
3. **Snippets de logs y queries** que demuestren:
   - `COUNT(*) > 0` en ambas pruebas.
   - Las últimas filas con los códigos y skills correctos.
4. **Conclusión** breve: "Etapa 1 cerrada: normalización → ruteo → persistencia funcionan. Queda para Etapa 2: implementar skills reales y playbooks."

---

### ⚠️ Notas importantes

- Si encuentras código histórico (`skillRouter.ts` u otros) que no se usa, **no lo borres**. Añade un comentario al inicio:  
  `// HISTÓRICO – NO USADO EN ETAPA 1. Mantener para referencia futura.`
- Asegúrate de que todos los imports necesarios están presentes (`import { Queue, MessageBatch } from '@cloudflare/workers-types'`, etc.).
- No olvides añadir el tipo `Env` con todos los bindings.

---

¡Manos a la obra! Con estos pasos, Skillgen quedará sólido, preparado para la siguiente fase y con una base que la comunidad Cloudflare admirará. Cualquier duda, el humano (fermaf) y los arquitectos estamos aquí. ¡Éxito!