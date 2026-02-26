**¡Listo, Arquitecto Senior del Ecosistema Serverless de Cloudflare!**  
Aquí tienes el **prompt_codex mejorado y blindado** (versión 36.2-final).  

Cópialo y pégalo directamente en tu agente CLI dentro del directorio `/cgr`.  

```txt
Objetivo: Cerrar ETAPA 1 del sistema Skillgen en /cgr (Workers) de forma definitiva y reproducible.

- Telemetría estructurada (Incident) confiable + sanitización PII obligatoria
- Router determinista ÚNICO por incident.code (sin strings crudos)
- Persistencia confiable en D1 (skill_events) con ctx.waitUntil + fingerprint
- Ejecución básica de skill (stub que solo loguea) para cerrar el ciclo
- Pruebas 100% reproducibles en local sin --persist-to ni doble D1

CONSTRAINTS (MUST):
- Todo cambio debe ser mínimo. Si un archivo histórico (skillRouter.ts) no se llama en runtime, déjalo intacto pero marca con comentario claro “HISTÓRICO - NO USADO EN ETAPA 1”.
- Usa ENVIRONMENT=local|preview|prod para separar D1 local de prod (evita doble BD).
- Implementa sanitizeContext() OBLIGATORIO antes de cualquier persistencia o log.
- Persistencia: usa ctx.waitUntil para recordSkillEvent (no bloquea respuesta).
- NO introducir IA, motor evolutivo ni código nuevo de skills. Solo stub executeSkill.
- wrangler.jsonc debe incluir ENVIRONMENT var + observability head_sampling_rate=1.
- Directorio base: /cgr (no cgr-platform).

PASO 0 — DISCOVERY (obligatorio antes de tocar nada)
1. Ejecuta: find /cgr -name "*.ts" -exec grep -l "routeIncident\|skillRouter\|recordSkillEvent\|normalizeIncident" {} \;
2. Identifica exactamente:
   - Qué router se llama en runtime (incidentRouter.ts o skillRouter.ts).
   - Dónde se llama recordSkillEvent y si está dentro de catch o Workflow.
   - Si existe sanitizeContext o fingerprint.
3. Confirma bindings actuales en wrangler.jsonc (DB, DICTAMENES_SOURCE, etc.).
4. Guarda output en /cgr/audit-discovery.txt

PASO 1 — NORMALIZACIÓN + SANITIZACIÓN (MUST)
En /cgr/src/lib/incident.ts:
- Añadir función:
  const SENSITIVE_KEYS = ['token','secret','password','api_key','authorization','rut','dni','pii'];
  export function sanitizeContext(context: Record<string,any>): Record<string,any> { ... } (redactar keys sensibles recursivamente)
- Mejorar normalizeIncident(error, service, env):
  - Detectar DNS: si message incluye "DNS lookup failed" → code='NETWORK_DNS_LOOKUP_FAILED', kind='network', system='http'
  - Detectar internal error reference → code='WORKER_INTERNAL_ERROR_REFERENCE', kind='workflow', system='workflows'
  - Siempre: context = sanitizeContext(originalContext)
  - Calcular fingerprint = crypto.createHash('sha256').update(JSON.stringify({code,service,kind})).digest('hex')
  - Ampliar Incident interface con fingerprint?: string

PASO 2 — ROUTER DETERMINISTA (único)
En /cgr/src/lib/incidentRouter.ts:
- Confirmar que solo se usa routeIncident(incident)
- Si skillRouter.ts se llama en algún lado → comentarlo todo y agregar al inicio: // HISTÓRICO - NO USADO EN ETAPA 1
- Añadir reglas:
  NETWORK_DNS_LOOKUP_FAILED → skill: 'cgr_network_baseurl_verify'
  WORKER_INTERNAL_ERROR_REFERENCE → skill: 'worker_internal_error_triage'
  WORKFLOW_TEST_ERROR → skill: 'test_error_handler'
- Añadir fallback: skill: '__UNMATCHED__', reason: 'No rule matched'

PASO 3 — EJECUTOR BÁSICO DE SKILL (cierre de ciclo)
Crear o añadir en /cgr/src/lib/skillExecutor.ts (si no existe, mínimo en incidentRouter.ts):
export async function executeSkill(skill: string, incident: Incident, env: any) {
  console.log(`[SKILL EXEC] ${skill} triggered for code=${incident.code}`);
  // Stub - solo log. Etapa 2 añadirá lógica real.
}

En el flujo catch: después de route → await executeSkill(decision.skill, incident, env)

PASO 4 — PERSISTENCIA FIABLE + D1 LOCAL/PROD
En /cgr/src/storage/skillEvents.ts:
- recordSkillEvent(DB, incident, decision) → 
  const event = { ... , fingerprint: incident.fingerprint };
  ctx.waitUntil( DB.prepare(...).run(...) );  // no bloquea
- Añadir en wrangler.jsonc:
  "vars": { "ENVIRONMENT": "local" }
- En código: const isLocal = env.ENVIRONMENT === 'local'; usar binding correcto.

PASO 5 — SKILL_TEST_ERROR y pruebas
En /cgr/src/workflows/ingestWorkflow.ts:
- Si env.SKILL_TEST_ERROR === '1' → throw new Error('SKILL_TEST_ERROR_FORCED')
- Nunca forzar mensaje D1 column.

PASO 6 — PRUEBAS END-TO-END (deben pasar en local)
A) Prueba DNS real:
   - wrangler.jsonc: CGR_BASE_URL = "https://invalid.invalid"
   - wrangler dev
   - curl -X POST http://localhost:8787/ingest/trigger -H "X-API-Key: test" -d '{"pages":1}'
   - wrangler d1 execute skillgen --local --command="SELECT COUNT(*), code, decision_skill FROM skill_events ORDER BY created_at DESC LIMIT 3;"
   → Debe mostrar >=1 fila con NETWORK_DNS_LOOKUP_FAILED y skill=cgr_network_baseurl_verify

B) Prueba sintética:
   - Restaurar CGR_BASE_URL correcto
   - SKILL_TEST_ERROR=1 en .dev.vars
   - curl ...
   - Verificar fila con WORKFLOW_TEST_ERROR

C) Verificar sanitización: en contexto del error no debe aparecer ningún sensitive key.

PASO 7 — LIMPIEZA FINAL
- Eliminar logs temporales, console.log de debug.
- Actualizar README.md con comandos exactos.
- git diff > /cgr/etapa1-final.diff

ENTREGABLES OBLIGATORIOS AL FINAL (copia-pega en respuesta):
1. Contenido completo de /cgr/etapa1-final.diff
2. Comandos exactos ejecutados (paso a paso)
3. Snippets de salida D1 (COUNT > 0, últimas 3 filas con code + skill + fingerprint)
4. Conclusión clara: "ETAPA 1 CERRADA - Normalizar → Rutear → Ejecutar stub → Persistir seguro"

¡Ejecuta ahora! Cuando termines, la Etapa 1 quedará blindada, reproducible y lista para monetización.  
Estoy aquí para revisar el diff final.
```

Copia todo lo de arriba (desde “Objetivo:” hasta el final) y pégalo en tu CLI.  

¡Vamos a cerrar esta fase con estilo Cloudflare! ⚡