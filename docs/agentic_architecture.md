# Arquitectura Agéntica de Indubia

## Objetivo

Definir una base operable para que agentes de desarrollo puedan mantener y evolucionar la organización doctrinal de dictámenes sin rediseñar el backend actual.

Esta arquitectura parte de un principio simple:

- el sistema productivo sigue viviendo en `cgr-platform/`;
- la capa agéntica no reemplaza `doctrine-search` ni `doctrine-lines`;
- los agentes operan mediante skills pequeñas, con contrato explícito y dependencias visibles;
- los MCPs son conectores de infraestructura, no lógica de negocio.

## Decisión central

La primera iteración no introduce un framework nuevo de agentes dentro de la ruta crítica del producto.

En cambio, formaliza tres capas ya existentes en el repositorio:

1. **Capa productiva doctrinal**
   - Vive en `cgr-platform/src/lib/`, `cgr-platform/src/clients/`, `cgr-platform/src/storage/` y `cgr-platform/src/workflows/`.
   - Aquí están `buildDoctrineSearch`, `buildDoctrineLines`, `buildDoctrineClusters`, `BackfillWorkflow` y `CanonicalRelationsWorkflow`.

2. **Capa de skills operables**
   - Vive de forma canónica en `agents/`.
   - Reutiliza código de `cgr-platform/`, pero no depende de una carpeta paralela de skills dentro del Worker.
   - Esta capa debe converger hacia contratos uniformes, no hacia duplicación de lógica.

3. **Capa de conectores MCP**
   - Encapsula acceso a Pinecone, Cloudflare, Mistral y GitHub.
   - Su función es exponer operaciones estables para skills. No debe contener reglas doctrinales.

## Qué es un skill en Indubia

Un skill en este proyecto es una capacidad semántica reutilizable que:

- responde a una pregunta operativa concreta;
- tiene entrada y salida predecibles;
- puede ser ejecutada por un agente sin contexto histórico extra;
- reutiliza código existente cuando ya existe una librería o workflow que resuelve el problema.

Ejemplos válidos:

- `skill_doctrine_search`
- `skill_doctrine_line_explainer`
- `skill_relationship_enrichment`
- `skill_embedding_consistency_check`

No son skills válidos:

- wrappers sin significado doctrinal;
- abstracciones vacías del tipo `execute_task`;
- reimplementaciones de endpoints existentes solo para “volverlos agentic”.

## Qué es un MCP en Indubia

Un MCP en este proyecto es una interfaz estándar para infraestructura externa.

Su responsabilidad es permitir que un agente use servicios como:

- Cloudflare Workers, D1, KV y Workflows;
- Pinecone;
- Mistral;
- GitHub.

Un MCP no decide criterios doctrinales. Solo expone operaciones seguras y legibles.

## Capas del sistema

### 1. Product Core

Código existente que no debe romperse:

- `cgr-platform/src/lib/doctrineLines.ts`
- `cgr-platform/src/lib/doctrineClusters.ts`
- `cgr-platform/src/index.ts`
- `cgr-platform/src/workflows/backfillWorkflow.ts`
- `cgr-platform/src/workflows/canonicalRelationsWorkflow.ts`
- `cgr-platform/src/clients/mistral.ts`
- `cgr-platform/src/clients/pinecone.ts`

Responsabilidad:

- servir `doctrine-search` y `doctrine-lines`;
- mantener ingestión, enriquecimiento, vectorización y relaciones;
- persistir estado en D1 y KV;
- ejecutar workflows productivos.

### 2. Agentic Skills Layer

Propósito:

- auditar el corpus;
- detectar deuda doctrinal;
- proponer o ejecutar mejoras acotadas;
- diagnosticar calidad de embeddings, metadata y relaciones.

Esta capa usa el core existente de dos maneras:

- invocando funciones existentes;
- disparando workflows o consultas ya disponibles.

No debe duplicar:

