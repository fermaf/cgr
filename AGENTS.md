# AGENTS.md

Este repositorio usa **OpenCode** como plataforma agéntica principal.

---

## Lectura obligatoria

Antes de proponer cambios o tocar código:

1. `context/project_constitution.md`
2. `context/project_context.md`
3. `context/architecture_map.md`
4. `context/current_priorities.md`
5. `context/glossary.md`

---

## Reglas de trabajo

- Documentación y commits en español.
- Deploy cuando el cambio esté listo y validado.
- La búsqueda semántica manda; la doctrina organiza.
- La capa agéntica ayuda al core, no lo reemplaza.
- **Si contexto y código discrepan, prevalece el código.** Actualiza `context/` si el cambio altera la realidad del sistema.

---

## Pool de modelos disponibles

| Modelo | Provider | Rol | Strength |
|---|---|---|---|
| `minimax/MiniMax-M2.7` | NVIDIA | Orquestador (yo) | Razonador principal local |
| `openai/gpt-5.4` | OpenAI | Auditor técnico, Gestor release | Razonamiento profundo |
| `openai/gpt-5.4-mini` | OpenAI | Plan, Code-executor | Ejecución y propuesta rápida |
| `google/gemini-3.1-flash-lite-preview` | Google | Verificador funcional, Verificador deploy | Validación operativa (fallback) |

---

## Agents OpenCode

Disponibles en `.opencode/agents/`:

| Agent | Modo | Modelo | Descripción |
|---|---|---|---|
| `build` | primary | minimax-m2.7 | Orquestador - razona, decide alcance, secuencia, acepta/rechaza |
| `plan` | primary | gpt-5.5 | Solo lee y propone, no modifica |
| `code-executor` | subagent | gpt-5.4-mini | Implementación de cambios acotados |
| `technical-auditor` | subagent | gpt-5.4 | Revisión de diffs, detecta riesgos |
| `functional-verifier` | subagent | gemini | Builds, smoke tests, validaciones (fallback) |
| `release-manager` | subagent | gpt-5.4 | Decisión commit/deploy, trazabilidad |
| `deploy-verifier` | subagent | gemini | Valida pre-condiciones de deploy (fallback) |

**Uso:** Switch entre agents primary con **Tab** o **`@mention`** para subagents.

---

## Skills OpenCode (nativas del proyecto)

Disponibles en `.opencode/skills/<name>/SKILL.md`:

| Skill | Descripción |
|---|---|
| `ping` | Verificación base del loop |
| `repo-context-scan` | Lee estructura del repo |
| `workflow-healthcheck` | Valida workflows antes de deploy |
| `metadata-quality-audit` | Audita metadata doctrinal en D1 |
| `codigo_acotado` | Guía para implementacióndelegada |
| `revision_tecnica` | Revisión de diffs y detección de riesgos |
| `validacion_funcional` | Smoke tests y validaciones operativas |
| `release_deploy` | Decisión de commit/deploy |
| `auditoria_trazabilidad` | Acta de cierre y registro de cambios |

**Carga:** `skill({ name: "nombre" })`

---

## Skills Sistema (ecosistema externo)

Disponibles en `.agents/skills/` (ecosistema abierto):

| Skill | Fuente | Descripción |
|---|---|---|
| `cloudflare` | cloudflare/skills | Cobertura completa de Cloudflare: Workers, Pages, D1, R2, Workers AI, Vectorize, Durable Objects, etc. |
| `find-skills` | vercel-labs/skills | Ayuda a descubrir e instalar skills del ecosistema |

### Cloudflare Skill - Productos disponibles

**Compute & Runtime:** Workers, Pages, Durable Objects, Workflows, Containers, Workers for Platforms, Cron Triggers, Tail Workers, Snippets

**Storage & Data:** KV, D1 (relacional SQL), R2 (objetos), Queues, Vectorize, Hyperdrive, DO Storage, Secrets Store, Pipelines

**AI & ML:** Workers AI, Vectorize, Agents SDK, AI Gateway, AI Search

**Networking:** Tunnel, Spectrum, TURN, Network Interconnect

**Security:** WAF, DDoS Protection, Bot Management, API Shield, Turnstile

**Media:** Images, Stream, Browser Rendering, Zaraz

**Developer Tools:** Wrangler, Miniflare, C3, Observability, GraphQL Analytics API

**Infraestructura como Código:** Pulumi, Terraform, API REST

---

## Asignación intencional de modelos

**minimax-m2.7 (Minimax)** - yo como orquestador:
- Razonamiento principal local
- Decisiones de alcance y secuencia
- Control semántico del proyecto

**gpt-5.4 (OpenAI)** - razonador profundo:
- Revisión técnica de diffs
- Decisiones de release con múltiples criterios
- Auditoría arquitectónica

**gpt-5.4-mini (OpenAI)** - ejecución rápida:
- Implementación de cambios mecánicos
- Planificación inicial sin modificación
- Análisis rápido de contexto

**gemini-3.1-flash-lite-preview (Google)** - validación operativa (fallback):
- Smoke tests y builds
- Checks repetitivos de validación
- Verificación de pre-condiciones

