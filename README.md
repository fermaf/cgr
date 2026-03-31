# CGR.ai: Plataforma de Gobernanza Documental Inteligente

CGR.ai es un ecosistema *serverless* diseñado para la ingesta, análisis jurídico y búsqueda semántica de la jurisprudencia administrativa de la **Contraloría General de la República de Chile**. 

Ejecutada integralmente sobre el borde (edge) de Cloudflare, la plataforma transforma documentos complejos en un **Activo de Datos Monetizable** mediante el uso de Inteligencia Artificial (Mistral), Bases de Datos Vectoriales (Pinecone) y Orquestación Durable (Workflows).

---

## 🏛 Estructura del Monorepo (Higiene Documental)

El repositorio está organizado como un sistema modular optimizado para el despliegue escalable:

- **[`cgr-platform/`](cgr-platform/)**: Backend productivo. Un Cloudflare Worker (Hono) que orquesta el ciclo de vida del dato (Crawl -> Enrich -> Vectorize).
- **[`frontend/`](frontend/)**: Aplicación de usuario final construida en React + Vite, desplegada en Cloudflare Pages con soporte para búsqueda semántica y literal.
- **[`docs/`](docs/)**: El cerebro del proyecto. Contribuye al estándar **"El Librero v2"**: exhaustivo, experto y auditable.
- **[`skillgen/`](skillgen/)**: Módulo de gobernanza determinista y diseño de "Skills" para el manejo de incidentes y lógica de negocio compleja.
- **[`scripts/`](scripts/)**: Utilidades de mantenimiento para D1 y disparadores de procesos batch.

---

## 🚀 Inicio Rápido para Desarrolladores

### 1. Requisitos
- Node.js & npm.
- [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/install-upgrading/) instalado globalmente.

### 2. Levantar el Backend
```bash
cd cgr-platform
npm install
npm run dev
```

### 3. Levantar el Frontend
```bash
cd frontend
npm install
npm run dev
```

### 4. Runtime mínimo de agentes
El runtime incremental vive en `agents/` y converge con `cgr-platform/` sin modificarlo internamente.

Comandos:

```bash
npm run agents:check
npm run agents:test
npm run agents:scan
```

Qué hace cada uno:

- `agents:check`: compila el runtime mínimo y valida estructura + registry.
- `agents:test`: ejecuta el loop verificable `input -> routeSkill -> skillRunner -> execute -> agentMemory -> output` usando `skill_ping`.
- `agents:scan`: ejecuta `skill_repo_context_scan` para detectar `cgr-platform`, skills heredadas, workflows y riesgos de convergencia.

Manejo de skills heredadas:

- las skills nativas viven en `agents/skills/`;
- las skills heredadas no se duplican;
- la adaptación futura debe hacerse en `agents/skills/wrappers/`;
- cualquier wrapper debe importar la lógica heredada desde afuera y mantener nombres sin colisión con el registry nativo.

Primer puente operativo implementado:

- skill heredada envuelta: `check_env_sanity`;
- wrapper expuesto: `legacy_check_env_sanity`;
- motivo de elección: es diagnóstica, no escribe estado y sólo valida bindings/vars mínimos;
- prueba del wrapper:

```bash
npm run agents:wrap:test
```

- healthcheck estructural de workflows:

```bash
npm run agents:workflow:check
```

Limitaciones del wrapper inicial:

- ejecuta la lógica heredada real, pero sobre un `Env` adaptado desde `wrangler.jsonc`;
- por eso valida configuración declarada, no bindings vivos ni conectividad real del Worker;
- el prefijo `legacy_` se usa para evitar colisiones con nombres del catálogo heredado.

Segundo wrapper operativo implementado:

- skill heredada envuelta: `cgr_network_baseurl_verify`;
- wrapper expuesto: `legacy_cgr_network_baseurl_verify`;
- motivo de elección: fue priorizada como `P0` por el convergence report y valida el borde de ingestión con bajo riesgo y sin tocar estado.

Prueba del segundo wrapper:

```bash
npm run agents:wrap:baseurl
```

Convención de metadata:

- `executionLayer`: indica dónde corre la capacidad dentro del runtime actual. Valor típico: `agents-runtime`.
- `capabilitySource`: indica de dónde proviene la lógica de la capacidad. Ejemplos: `native-runtime`, `legacy-wrapper`, `repository-inspection`.
- `isDeprecated`: marca capacidades que deberían retirarse cuando ya exista un reemplazo mejor y estable en `/agents`.
- `source` se conserva por compatibilidad, pero la convención operativa nueva para gobernanza es `executionLayer + capabilitySource`.

Escalamiento del patrón:

- para cada skill heredada futura, crear un wrapper pequeño en `agents/skills/wrappers/`;
- reutilizar la función exportada del core;
- adaptar sólo contexto, input y forma de salida;
- registrar el wrapper en el registry central y documentar cualquier normalización de nombres.

Capacidades nuevas de gobierno:

- `skill_legacy_capabilities_inventory`: inventario estructurado del legado para clasificar wrappeabilidad, riesgo y convergencia.
- `skill_ingest_topology_scan`: mapa visible del flujo de ingestión, endpoints, workflows, storage y puntos de inserción futura.
- `skill_capability_convergence_report`: backlog priorizado para decidir qué converger primero y qué no conviene tocar aún.
- `skill_ingest_edge_observability`: diagnóstico compuesto del borde de ingestión reutilizando wrappers y scans ya existentes.
- `skill_ingest_incident_triage`: troubleshooting preventivo que traduce observabilidad estructural en rutas diagnósticas y acciones para operador.
- `skill_ingest_incident_decisioning`: decisioning operativo prudente que traduce el triage en una ruta de acción estable y reusable.
- `skill_ingest_control_plane`: superficie principal y unificada de ingestión para operadores humanos y para futura convergencia con incident routing.
- `skill_ingest_incident_bridge`: envelope de compatibilidad operativa entre el control plane y un sistema futuro de incident routing.

Comandos:

```bash
npm run agents:legacy:inventory
npm run agents:ingest:scan
npm run agents:convergence:report
npm run agents:ingest:edge
npm run agents:ingest:triage
npm run agents:ingest:decision
npm run agents:ingest:control-plane
npm run agents:ingest:bridge
```

Cómo acercan `/agents` al backend real de Indubia:

- convierten el core heredado en inventario gobernado, no en deuda opaca;
- exponen la topología real de ingestión sin tocar workflows productivos;
- preparan el uso explícito de `isDeprecated` para limpiar wrappers o diagnósticos heredados cuando exista mejor reemplazo nativo.

Uso futuro de `isDeprecated`:

- `false` o ausente: la capacidad sigue siendo válida o aún no tiene reemplazo mejor;
- `true`: mantener sólo por compatibilidad temporal y priorizar migración a la capacidad nueva;
- la decisión debe basarse en evidencia de reemplazo funcional, no sólo en existencia de un wrapper.

Cómo leer el convergence report:

- `operationalValueForIndubia`: estima valor práctico según cercanía a ingestión, diagnóstico y reutilización futura.
- `recommendation`:
  - `wrap_now`: mejor siguiente wrapper por valor/riesgo.
  - `wrap_later`: candidato útil, pero no es la siguiente mejor inversión.
  - `replace_with_native`: conviene evolucionar una capacidad propia en `/agents` en vez de envolver más legado.
  - `leave_as_is`: ya existe wrapper suficiente para la etapa actual.
  - `avoid_for_now`: no aporta suficiente valor frente a su riesgo o naturaleza.
- `suggestedPriority` ordena el backlog para escoger el siguiente wrapper o reemplazo.

Cómo usar el reporte para decidir el siguiente wrapper:

- tomar primero capacidades `P0` o `P1` con `wrap_now`;
- preferir las que estén más cerca de ingestión o de observabilidad del backend real;
- postergar `replace_with_native` hasta que el runtime nuevo tenga alcance funcional suficiente para reemplazar el legado con claridad.

Qué significa “ingest edge observability”:

- es una vista compuesta del borde del pipeline de ingestión;
- combina salud de configuración, validación estructural de `CGR_BASE_URL`, coherencia de workflows y topología visible del flujo;
- por ahora es estructural y diagnóstica: no verifica reachability real ni ejecución viva de workflows en Cloudflare.

