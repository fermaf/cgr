# Auditoría y Modernización Agéntica de Indubia

Fecha: 2026-03-29

## Propósito

Dejar un punto de entrada operativo para futuras pasadas de auditoría, modernización y preparación agéntica.

Este documento no reemplaza la arquitectura base en `docs/agentic_architecture.md`.
La complementa con:

- mapa de salud del sistema;
- drift detectado;
- contraste contra documentación oficial;
- backlog priorizado.

No es una guía operativa de despliegue.
Las decisiones canónicas de entorno y release viven en `docs/guias_tareas/04_entornos_y_despliegue.md`.

## 1. Mapa rápido de salud

### Healthy

- `cgr-platform/src/lib/doctrineLines.ts`
- `cgr-platform/src/lib/doctrineClusters.ts`
- `cgr-platform/src/workflows/backfillWorkflow.ts`
- `cgr-platform/src/workflows/canonicalRelationsWorkflow.ts`
- `frontend/src/lib/doctrineInsights.ts`
- `cgr-platform/src/clients/pinecone.ts` para búsqueda textual integrada y fetch por IDs
- `cgr-platform/wrangler.jsonc` con `workflows`, `queues`, `observability` y bindings explícitos

### Legacy

- `agents/skills/*` centradas en ingest/legacy inventory más que en doctrina
- `cgr-platform/src/lib/skillRouter.ts` marcado como histórico
- múltiples scripts `fix_*`, `repair_*`, `find_missing_*` sin catálogo estable
- documentación histórica todavía útil, pero mezclada con referencias obsoletas

### Drifted

- tipado de incidentes y documentación de `ENVIRONMENT` desalineados respecto de `staging`
- `cgr-platform/README.md` apuntaba a rutas de documentación inexistentes
- staging y production comparten recursos físicos, pero varios textos pueden inducir falsa sensación de aislamiento
- `generateEmbedding()` en `src/clients/mistral.ts` usa `MISTRAL_MODEL`; si llegara a usarse para embeddings, el contrato sería frágil

### Migration candidate

- catálogo de skills: pasar de listados dispersos a manifests por skill
- scripts diagnósticos de `cgr-platform/scripts/` hacia un inventario mínimo soportado
- separación explícita entre tooling doctrinal y tooling de gobernanza/legacy
- guardas operativas para endpoints sensibles también en staging si staging sigue apuntando a datos reales

### Discard candidate

- cualquier intento de convertir `agents/` actual en “core agent runtime” del producto sin antes materializar skills doctrinales reales
- wrappers o skills sin intención semántica doctrinal clara
- nueva capa MCP dentro del producto solo por moda

## 2. Alineación con documentación oficial

### Cloudflare

Hallazgos:

- El uso de `env.*` en `wrangler.jsonc` está alineado con la documentación oficial sobre bindings no heredables.
- `observability.enabled` y `head_sampling_rate` están alineados con Workers Logs.
- El proyecto usa AI Gateway vía `MISTRAL_API_URL` y `cf-aig-authorization`, patrón consistente con la documentación oficial.

Oportunidad:

- configurar observabilidad por entorno de forma más explícita si staging y producción requieren sampling distinto;
- usar más el tooling oficial de observabilidad/D1 para auditoría operativa, no necesariamente como dependencia del runtime.

### Pinecone

Hallazgos:

- `POST /records/namespaces/{namespace}/search` y el patrón de búsqueda textual encajan con la API oficial de índices con integrated embedding.
- El cliente ya opera con `upsert` y `fetch` de forma coherente para el modelo actual.

Oportunidad:

- formalizar un chequeo de consistencia D1 ↔ Pinecone ↔ namespace;
- inventariar scripts legacy de reparación de Pinecone y consolidarlos en una sola ruta diagnóstica soportada.

### GitHub

Hallazgos:

- El proyecto no depende hoy de GitHub MCP en runtime, lo cual es correcto.
- GitHub sí ofrece MCP oficial como herramienta de desarrollo para issues, PRs y contexto de repo.

Oportunidad:

- usar GitHub MCP solo para convertir hallazgos de auditoría en backlog estructurado;
- no incorporarlo al producto ni a Workflows.

### Mistral

Hallazgos:

- El repo usa `chat.completions` y `embeddings` vía cliente OpenAI-compatible contra `MISTRAL_API_URL`.
- Esto es razonable para el contrato actual.

Oportunidad:

- no introducir function calling ni MCP orchestration dentro del pipeline doctrinal todavía;
- primero conviene cerrar trazabilidad y calidad de resultados;
- separar, cuando sea necesario, modelo de chat y modelo de embeddings.

## 3. Prioridades agénticas reales

### Implementar primero

- `skill_embedding_consistency_check`
- `skill_metadata_quality_audit`
- `skill_doctrine_coherence_audit`
- `skill_doctrine_search` como wrapper limpio de `buildDoctrineSearch`
- `skill_doctrine_lines` como wrapper limpio de `buildDoctrineLines`

### Esperar

- agentes conversacionales persistentes
- MCP server propio de Indubia
- skills de auto-remediación con escritura automática sobre corpus doctrinal
- refactor grande de `agents/` sin necesidad táctica

### MCPs con valor real ahora

- Cloudflare MCP para observabilidad, D1 y Workers
- GitHub MCP para backlog y seguimiento de hallazgos

### MCPs que no justifican integración productiva inmediata

- Pinecone MCP dentro del producto
- Mistral MCP dentro del pipeline productivo

Ambos sí pueden ser útiles como herramientas de investigación o auditoría externa.

## 4. Backlog resumido

### Quick wins

- manifest `skill.yaml` para skills doctrinales nuevas
- skill wrapper de `doctrine_search`
- skill wrapper de `doctrine_lines`
- skill diagnóstica D1 ↔ Pinecone
- consolidar documentación operativa vigente

### Medium migrations

- endurecer staging porque hoy comparte recursos con prod
- catálogo soportado de scripts diagnósticos
- separar mejor `agents/` doctrinal de `agents/` legacy
- modelo explícito para embeddings si vuelve a usarse Mistral embeddings

### Strategic changes

- introducir staging con recursos aislados
- formalizar tabla/canal de hallazgos doctrinales auditables
- mover la mejora doctrinal continua a skills observables y no a scripts sueltos

## 5. Cambios aplicados en esta pasada

- se preserva `staging` como valor real en incidentes;
- se corrigió drift documental en `cgr-platform/README.md`;
- se corrigió drift documental en `docs/referencia/03_diccionario_variables_entorno.md`;
- se materializó `skill_embedding_consistency_check` como primera skill doctrinal diagnóstica real;
- se materializó `skill_metadata_quality_audit` como skill hermana para deuda doctrinal en metadata;
- se materializó `skill_metadata_remediation_planner` como planner de saneamiento sin escritura;
- se materializó `skill_metadata_auto_normalization_executor` como remediación controlada con preview por defecto;
- se materializó `skill_metadata_blocker_regeneration_executor` como tratamiento controlado para los blockers críticos exactos;
- se endurecieron las skills escritoras con `allowIds`, preview por defecto y límites duros de batch;
- se dejó este documento como handoff de auditoría.
