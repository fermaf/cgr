# 📜 El Código y la Ley: Manifiesto Skillgen

¡Saludos, colega arquitecto! 👋

Como alguien que vive entre la prosa de los fallos judiciales y la poesía del JavaScript asíncrono, debo decirte: **este proyecto tiene alma**. "Skillgen" no es solo un Worker; es el puente entre la burocracia ancestral y la velocidad de la luz en el Edge. Imagina un sistema que no solo guarda errores, sino que *aprende* de ellos como un escriba digital que evoluciona con cada dictamen.

Sin embargo, como Divulgador de Cloudflare y Arquitecto Senior, mi deber es proteger esta visión. La tecnología Legal Tech no perdona la ambigüedad. Un fallo en el código no es un `500 Internal Error`; es un precedente jurídico digital corrupto.

He analizado tu **Blueprint (36 Skillgen)** con la lupa de la seguridad, la escalabilidad y la narrativa viral. Antes de escribir el **Libro Blanco** que llevará este proyecto a las portadas de HackerNews, debemos saneamiento la base.

Aquí tienes la auditoría crítica, las correcciones técnicas y, finalmente, la visión de monetización.

---

## 🛡️ 1. Auditoría de Arquitectura: Las Grietas en el Mármol

He detectado 5 riesgos críticos que, si no se resuelven, impedirán la viralidad y pondrán en riesgo la integridad legal del sistema.

### 1.1. Riesgo de Privacidad (PII en Logs)
*   **Problema:** El contrato `Incident` permite un campo `context`. El blueprint dice "objeto simple sin secretos", pero no hay *enforcement* técnico. En Legal Tech, un número de caso o un nombre filtrado en un log de observabilidad es una violación de compliance.
*   **Impacto:** Alto. Violación de confidencialidad cliente-abogado.
*   **Solución:** Implementar una función de `sanitizeContext()` estricta antes de persistir en D1 o enviar a Logs.

### 1.2. Punto Único de Fallo en Persistencia (D1 Write)
*   **Problema:** `recordSkillEvent` escribe directamente en D1 dentro del catch. Si D1 tiene latencia alta o está en mantenimiento, el Worker falla y perdemos la evidencia del incidente.
*   **Impacto:** Medio-Alto. Pérdida de trazabilidad auditiva.
*   **Solución:** Patrón "Write-Ahead" a KV (más rápido) o Queue (más durable) antes de D1, o usar `ctx.waitUntil` para desacoplar la respuesta HTTP de la persistencia crítica.

### 1.3. Autenticación CGR Ambigua
*   **Problema:** `src/clients/cgr.ts` usa `env.CGR_BASE_URL`. No se menciona explícitamente el manejo de `API Keys` o `mTLS` para la ingesta.
*   **Impacto:** Crítico. Ingesta de datos falsificados o acceso no autorizado.
*   **Solución:** Exigir `CGR_API_TOKEN` en Secrets y rotación automática.

### 1.4. Router Determinista sin "Human-in-the-Loop"
*   **Problema:** `routeIncident` decide el skill. Si `matched: false`, el blueprint no define claramente el fallback. ¿Se descarta? ¿Se alerta?
*   **Impacto:** Medio. Incidentes críticos sin dueño.
*   **Solución:** Definir un skill `__UNMATCHED__` que dispare una alerta a un canal de seguridad (Slack/Email) para revisión humana.

### 1.5. Motor Evolutivo (Stage 3) y Supply Chain
*   **Problema:** "Propone PRs... reglas nuevas". Un motor externo que escribe código automáticamente es un vector de ataque de Supply Chain.
*   **Impacto:** Crítico. Ejecución de código malicioso en prod.
*   **Solución:** El motor externo solo debe proponer *configuración* (JSON de reglas), nunca código ejecutable. El código de los Skills debe ser inmutable en runtime y solo actualizable vía CI/CD aprobado.

---

## 🛠️ 2. Remediación Técnica: Parches de Seguridad y Estabilidad

A continuación, presento las correcciones esenciales siguiendo los estándares de Cloudflare Workers (ES Modules, TypeScript, Wrangler.jsonc).

### 2.1. Configuración Segura (`wrangler.jsonc`)

Aseguramos bindings, observabilidad y secrets.

