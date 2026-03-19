# 02 - Tu Primer Skill (Gobernanza de Incidentes)

Este tutorial te guiará sobre cómo integrar un nuevo módulo o Workflow con **Skillgen**, el motor experto de gobernanza de incidentes ("Caja Negra") de **CGR.ai**.

---

## 🚀 Concepto: ¿Qué es Skillgen?

En arquitecturas *serverless* y distribuidas, confiar en simples `console.log()` es inadecuado. **Skillgen** captura un error, sanitiza la información sensible, clasifica el fallo y lo enruta hacia una "Habilidad" (`Skill`) que puede diagnosticarlo o repararlo automáticamente.

---

## 🛠️ Paso 1: Definir el "Contrato de Error"

Imagina que creas un nuevo servicio que consulta un API de correos (`mailer.ts`) y falla por timeout. Antes de escribir lógica pesada de captura, define tu error en el tipado de la plataforma.

Abre `src/lib/incident.ts` y añade tu nuevo código al final del tipo `IncidentCode`:

```typescript
export type IncidentCode = 
  // ... incidentes existentes
  | 'MISTRAL_API_ERROR'
  | 'D1_SCHEMA_ERROR'
  | 'MAILER_TIMEOUT_ERROR'; // <- Tu nuevo incidente
```

---

## 📦 Paso 2: Invocar a Skillgen (El patrón persistIncident)

En el código de tu nuevo servicio, rodea la lógica inestable con un `try/catch` y delega la responsabilidad del error a la función `persistIncident` ubicada en `src/storage/incident_d1.ts`.

```typescript
import { persistIncident } from '../storage/incident_d1';

try {
  // Llama a la API externa
  const response = await fetch('https://api.correos.cl/enviar');
  if (!response.ok) throw new Error("Timeout en servidor de correos");
} catch (error) {
  await persistIncident(
    env,                // Contexto de Cloudflare (Bindings D1/KV)
    error,              // El error capturado
    'mailer-service',   // Nombre de tu módulo
    'IngestWorkflow',   // Workflow que lo orquesta
    instanceId,         // El ID de ejecución (opcional)
    { emailDestino: 'admin@cgr.cl' } // Extra: Variables de contexto seguras
  );
  // Re-lanza el error para que Workflow intente un reintento si así se configuró
  throw error; 
}
```

---

## 🔀 Paso 3: Configurar el Ruteo (Router)

Ahora debemos enseñarle a la plataforma **qué Skill debe activarse** o asociarse cuando vea un `MAILER_TIMEOUT_ERROR`.

Abre `src/lib/incidentRouter.ts` y añade la regla:

```typescript
const RULES: Record<IncidentCode, { skill: string; reason: string }> = {
  // ...
  MAILER_TIMEOUT_ERROR: {
    skill: 'check_mailer_health',  // Nombre sugerido para el script de recuperación
    reason: 'Timeout contactando servidor SMTP, verificar conectividad de red'
  }
};
```

---

## 🧬 Paso 4: Detección Automática (Opcional)

Si llamas a librerías externas que lanzan `Error("Network Timeout")` genéricos, Skillgen no sabrá mapearlos automáticamente a tu `IncidentCode`. Para ello, añade una regla lógica en la función `normalizeIncident`:

```typescript
// en src/lib/incident.ts
if (/Timeout en servidor de correos/i.test(normalizedMessage)) {
  return withFingerprint({
    ...baseIncident,
    kind: 'external_api',
    system: 'mailer',
    code: 'MAILER_TIMEOUT_ERROR',
    severity: 'MEDIUM',
    context: sanitizedContext
  });
}
```

---

## 📊 5. ¿Qué Lograste? (Resultado de Auditoría)

Al seguir este patrón, la próxima vez que tu servicio falle:
1. No perderás horas leyendo logs en consola.
2. Ingresarás a tu Base de Datos SQL (D1).
3. Lanzarás: `SELECT * FROM skill_events WHERE incident_code = 'MAILER_TIMEOUT_ERROR'`.
4. Obtendrás un registro exacto del día, la hora, el workflow asociado y la metadata (`emailDestino: admin...`) **sin exponer la clave secreta SMTP**, puesto que el normalizador integrado la eliminó del error.

¡Felicidades, tu servicio ahora posee Gobernanza Determinista Nivel 2!