---

## Criterio de delegación

Delega a subagente cuando la tarea sea:

- **Repetitiva** y bien definida (ej. audit, check, scan)
- **Especializada** y aislada (ej. validaciones de rendimiento D1)
- **Bloqueante para avanzar** y no requiere decisión de arquitectura

No delegues cuando:

- La tarea requiere entender el estado general del proyecto
- Hay que tomar decisiones de diseño
- El resultado puede alterar la arquitectura vigente

---

## Reglas de delegación explícitas

1. **El orquestador no implementa directamente** si una tarea es delegable
2. **El ejecutor no decide por sí mismo** que algo está listo para deploy
3. **El revisor técnico no modifica código** salvo encargo explícito
4. **El verificador funcional no redefine alcance**
5. **El deploy exige validación previa** y trazabilidad de commit/branch
6. **Ningún subagente puede cerrar un bloque por sí solo**

---

## Flujo operativo estándar

Todo cambio importante pasa por esta cadena:

```
1. DIAGNÓSTICO (build - minimax-m2.7)
   → El orquestador analiza, decide alcance y secuencia

2. IMPLEMENTACIÓN (code-executor - gpt-5.4-mini)
   → Cambio acotado y mecánico con skill codigo_acotado

3. REVISIÓN TÉCNICA (technical-auditor - gpt-5.4)
   → Análisis de diffs con skill revision_tecnica

4. VALIDACIÓN FUNCIONAL (functional-verifier - gemini)
   → Builds, smoke tests con skill validacion_funcional

5. DECISIÓN DE COMMIT (release-manager - gpt-5.4)
   → Verifica cadena completa con skill release_deploy

6. DECISIÓN DE DEPLOY (release-manager - gpt-5.4)
   → Evalúa precondiciones con skill release_deploy

7. CIERRE (release-manager + build)
   → Acta de cierre con skill auditoria_trazabilidad
```

---

## Integración con Cloudflare

Para tareas relacionadas con el backend (Workers, D1, R2, etc.):
- Usar skill `cloudflare` para consulta de APIs, limits, configuración
- Preferir retrieval de docs sobre conocimiento pre-entrenado
- Ejecutar `npm run d1:sanity` para verificar estado de D1 local

---

## Runtime legado (agents/)

El proyecto tiene un runtime propio de skills en TypeScript en `agents/skills/`.

### Skills nativas

| Skill | Comando npm | Propósito |
|---|---|---|
| `skill_ping` | `agents:test` | Loop base |
| `skill_repo_context_scan` | `agents:scan` | Estructura repo |
| `skill_workflow_healthcheck` | `agents:workflow:check` | Validar workflows |
| `skill_metadata_quality_audit` | `agents:metadata:audit` | Auditar metadata |
| `skill_capability_convergence_report` | `agents:convergence:report` | Reporte de convergencia |
| `skill_doctrine_coherence_audit` | `agents:doctrine:coherence` | Auditoría doctrinal |
| `skill_embedding_consistency_check` | `agents:embedding:check` | Consistencia embeddings |

### Wrappers (skills heredadas del core)

| Wrapper | Valida |
|---|---|
| `legacy_check_env_sanity` | Configuración de entorno |
| `legacy_cgr_network_baseurl_verify` | URL canónica del backend |

### Validar estructura

```bash
npm run agents:check
```

---

## Estructura del proyecto

- `cgr-platform/`: backend doctrinal (Cloudflare Workers + Hono)
- `frontend/`: aplicación React + Vite (Cloudflare Pages)
- `agents/`: runtime agéntico propio (TypeScript)
- `.opencode/`: configuración OpenCode native (skills + agents + config)
- `.agents/skills/`: skills del ecosistema (cloudflare, find-skills)
- `docs/`: documentación canónica
- `context/`: contexto inicial para agentes nuevos

---

## Comandos clave

```bash
# Backend
cd cgr-platform && npm run dev
cd cgr-platform && npm run deploy

# Frontend
cd frontend && npm run dev

# OpenCode skills (nativas)
npm run agents:check # valida estructura
npm run agents:test # ping
npm run agents:scan # repo context

# D1 local
cd cgr-platform && npm run d1:sanity

# Skills ecosistema
npx skills find [query] # buscar skills
npx skills add <source> --skill <name> --local # instalar skill local
```

---

## Convenciones OpenCode

- Skills nativas del proyecto: `.opencode/skills/<name>/SKILL.md`
- Skills ecosistema: `.agents/skills/<name>/SKILL.md`
- Agents custom: `.opencode/agents/<name>.md`
- Agents ecosistema: `.opencode/agents/` (config JSON) o `~/.config/opencode/agents/` (markdown)
- Wrappers heredados: `agents/skills/wrappers/` con prefijo `legacy_`
- Evitar pseudo-precisión jurídica

---

## URLs canónicas

- Backend: `https://cgr-platform.abogado.workers.dev`
- Frontend: `https://cgr-jurisprudencia-frontend.pages.dev`