Qué significa “ingest incident triage”:

- toma la observabilidad estructural ya disponible y la convierte en dominios de fallo plausibles, ruta diagnóstica y acciones recomendadas;
- no afirma incidentes reales; organiza troubleshooting reusable para el backend de ingestión;
- el nombre elegido es más preciso que `operational_readiness` porque el foco no es solo readiness, sino guiar investigación de fallas potenciales.

Qué significa “ingest incident decisioning”:

- toma la salida del triage y produce una decisión operativa pequeña y estable;
- su objetivo no es diagnosticar más, sino decidir la próxima ruta prudente de acción;
- prepara compatibilidad futura con incident routing mediante una envoltura de salida estable.

Qué significa “ingest control plane”:

- es la superficie principal de ingestión en `/agents`;
- consolida observability, triage y decisioning en una sola salida serializable;
- reemplaza consultas fragmentadas para operador humano, manteniendo las skills previas como building blocks subyacentes.

Qué problema resuelve el incident bridge:

- toma la salida unificada del control plane y la transforma en un envelope estable para incident handling futuro;
- separa la semántica de “panel operacional” de la semántica de “routing envelope”;
- evita forzar una integración falsa con `routeIncident` mientras los contratos sigan siendo distintos.

Diferencia entre readiness, observability y triage:

- `observability`: reúne señales visibles y checks compuestos;
- `readiness`: resume si la estructura visible parece suficiente para operar;
- `triage`: traduce esas señales a dominios de fallo, pasos de diagnóstico y acciones de operador.
- `decisioning`: selecciona una ruta operativa concreta a partir del triage, sin exagerar la certeza disponible.
- `control plane`: entrega una interfaz única de más alto nivel, lista para consumo humano o por adapters futuros.

Cómo interpretar `routeDecision`:

- `observe_only`: no hay señal suficiente para mover la investigación local.
- `run_local_diagnostics`: conviene profundizar primero dentro del runtime actual.
- `inspect_config`: priorizar configuración visible y bindings declarados.
- `inspect_workflow_wiring`: priorizar wiring estructural de workflows y exports.
- `inspect_external_dependency`: tratar el caso como boundary externa aún no verificable localmente.
- `escalate_to_human`: la evidencia no permite una decisión operativa prudente sin revisión humana.

Cuándo `humanReviewNeeded = true`:

- cuando la mejor decisión depende de evidencia no verificable aún;
- cuando varias hipótesis siguen abiertas y ninguna domina con claridad;
- cuando la salida apunta a boundary externa o a diagnóstico adicional antes de automatizar.

Convención actual de memoria y trazabilidad:

- las skills compuestas registran solo su evento padre en `agentMemory`;
- las subskills quedan trazadas en `telemetry`, no como eventos separados de memoria;
- se mantiene así para evitar ruido y conservar la memoria orientada a decisiones de alto nivel.

Gobernanza de superficie:

- `skill_ingest_control_plane` pasa a ser el punto de entrada principal para ingestión;
- `skill_ingest_edge_observability`, `skill_ingest_incident_triage` y `skill_ingest_incident_decisioning` quedan recomendadas como building blocks internos y herramientas de depuración profunda;
- para operador humano, la recomendación por defecto es usar primero `agents:ingest:control-plane`.

Cómo esta capacidad acerca `/agents` a operación real sin tocar producción:

- convierte checks estructurales en troubleshooting reutilizable;
- permite que un operador o futuro agente siga una ruta diagnóstica sin depender todavía de MCPs ni de ejecución viva en Cloudflare;
- prepara una integración futura más cercana con incident routing cuando exista evidencia operacional real.

Compatibilidad futura con incident routing:

- `skill_ingest_incident_decisioning` emite una envoltura `futureIncidentRoutingCompatibility`;
- esa estructura desacopla la decisión operativa del runtime actual y deja lista la convergencia futura con `routeIncident` o adaptadores equivalentes;
- no conecta producción todavía; sólo fija una interfaz prudente y estable.

Adapter de control plane:

- `agents/utils/ingestControlPlaneAdapter.ts` convierte la salida del control plane en una envoltura estable de snapshot operacional;
- esa envoltura está pensada para integrarse después con un sistema más amplio de routing o incident handling;
- sigue siendo local y no toca `cgr-platform` internamente.

Incident bridge y routeIncident:

- `agents/utils/ingestIncidentBridge.ts` define el envelope reusable del bridge y un `legacyRoutingPreview`;
- hoy la compatibilidad es estructural, no ejecutiva: `routeIncident` heredado espera un `IncidentCode`, mientras el control plane emite una decisión operativa;
- por eso el bridge expone tanto el envelope operativo como una vista conservadora de compatibilidad, dejando explícitas las diferencias semánticas.

Compatibilidad semántica con routing heredado:

- `routeIncident` espera un `Incident` con al menos `ts`, `env`, `service`, `kind`, `system`, `code` y `message`, y sólo enruta realmente por `incident.code`;
- `agents/utils/ingestToLegacyIncidentAdapter.ts` intenta una traducción controlada desde `skill_ingest_incident_bridge` hacia un `Incident` candidato para el legado;
- la capa no finge equivalencias: clasifica el resultado como `fully_compatible`, `partially_compatible`, `preview_only` o `incompatible`.

Taxonomía nativa de incidentes de ingestión:

- `INGEST_CONFIG_SUSPECTED`: se emite cuando la decisión operativa prioriza configuración visible.
- `INGEST_WORKFLOW_WIRING_SUSPECTED`: se emite cuando la decisión operativa apunta a wiring estructural de workflows.
- `INGEST_EXTERNAL_DEPENDENCY_SUSPECTED`: se emite cuando la estructura local luce sana y la sospecha prudente pasa al boundary externa.
- `INGEST_LOCAL_DIAGNOSTICS_REQUIRED`: se emite cuando la evidencia no alcanza y conviene profundizar localmente.
- `INGEST_HUMAN_REVIEW_REQUIRED`: se emite cuando la evidencia disponible no permite una decisión prudente sin revisión humana.

Diferencia entre `routeDecision` e `IncidentCode` nativo:

- `routeDecision` dice qué hacer ahora desde el punto de vista operativo;
- `IncidentCode` nativo dice qué tipo de incidente de ingestión está siendo emitido por `/agents`;
- el primero guía la acción; el segundo fija lenguaje estable, trazable y reusable para convergencia futura.

Por qué hace falta un router nativo:

- `routeIncident` heredado enruta por `Incident.code` legado y no puede ser la semántica dominante de `/agents`;
- `skill_ingest_native_router` toma el `IncidentCode` nativo como input principal y completa el flujo `control_plane -> native incident -> native router`;
- eso permite que Indubia tenga routing útil dentro de `/agents` incluso cuando la compatibilidad con el legado siga siendo parcial.

Taxonomía de `routeTarget` nativo:

- `observe_only`: no hay movimiento operativo adicional necesario.
- `run_control_plane`: volver a la superficie principal para ordenar revisión local.
- `run_local_ingest_diagnostics`: profundizar observabilidad y triage dentro del runtime.
- `inspect_external_dependency`: desplazar el foco a la boundary externa.
- `inspect_workflow_wiring`: revisar wiring estructural de workflows.
- `escalate_to_operator`: mantener la decisión en operación humana cercana.
- `escalate_to_human`: escalar sin automatización adicional.

Diferencia entre router nativo y `routeIncident` heredado:

- el router nativo decide destinos operativos para ingestión usando la taxonomía propia de `/agents`;
- `routeIncident` heredado sigue siendo una compatibilidad secundaria y no se invoca como autoridad principal;
- la salida del router nativo expone `legacyCompatibility`, `canDelegateToLegacy` y `legacyFallbackReason` para dejar esa relación explícita.

Derivación de incidente nativo:

- `skill_ingest_native_incident` reutiliza `skill_ingest_control_plane`, `skill_ingest_incident_triage` y `skill_ingest_incident_decisioning`;
- no reemplaza esas skills: extrae de ellas un contrato más semántico y más cercano a incident routing;
- si la salida fuera sólo `observe_only`, la capa devuelve preview y no emite incidente nativo.

Cuándo se puede llamar de verdad a `routeIncident`:

- cuando exista un `Incident` candidato semánticamente defendible;
- hoy eso ocurre sólo en modo parcial, degradando honestamente a `code: "UNKNOWN"` cuando el incidente nativo permite inferir dominio (`network`, `workflow`, `config`) pero no un código legado verificable;
- si la salida es sólo operativa (`observe_only`, `run_local_diagnostics`, `escalate_to_human`), el adapter devuelve preview o incompatibilidad y no debe presentarse como integración real.

Qué resuelve `agents:ingest:route-adapter`:

- demuestra el flujo `control_plane -> native incident derivation -> route adapter -> routeIncident/fallback`;
- deja explícito qué campos del incidente nativo ya mejoran la convergencia con el contrato heredado y cuáles siguen abiertos;
- convierte la convergencia con `routeIncident` en una prueba controlada y trazable, no en una promesa de integración.

Cuándo se usa el legado y cuándo no:

- el router nativo siempre decide primero dentro de `/agents`;
- el legado sólo se consulta como preview de compatibilidad cuando el incidente nativo tiene una relación honesta con algún dominio heredado;
- si no hay equivalencia real, el sistema permanece en `native_only` y no fuerza delegación.

Qué significa delegación controlada:

- `/agents` decide primero con `skill_ingest_native_router`;
- después, `skill_ingest_legacy_delegation` consulta una matriz explícita para decidir si puede bajar al legado;
- esa delegación nunca se infiere implícitamente desde `compatibilityLevel`: necesita regla positiva y justificada.

Cuándo un caso se queda nativo:

- cuando el incidente nativo sólo degrada honestamente a `UNKNOWN` en el legado;
- cuando el route adapter queda en `preview_only` o `partially_compatible` sin equivalencia fuerte;
- cuando la matriz marca `canDelegateToLegacy=false`.

Cuándo un caso puede bajar al legado:

- sólo cuando exista una relación semántica suficientemente específica entre `IncidentCode` nativo, `routeTarget` y contrato heredado;
- hoy la matriz deja ese espacio preparado, pero no habilita delegación real para los códigos actuales.

Cómo esto consolida la arquitectura:

- mantiene a `/agents` como control plane y router nativo principal;
- reduce el riesgo de volver a poner al legado como semántica dominante;
- convierte la convergencia con `routeIncident` en una decisión gobernada y auditable, no en heurística oculta.

---

## 📚 Documentación Maestra

Toda la inteligencia técnica y estratégica vigente está consolidada en la estructura actual del repositorio.

> [!IMPORTANT]
> **Punto de Entrada Maestro**: [**AGENTS.md**](AGENTS.md) -> [**context/README.md**](context/README.md) -> [**docs/README.md**](docs/README.md)

### Atajos Estratégicos
- **[Visión Ejecutiva](docs/explicacion/02_vision_ejecutiva.md)**: Valor de negocio y enfoque del producto.
- **[Arquitectura C4](docs/explicacion/01_arquitectura_c4_y_flujos.md)**: Flujos de datos e ingeniería doctrinal del sistema.
- **[Referencia de API](docs/referencia/01_referencia_api_completa.md)**: Guía de endpoints productivos y ejemplos de validación.
- **[Roadmap Estratégico](docs/explicacion/05_roadmap_estrategico.md)**: Prioridades y extensión conceptual del proyecto.

> [!TIP]
> **Roadmap en ejecución (2026-02-27)**:
> - Fase 1 ejecutada: endpoints analytics + snapshots D1 + cache KV.
> - Fase 2 bootstrap ejecutada: endpoint de linaje jurisprudencial.
> - Fase 3 pendiente.

---

## 🛡 Gobernanza y Operación

La plataforma se auto-mantiene mediante procesos de **Higiene de Datos** y **Gobernanza Determinista**:
- **Workflows**: Ingesta diaria resiliente ante fallos de red o API.
- **Audit Ready**: Cada cambio en el dataset es trazable mediante la tabla `historial_cambios` en D1.
- **Integrated Inference**: Pinecone maneja la vectorización atómica evitando discrepancias entre modelos.

---
**Fecha de Actualización**: 2026-02-27  
**Estado del Repositorio**: Producción / Expert Audit Ready