- lógica de clustering;
- lógica de enriquecimiento;
- lógica de doctrine-search;
- persistencia ya encapsulada en D1/KV/Pinecone clients.

### 3. MCP Layer

Propósito:

- exponer operaciones de infraestructura con contrato estable;
- evitar que cada skill conozca detalles de autenticación, hostnames o SDKs;
- reducir acoplamiento con proveedores concretos.

## Taxonomía inicial de skills

La taxonomía recomendada para esta iteración es:

```text
skills/
  core/
    doctrine_search
    doctrine_clusters
    doctrine_lines
    doctrine_line_explainer

  enrichment/
    doctrine_enrichment
    relationship_enrichment
    doctrinal_naming_refinement
    doctrinal_shift_detection

  diagnostics/
    retrieval_diagnostics
    embedding_consistency_check
    metadata_quality_audit
    corpus_gap_detector
    doctrine_coherence_audit

  operations/
    ingest_status_scan
    trigger_backfill_batch
    trigger_canonical_relations_batch
    inspect_d1_schema
    inspect_vector_index
    inspect_worker_env

  governance/
    capability_inventory
    repo_context_scan
    workflow_healthcheck
```

### Criterio de cada grupo

#### `core/`

Skills que exponen capacidades doctrinales ya existentes del producto para uso de agentes.

Regla:

- deben apoyarse en funciones existentes como `buildDoctrineSearch`, `buildDoctrineClusters` y `buildDoctrineLines`.
- no crean nueva semántica por sí mismas.

#### `enrichment/`

Skills que mejoran o completan información doctrinal.

Regla:

- pueden usar LLM, pero deben dejar trazabilidad de evidencia y del cambio propuesto;
- si escriben en el sistema, deben hacerlo sobre tablas/flujo ya existentes y con guardas fuertes de `preview`, allowlist y batch pequeño.

#### `diagnostics/`

Skills para detectar problemas, inconsistencias o deuda de calidad.

Regla:

- por defecto son `diagnostic_only: true`;
- si sugieren acciones, las entregan como propuesta estructurada antes de ejecutar cambios.

#### `operations/`

Skills de operación controlada sobre Workflows, D1, KV, Pinecone y entorno.

Regla:

- se enfocan en observabilidad y ejecución de tareas ya soportadas por la plataforma;
- no contienen decisiones doctrinales.

#### `governance/`

Skills para que un agente entienda el repositorio, sus capacidades y su estado.

Regla:

- sirven como capa de onboarding agéntico;
- no deben mezclarse con skills doctrinales.

## Mapeo de capacidades existentes del repo

### Capacidades doctrinales ya existentes reutilizables

Estas no existen aún como skills formales, pero ya son el núcleo que debe envolverse:

| Capacidad propuesta | Reutiliza | Estado |
| --- | --- | --- |
| `skill_doctrine_search` | `cgr-platform/src/lib/doctrineLines.ts` -> `buildDoctrineSearch` | crear wrapper, no reescribir lógica |
| `skill_doctrine_lines` | `cgr-platform/src/lib/doctrineLines.ts` -> `buildDoctrineLines` | crear wrapper |
| `skill_doctrine_clusters` | `cgr-platform/src/lib/doctrineClusters.ts` -> `buildDoctrineClusters` | crear wrapper |
| `skill_relationship_enrichment` | `cgr-platform/src/workflows/canonicalRelationsWorkflow.ts` + `relationsCanonical` | parcialmente existente |
| `skill_doctrine_enrichment` | `cgr-platform/src/workflows/backfillWorkflow.ts` + `clients/mistral.ts` | parcialmente existente |

### Capacidades heredadas reutilizadas por `agents/`

Algunas capacidades históricas siguen siendo útiles, pero la línea principal ya no es una carpeta paralela de skills dentro del Worker.

Su reutilización canónica ocurre mediante wrappers y adapters en `agents/`.

### Skills actuales en `agents/skills`

Estas son útiles como runtime auxiliar, pero no son todavía doctrina-centric:

| Skill actual | Taxonomía propuesta |
| --- | --- |
| `skill_repo_context_scan` | `governance/repo_context_scan` |
| `skill_workflow_healthcheck` | `governance/workflow_healthcheck` |
| `skill_legacy_capabilities_inventory` | `governance/capability_inventory` |
| `skill_capability_convergence_report` | `governance/capability_inventory` |
| `skill_ingest_topology_scan` | `operations/ingest_status_scan` |
| `skill_ingest_control_plane` | `operations/ingest_status_scan` |
| `skill_ingest_edge_observability` | `operations/ingest_status_scan` |
| `skill_ingest_incident_triage` | `operations/ingest_status_scan` |
| `skill_ingest_incident_decisioning` | `operations/ingest_status_scan` |
| `skill_ingest_incident_bridge` | `operations/ingest_status_scan` |
| `skill_ingest_legacy_delegation` | legado, no base doctrinal |
| `skill_ingest_native_incident` | legado/ops |
| `skill_ingest_native_router` | legado/ops |
| `skill_ingest_route_adapter` | legado/ops |
| `skill_ping` | utilitario básico |

### Decisión de compatibilidad

No se deben renombrar ni mover de inmediato los archivos existentes.

Primero se recomienda:

1. conservar los nombres actuales;
2. agregar manifest `skill.yaml` por skill nueva o prioritaria;
3. introducir aliases taxonómicos en un catálogo nuevo;
4. migrar gradualmente los nombres internos solo cuando exista necesidad real.

## Contrato estándar de skill

Cada skill nuevo debe tener una carpeta propia:

```text
skills/<grupo>/<skill_id>/
  skill.yaml
  README.md
  executor.ts
  fixtures/           # opcional
```

### `skill.yaml`

Contrato mínimo recomendado:

```yaml
id: skill_doctrine_search
version: 1
description: Ejecuta búsqueda doctrinal semántica sobre el corpus vigente sin modificar datos.
owner: product-doctrine
diagnostic_only: true
category: core

inputs:
  type: object
  required: [query]
  properties:
    query:
      type: string
      minLength: 3
    limit:
      type: integer
      minimum: 1
      maximum: 20
    materia:
      type: string
    from_date:
      type: string
    to_date:
      type: string

outputs:
  type: object
  required: [status, data]
  properties:
    status:
      enum: [success, error]
    data:
      type: object
    diagnostics:
      type: object
    evidence:
      type: array
      items:
        type: object

dependencies:
  code:
    - cgr-platform/src/lib/doctrineLines.ts
  mcps:
    - pinecone
    - cloudflare
  data:
    - d1.dictamenes
    - pinecone.records

side_effects:
  writes_d1: false
  writes_kv: false
  writes_vector: false
  triggers_workflow: false
```

### Campos obligatorios

- `id`
- `version`
- `description`
- `diagnostic_only`
- `inputs`
- `outputs`
- `dependencies`

### Campos recomendados

- `owner`
- `category`
- `side_effects`
- `preconditions`
- `failure_modes`
- `evidence_policy`

### Reglas del contrato

1. El `id` debe expresar la capacidad semántica, no la implementación.
2. `inputs` y `outputs` deben ser JSON Schema simples.
3. `dependencies.code` debe apuntar a archivos reales del repo.
4. `dependencies.mcps` lista conectores requeridos.
5. `diagnostic_only: false` obliga a declarar side effects.
6. Si el skill usa LLM para inferencias jurídicas, debe devolver evidencia o justificación resumida.

## Plan de integración con MCPs

## Pinecone MCP

### Operaciones necesarias

- `query_records(query, top_k, filter)`
- `fetch_records(ids)`
- `upsert_record(id, metadata)`
- `describe_index()`
- `sample_namespace(filters, limit)`

### Skills dependientes

- `core/doctrine_search`
- `core/doctrine_clusters`
- `core/doctrine_lines`
- `diagnostics/retrieval_diagnostics`
- `diagnostics/embedding_consistency_check`
- `diagnostics/corpus_gap_detector`