```jsonc
// wrangler.jsonc
{
  "name": "skillgen-legal-core",
  "main": "src/index.ts",
  "compatibility_date": "2025-03-07",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1
  },
  "vars": {
    "LOG_LEVEL": "info",
    "APP_TIMEZONE": "UTC"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "skillgen-events",
      "database_id": "YOUR_D1_DATABASE_ID"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "DICTAMENES_SOURCE",
      "id": "YOUR_KV_NAMESPACE_ID"
    }
  ],
  "queues": {
    "producers": [
      {
        "queue": "skill-events-queue",
        "binding": "EVENTS_QUEUE"
      }
    ]
  },
  "workflows": [
    {
      "name": "ingest-workflow",
      "binding": "INGEST_WORKFLOW",
      "class_name": "IngestWorkflow"
    }
  ]
}
```

### 2.2. Sanitización de Incidentes (`src/lib/incident.ts`)

Implementamos la limpieza de PII antes de crear el objeto `Incident`.

```typescript
// src/lib/incident.ts

// Lista de campos sensibles que nunca deben persistir
const SENSITIVE_KEYS = ['token', 'password', 'secret', 'api_key', 'authorization', 'pii', 'dni', 'rut'];

export interface Incident {
  ts: string;
  env: 'local' | 'prod' | 'unknown';
  service: string;
  workflow?: string;
  kind: string;
  system: string;
  code: string;
  message: string;
  context: Record<string, any>;
  fingerprint?: string;
}

export function sanitizeContext(context: Record<string, any>): Record<string, any> {
  const safe: Record<string, any> = {};
  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();
    // Si la clave contiene palabras sensibles, la enmascaramos
    if (SENSITIVE_KEYS.some(k => lowerKey.includes(k))) {
      safe[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      safe[key] = sanitizeContext(value);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

export function normalizeIncident(error: unknown, service: string, env: string): Incident {
  const err = error instanceof Error ? error : new Error(String(error));
  
  return {
    ts: new Date().toISOString(),
    env: env as any,
    service,
    kind: 'runtime_error',
    system: 'worker',
    code: 'ERR_UNKNOWN', // Debería mapearse según el tipo de error
    message: err.message,
    context: sanitizeContext({ stack: err.stack }), // Sanitizamos el stack también
  };
}
```

### 2.3. Persistencia Duradera con Queue (`src/storage/skillEvents.ts`)

Cambiamos la escritura directa a D1 por una cola para garantizar que no se pierdan eventos bajo carga.