### Responsabilidad

- acceso a búsquedas vectoriales y lectura de metadata vectorial;
- nunca decidir naming doctrinal ni relaciones jurídicas.

## Cloudflare MCP

### Operaciones necesarias

- `query_d1(sql, params)`
- `get_kv_json(key)`
- `put_kv_json(key, value)` solo para skills no diagnósticas
- `start_workflow(name, params)`
- `get_worker_env_summary()`
- `get_deployment_status()`

### Skills dependientes

- todos los `operations/*`
- `enrichment/doctrine_enrichment`
- `enrichment/relationship_enrichment`
- `diagnostics/metadata_quality_audit`
- `diagnostics/doctrine_coherence_audit`

### Responsabilidad

- exponer D1, KV y Workflows con interfaz segura;
- permitir ejecución controlada sobre la plataforma actual.

## Mistral MCP

### Operaciones necesarias

- `analyze_dictamen(raw_or_ref, mode)`
- `embed_text(text)`
- `rerank(query, candidates)`
- `expand_query(query)`
- `healthcheck()`

### Skills dependientes

- `enrichment/doctrine_enrichment`
- `enrichment/relationship_enrichment`
- `enrichment/doctrinal_naming_refinement`
- `enrichment/doctrinal_shift_detection`
- `diagnostics/retrieval_diagnostics`

### Responsabilidad

- centralizar inferencia y salud del proveedor LLM;
- separar prompts/modelos del resto de skills.

## GitHub MCP

### Operaciones necesarias

- `open_issue(title, body, labels)`
- `create_pr_comment(pr, body)`
- `commit_file_changes(paths, message)` opcional más adelante
- `read_repo_file(path)`

### Skills dependientes

- `governance/capability_inventory`
- `diagnostics/corpus_gap_detector`
- `diagnostics/metadata_quality_audit`
- skills que propongan planes de mejora o remediación

### Responsabilidad

- transformar hallazgos agénticos en backlog operable;
- no tocar producción ni retrieval directamente.

## Cómo un agente debe operar el sistema

Secuencia recomendada para un agente nuevo:

1. Leer este documento.
2. Leer `docs/README.md`.
3. Identificar si la tarea cae en `core`, `enrichment`, `diagnostics`, `operations` o `governance`.
4. Ejecutar primero skills diagnósticas si existe riesgo de inconsistencia.
5. Reutilizar funciones del core productivo antes de escribir código nuevo.
6. Si necesita infraestructura externa, hacerlo vía MCP conceptual correspondiente.
7. Si una mejora requiere escritura, preferir:
   - workflow existente;
   - tabla existente;
   - path de persistencia existente.

Regla práctica:

- si el problema se resuelve llamando `buildDoctrineSearch`, no crear otro buscador;
- si el problema se resuelve disparando `BackfillWorkflow`, no crear otro pipeline de enriquecimiento;
- si el problema es auditar relaciones, partir desde `CanonicalRelationsWorkflow` y las tablas D1 actuales.

## Cómo agregar un nuevo skill

### Paso 1: ubicar la capacidad correcta

Preguntas:

- ¿es doctrinal, diagnóstica, operativa o de gobernanza?
- ¿lee o escribe?
- ¿necesita LLM o solo D1/Pinecone?
- ¿ya existe una función en `cgr-platform` que resuelve el 80%?

### Paso 2: crear contrato primero

Crear `skill.yaml` antes de `executor.ts`.

Esto obliga a aclarar:

- propósito;
- entradas;
- salidas;
- dependencias;
- side effects;
- evidencia esperada.

### Paso 3: implementar con mínima lógica nueva

Prioridad de reutilización:

1. `cgr-platform/src/lib/*`
2. `cgr-platform/src/clients/*`
3. `cgr-platform/src/storage/*`
4. `cgr-platform/src/workflows/*`
5. `agents/*`

### Paso 4: documentar límites

Todo skill debe dejar explícito:

- qué no hace;
- qué tablas toca;
- qué MCP requiere;
- si sus resultados son recomendación o acción ejecutada.

## Cómo conectar un nuevo MCP

Un MCP nuevo solo se justifica si:

- encapsula un servicio externo real;
- al menos dos skills lo necesitan;
- evita duplicar autenticación o detalles de cliente.

Contrato mínimo sugerido:

```yaml
id: pinecone
description: Acceso estándar al índice vectorial doctrinal.
operations:
  - query_records
  - fetch_records
  - upsert_record
auth:
  source: env
depends_on:
  - PINECONE_API_KEY
  - PINECONE_INDEX_HOST
  - PINECONE_NAMESPACE
failure_modes:
  - rate_limit
  - not_found
  - auth_error
```

Regla:

- el MCP define operaciones;
- el skill define intención semántica.

## Compatibilidad con el sistema actual

Esta arquitectura mantiene compatibilidad porque:

- no cambia endpoints existentes;
- no cambia contratos de `doctrine-search` ni `doctrine-lines`;
- no obliga a mover skills actuales;
- reutiliza `BackfillWorkflow` y `CanonicalRelationsWorkflow`;
- conserva D1, KV, Pinecone y Mistral como están hoy.

## Primera secuencia recomendada de implementación

El orden de mayor valor y menor riesgo es:

1. Formalizar catálogo de skills doctrinales con `skill.yaml`.
2. Crear wrappers para:
   - `skill_doctrine_search`
   - `skill_doctrine_lines`
   - `skill_doctrine_clusters`
3. Crear skills diagnósticas:
   - `skill_embedding_consistency_check`
   - `skill_metadata_quality_audit`
   - `skill_doctrine_coherence_audit`
4. Conectar hallazgos a backlog o incidentes mediante GitHub MCP.

## Skills de mayor valor inmediato

Estado actual:

- `skill_embedding_consistency_check` ya quedó implementada como primera skill doctrinal diagnóstica real en `agents/`.
- `skill_metadata_quality_audit` quedó implementada como segunda skill diagnóstica doctrinal, enfocada en deuda semántica y calidad de metadata.
- `skill_metadata_remediation_planner` quedó implementada para traducir la auditoría en batches operables y seguros.
- `skill_metadata_auto_normalization_executor` quedó implementada para ejecutar remediación controlada solo sobre el bucket auto-normalizable.
- `skill_metadata_blocker_regeneration_executor` quedó implementada para clasificar blockers exactos y dejar su reproceso puntual listo, con guardas de allowlist y batch pequeño antes de cualquier apply.

Modelo operativo actual para skills escritoras:

- `preview` por defecto;
- `apply` siempre explícito;
- `allowIds` obligatorio para escrituras reales;
- lotes pequeños con límite duro por skill;
- audit trail local obligatorio por corrida.

### 1. `skill_embedding_consistency_check`

Detecta:

- dictámenes enriquecidos sin vector;
- vector con metadata incompleta;
- desalineación entre D1 y Pinecone;
- documentos con `analisis` débil o truncado.

### 2. `skill_metadata_quality_audit`

Detecta:

- materias ruidosas;
- etiquetas doctrinales pobres;
- booleanos inconsistentes con relaciones detectadas;
- dictámenes relevantes sin naming doctrinal útil.

### 3. `skill_doctrine_coherence_audit`

Detecta:

- clusters con representante débil;
- líneas con naming poco explicativo;
- cambios doctrinales potenciales sin relación explícita;
- líneas con exceso de heterogeneidad semántica.

## Resumen operativo

La arquitectura agéntica de Indubia debe ser una capa delgada sobre el sistema actual:

- `cgr-platform` sigue siendo el core;
- los skills expresan intención semántica;
- los MCPs encapsulan infraestructura;
- los agentes mejoran corpus, retrieval y coherencia sin rehacer el backend.

Ese es el punto de equilibrio correcto para esta iteración.