```typescript
// src/storage/skillEvents.ts
import { Incident } from '../lib/incident';
import { RouteDecision } from '../lib/incidentRouter';

export interface SkillEventRecord {
  incident: Incident;
  decision: RouteDecision;
  fingerprint: string;
}

export async function recordSkillEvent(
  queue: Queue, 
  event: SkillEventRecord
): Promise<void> {
  // Enviamos a la cola para procesamiento asíncrono durable
  // Esto asegura que el Worker no bloquee la respuesta por escritura en D1
  await queue.send(event, {
    contentType: "json",
    delaySeconds: 0
  });
}

// Consumer Worker (separado o en el mismo proyecto como consumer)
// Este consumer es el que realmente escribe en D1 en batch
export async function consumeSkillEvents(batch: MessageBatch<SkillEventRecord>, env: any) {
  const stmt = env.DB.prepare(`
    INSERT INTO skill_events (ts, env, service, code, message, decision_skill, matched, reason, incident_json, decision_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  
  const queries = batch.messages.map(msg => {
    const { incident, decision } = msg.body;
    return stmt.bind(
      incident.ts,
      incident.env,
      incident.service,
      incident.code,
      incident.message,
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

---

## 📚 3. Documentación Operativa para el Humano

Para que el equipo pueda levantar y operar el sistema sin fricción:

### 3.1. Levantamiento Local
1.  **Clonar e Instalar:** `npm install`.
2.  **Secretos:** `npx wrangler secret put CGR_API_TOKEN`.
3.  **Base de Datos:** `npx wrangler d1 execute skillgen-events --local --file=./migrations/0001_create_skill_events.sql`.
4.  **Ejecutar:** `npm run dev`.
5.  **Prueba de Fuego:** Simular un error inyectando `SKILL_TEST_ERROR=true` en las vars de entorno locales para verificar que el catch genera el incidente y lo encola.

### 3.2. Flujo de Auditoría
*   Todos los incidentes se guardan en `skill_events`.
*   Para auditar: Query SQL directa en D1 Dashboard o vía API interna protegida.
*   **Regla de Oro:** Nunca borrar rows de `skill_events`. Si hay error, se marca como `resolved: true` con un timestamp, pero el historial es inmutable (WORM compliance).

---

## 🚀 4. Libro Blanco & Blueprint de Monetización

*Una vez saneada la arquitectura, podemos escalar la visión. Aquí es donde la narrativa se encuentra con el negocio.*

### Título: **Skillgen: El Sistema Inmune del Legal Tech**

#### 1. La Visión (El "Por Qué")
El sistema legal genera datos, pero poca inteligencia operativa. Los errores de ingesta, las fallas de formato y las excepciones de runtime son señales de vida. **Skillgen** transforma el ruido operativo en inteligencia estructural. No es solo un logger; es un **organismo digital que evoluciona**.

#### 2. La Propuesta de Valor (El "Qué")
Ofrecemos una capa de **Observabilidad Jurídica Ejecutable**.
*   **Para Firmas Legales:** Garantía de que ningún dictamen se pierde en el limbo digital.
*   **Para Desarrolladores Legal Tech:** Un estándar abierto para manejar excepciones con contexto jurídico.
*   **Para Auditores:** Un ledger inmutable (D1) de cada decisión tomada por el sistema automatizado.

#### 3. Modelo de Monetización (El "Cómo")

| Nivel | Características | Precio Sugerido | Target |
| :--- | :--- | :--- | :--- |
| **Open Core** | Ingesta básica, Router simple, D1 local. | Gratis | Devs individuales, Open Source |
| **Professional** | Colas duraderas, Alertas Slack, Sanitización PII avanzada, 100k eventos/mes. | $49/mes | Firmas medianas, Startups Legal |
| **Enterprise** | Motor Evolutivo (Stage 3), SLA 99.99%, VPC Peering, Auditoría Forense, Eventos ilimitados. | Custom | Cortes, Gobierno, Big Law |
| **Marketplace** | Venta de "Skills" certificados (ej: Skill para validar formato JSON específico de un tribunal). | Revenue Share | Comunidad de Devs |

#### 4. Estrategia de Viralidad (Growth Hacking Tech)
1.  **El "Badge" de Transparencia:** Las firmas que usen Skillgen pueden mostrar un badge en sus APIs: *"Auditado por Skillgen - 0 Dictámenes Perdidos"*.
2.  **Reportes Públicos Anónimos:** Publicar métricas agregadas (sin PII) sobre "Los errores más comunes en Legal Tech". Esto genera contenido viral para LinkedIn/Twitter.
3.  **Hackathon "Justicia de Código":** Retar a la comunidad a crear el mejor "Skill de Remediación" para errores comunes. El ganador recibe implementación en el Core.

#### 5. Hoja de Ruta Evolutiva (Roadmap)
*   **Q1:** Consolidación de la Etapa 1 (Normalizar → Rutear → Persistir) con las correcciones de seguridad aplicadas.
*   **Q2:** Lanzamiento del Marketplace de Skills (Etapa 2). Los usuarios pueden suscribirse a packs de skills (ej: "Pack Tribunales Chile", "Pack GDPR").
*   **Q3:** Activación del Motor Evolutivo (Etapa 3) pero en modo "Sugerencia". El sistema dice: *"He visto este error 500 veces, sugiero esta regla"*. El humano aprueba con un click.
*   **Q4:** Integración con Workers AI para análisis semántico de los errores no estructurados.

---

### 🏁 Cierre del Arquitecto

Colega, tienes entre manos algo especial. **Skillgen** tiene el potencial de ser el estándar de facto para la resiliencia en Legal Tech sobre Cloudflare. Pero recuerda: en la ley, como en el código, **los detalles son el contrato**.

Con las correcciones de sanitización, la durabilidad de las Colas y la gobernanza del Motor Evolutivo, hemos transformado un script útil en una plataforma empresarial.

Ahora, ve y escribe el siguiente capítulo. El Edge te espera. ⚡️⚖️

*(Firmado: Tu Arquitecto Serverless & Narrador Digital)*