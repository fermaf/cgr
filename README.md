# Indubia / CGR Jurisprudencia

Indubia es una plataforma doctrinal para buscar, leer y organizar jurisprudencia administrativa de la Contraloria General de la Republica de Chile.

No es un chatbot juridico generico. El core del sistema es un backend de retrieval semantico-doctrinal sobre Cloudflare Workers, D1, KV y Pinecone, con una aplicacion React en Cloudflare Pages y una capa agental local para diagnostico, auditoria y remediacion controlada.

## Estado real al 2026-05-18

- Repositorio GitHub: `git@github.com:fermaf/cgr.git`
- Acceso web al codigo: `https://github.com/fermaf/cgr`
- Rama principal local: `main`
- Backend canonico: `https://cgr-platform.abogado.workers.dev`
- Frontend canonico: `https://cgr-jurisprudencia-frontend.pages.dev`
- Worker productivo: `cgr-platform`
- Pages productivo: `cgr-jurisprudencia-frontend`
- Base D1 productiva: `cgr-dictamenes`
- D1 database id: `c391c767-2c72-450c-8758-bee9e20c8a35`
- KV `DICTAMENES_SOURCE`: `ac84374936a84e578928929243687a0b`
- KV `DICTAMENES_PASO`: `4673b680cd704508a4fbc87789acb153`
- Pinecone namespace: `mistralLarge2512`
- Modelo LLM principal de enrichment: `mistral-large-2512`
- Modelo LLM auxiliar para metadata/rewrite: `mistral-large-2411`

Disponibilidad verificada desde internet el `2026-05-18`:

- `GET /` en backend: `200`, responde `CGR Platform API`.
- `GET /api/v1/stats`: `200`, D1 responde con `86.694` dictamenes y ultima actualizacion `2026-05-18T16:13:05.581Z`.
- `GET /api/v1/public/pjos?limit=1`: `200`, capa PJO publica disponible.
- `GET /api/v1/dictamenes?q=020445N19&page=1`: `200`, busqueda literal/ID disponible.
- Frontend Pages raiz: `200`.
- `doctrine-search`, `doctrine-lines` y rutas que requieren embedding semantico estan fallando con `500` porque el modelo configurado `nvidia/llama-3.2-nv-embedqa-1b-v2` llego a fin de vida el `2026-05-18T00:00:00Z` y NVIDIA devuelve `410 Gone`.

La incidencia de embeddings afecta el retrieval semantico y la construccion dinamica de lineas doctrinales. No afecta la lectura directa desde D1 ni los endpoints publicos que no calculan embeddings.

## Mapa del repositorio

- `cgr-platform/`: backend productivo en Cloudflare Workers + Hono. Contiene endpoints HTTP, workflows, ingestion, enrichment, vectorizacion, D1, KV, Pinecone y capa doctrinal.
- `frontend/`: aplicacion React + Vite desplegada en Cloudflare Pages. Consume `/api` via proxy hacia el Worker canonico.
- `agents/`: runtime agental propio en TypeScript para diagnostico, auditoria, wrappers heredados y control plane de ingestion.
- `.opencode/`: agentes y skills nativas de OpenCode.
- `.agents/skills/`: skills externas, incluyendo Cloudflare.
- `context/`: contexto obligatorio para agentes nuevos.
- `docs/`: documentacion canonica y bitacoras tecnicas.
- `cgr-platform/migrations/`: migraciones D1.
- `cgr-platform/scripts/`: scripts de auditoria, backfill y operaciones puntuales.

## Arquitectura operativa

Flujo principal:

1. Ingestion desde `https://www.contraloria.cl`.
2. Persistencia raw en KV `DICTAMENES_SOURCE`.
3. Normalizacion estructural en D1.
4. Enrichment juridico con Mistral.
5. Metadata doctrinal post-enrichment.
6. Vectorizacion hacia Pinecone.
7. Busqueda semantica y fallback SQL.
8. Agrupacion doctrinal, PJO/regimenes y lectura sugerida.
9. Render en frontend.

Bindings productivos relevantes del Worker:

- `DB`: D1 `cgr-dictamenes`.
- `DICTAMENES_SOURCE`: KV de fuente/raw.
- `DICTAMENES_PASO`: KV derivado/cache operacional.
- `WORKFLOW`: `ingest-workflow`.
- `ENRICHMENT_WORKFLOW`: `enrichment-workflow`.
- `VECTORIZATION_WORKFLOW`: `vectorization-workflow`.
- `KV_SYNC_WORKFLOW`: `kv-sync-workflow`.
- `CANONICAL_RELATIONS_WORKFLOW`: `canonical-relations-workflow`.
- `DOCTRINAL_METADATA_WORKFLOW`: `doctrinal-metadata-workflow`.
- `REGIMEN_BACKFILL_WORKFLOW`: `regimen-backfill-workflow`.
- `REPAIR_QUEUE`: queue `repair-nulls-queue`.

Secrets productivos esperados:

- `INGEST_TRIGGER_TOKEN`
- `MISTRAL_API_KEY`
- `MISTRAL_API_KEYS`
- `MISTRAL_API_KEY_CRAWLER_ALE`
- `MISTRAL_API_KEY_IMPORTANTES_OLGA`
- `CF_AIG_AUTHORIZATION`
- `PINECONE_API_KEY`
- `NVIDIA_API_KEY`
- `GEMINI_API_KEYS`
- `GEMINI_BLOCKED_API_KEYS`

No imprimir valores de secrets en logs, README ni commits.

## Endpoints que debe dominar un agente

Base backend:

```text
https://cgr-platform.abogado.workers.dev
```

Salud y estadisticas:

```http
GET /
GET /api/v1/stats
GET /api/v1/analytics/multidimensional
GET /api/v1/admin/migration/info
```

Busqueda y lectura:

```http
GET /api/v1/dictamenes?q=<consulta>&page=1
GET /api/v1/dictamenes/:id
GET /api/v1/dictamenes/:id/lineage
GET /api/v1/dictamenes/:id/history
GET /search?q=<consulta>&limit=10
```

Doctrina e insights:

```http
GET /api/v1/insights/doctrine-search?q=<consulta>&limit=5
GET /api/v1/insights/doctrine-lines?materia=<materia>&limit=5
GET /api/v1/insights/doctrine-guided?q=<consulta>&limit=4
GET /api/v1/insights/doctrine-guided/family?q=<consulta>&family_id=<id>&limit=4
GET /api/v1/analytics/doctrine-clusters?materia=<materia>&limit=5
```

Atencion: las rutas anteriores que generan embeddings dependen hoy de `NVIDIA_EMBEDDING_MODEL`. Al `2026-05-18`, ese modelo esta discontinuado y produce `410 Gone`.

Autocomplete y catalogos:

```http
GET /api/v1/divisions
GET /api/v1/analytics/suggest/materia?q=<texto>
GET /api/v1/analytics/suggest/tags?q=<texto>
GET /api/v1/analytics/statutes/heatmap
GET /api/v1/analytics/topics/trends
```

Regimenes y problemas juridicos operativos publicos:

```http
GET /api/v1/public/regimenes?limit=20&offset=0
GET /api/v1/public/regimenes/:id
GET /api/v1/public/regimenes/:id/dictamenes
GET /api/v1/public/dictamenes/:id/regimen
GET /api/v1/public/pjos?limit=20&offset=0
GET /api/v1/public/pjos/:id/freshness
```

Operaciones administrativas con `x-admin-token: $INGEST_TRIGGER_TOKEN`:

```http
POST /ingest/trigger
POST /api/v1/dictamenes/crawl/range
POST /api/v1/dictamenes/batch-enrich
POST /api/v1/dictamenes/batch-vectorize
POST /api/v1/dictamenes/:id/sync-vector
POST /api/v1/dictamenes/:id/re-process
POST /api/v1/dictamenes/sync-vector-mass
POST /api/v1/jobs/repair-nulls
POST /api/v1/analytics/refresh
POST /api/v1/trigger/kv-sync
POST /api/v1/trigger/canonical-relations
POST /api/v1/trigger/doctrinal-metadata-reprocess
POST /api/v1/admin/relations-gap/analyze
POST /api/v1/admin/doctrinal-metadata/reprocess
POST /api/v1/pilot/regimenes/backfill
GET  /api/v1/regimenes
GET  /api/v1/regimenes/:id
POST /api/v1/admin/regimenes/:id/pjo
GET  /api/v1/admin/pjos
GET  /api/v1/pilot/regimenes/seeds
GET  /api/v1/pilot/regimenes
```

Debug y pruebas externas:

```http
POST /api/v1/debug/cgr
POST /api/v1/test/pinecone
```

Usar estos endpoints con cuidado: pueden tocar servicios externos, costos, estados de pipeline o Pinecone.

## Acceso a datos via Wrangler

Ejecutar desde `cgr-platform/`.

Listar tablas remotas:

```bash
./node_modules/.bin/wrangler d1 execute cgr-dictamenes --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Conteo general:

```bash
./node_modules/.bin/wrangler d1 execute cgr-dictamenes --remote --command "SELECT COUNT(*) AS dictamenes FROM dictamenes;"
```

Estado del pipeline:

```bash
./node_modules/.bin/wrangler d1 execute cgr-dictamenes --remote --command "SELECT estado, COUNT(*) AS n FROM dictamenes GROUP BY estado ORDER BY n DESC;"
```

Dictamen puntual:

```bash
./node_modules/.bin/wrangler d1 execute cgr-dictamenes --remote --command "SELECT id, numero, anio, fecha_documento, estado, materia FROM dictamenes WHERE id = '020445N19';"
```

Metadata doctrinal:

```bash
./node_modules/.bin/wrangler d1 execute cgr-dictamenes --remote --command "SELECT dictamen_id, rol_principal, estado_vigencia, reading_role, currentness_score, confidence_global FROM dictamen_metadata_doctrinal LIMIT 20;"
```

Regimenes y PJOs:

```bash
./node_modules/.bin/wrangler d1 execute cgr-dictamenes --remote --command "SELECT COUNT(*) AS regimenes FROM regimenes_jurisprudenciales; SELECT COUNT(*) AS pjos FROM problemas_juridicos_operativos; SELECT COUNT(*) AS pjo_dictamenes FROM pjo_dictamenes;"
```

Base local de desarrollo:

```bash
npm run d1:sanity
```

Regla operacional: usar `--remote` solo cuando se necesite evidencia productiva. Para pruebas destructivas o exploracion, preferir local o queries `SELECT`.

## Tablas D1 principales

Corpus y pipeline:

- `dictamenes`
- `enriquecimiento`
- `dictamen_events`
- `kv_sync_status`
- `pinecone_sync_status`
- `cat_estado_pipeline`

Doctrina y relaciones:

- `dictamen_relaciones_juridicas`
- `dictamen_relaciones_huerfanas`
- `dictamen_metadata_doctrinal`
- `dictamen_metadata_doctrinal_evidence`
- `doctrine_structure_remediations`

Derivativas canonicas:

- `etiquetas_catalogo`
- `dictamen_etiquetas`
- `fuentes_legales_catalogo`
- `dictamen_fuentes`
- `dictamen_fuentes_legales`

Regimenes y PJO:

- `regimenes_jurisprudenciales`
- `regimen_dictamenes`
- `norma_regimen`
- `regimen_timeline`
- `problemas_juridicos_operativos`
- `pjo_dictamenes`
- `pjo_review_queue`
- `pjo_curation_log`

Agentes y auditoria:

- `skill_events`
- `skill_runs`
- `doctrine_events`

## Desarrollo local

Instalar dependencias por modulo:

```bash
npm install
cd cgr-platform && npm install
cd ../frontend && npm install
```

Backend:

```bash
cd cgr-platform
npm run dev
```

Frontend:

```bash
cd frontend
npm run dev
```

El frontend usa `VITE_API_BASE_URL` si existe. Si no existe, apunta por defecto a:

```text
https://cgr-platform.abogado.workers.dev
```

Build frontend:

```bash
cd frontend
npm run build
```

Deploy backend:

```bash
cd cgr-platform
npm run deploy
```

Deploy frontend Pages:

```bash
cd frontend
npm run build
../cgr-platform/node_modules/.bin/wrangler pages deploy dist --project-name cgr-jurisprudencia-frontend
```

## Runtime agental

El runtime local vive en `agents/` y se compila desde la raiz.

Comandos principales:

```bash
npm run agents:check
npm run agents:test
npm run agents:scan
npm run agents:workflow:check
npm run agents:metadata:audit
npm run agents:embedding:check
npm run agents:doctrine:coherence
npm run agents:ingest:control-plane
```

Skills nativas relevantes:

- `skill_repo_context_scan`: estructura real del repo.
- `skill_workflow_healthcheck`: wiring de workflows.
- `skill_metadata_quality_audit`: auditoria de metadata doctrinal.
- `skill_embedding_consistency_check`: consistencia de embeddings.
- `skill_doctrine_coherence_audit`: coherencia doctrinal.
- `skill_ingest_control_plane`: vista operacional compuesta de ingestion.

Wrappers heredados:

- `legacy_check_env_sanity`
- `legacy_cgr_network_baseurl_verify`

Para tareas Cloudflare, usar la skill `cloudflare` y preferir retrieval de docs/API sobre memoria del modelo.

## Despliegues Cloudflare verificados

Worker `cgr-platform`:

- Ultimo deploy productivo registrado: `2026-04-25T21:40:56.164031Z`.
- Version activa al 100%: `2cdd518e-fda6-4e43-b6c9-8b04544eb7d3`.
- Observability: activada con sampling `1`.
- Logs persistentes de Workers: activados.

Pages `cgr-jurisprudencia-frontend`:

- Ultimo deploy productivo registrado: `2026-04-24T20:11:16.885027Z`.
- Deployment id: `b9a3ef5c-a7c7-4aaa-85db-1df5b216d46c`.
- Commit asociado: `f977eb26f2dde256c205277c4db285871b139400`.
- Usa Functions y comparte bindings D1/KV con el backend.

## Reglas para agentes

1. Leer antes de tocar codigo:
   - `context/project_constitution.md`
   - `context/project_context.md`
   - `context/architecture_map.md`
   - `context/current_priorities.md`
   - `context/glossary.md`
2. Si contexto y codigo discrepan, prevalece el codigo.
3. Documentacion y commits van en español.
4. No tratar previews o aliases auxiliares como URLs canonicas.
5. La busqueda semantica manda; la doctrina organiza.
6. No ejecutar endpoints admin sin confirmar token, impacto y estado esperado.
7. No imprimir ni commitear secrets.
8. Antes de deploy, validar build/smoke test y dejar trazabilidad.
9. Si cambia la realidad operacional, actualizar `context/` y este README.

## Smoke tests utiles

Backend vivo:

```bash
curl -i -sS --max-time 20 https://cgr-platform.abogado.workers.dev/
curl -i -sS --max-time 30 https://cgr-platform.abogado.workers.dev/api/v1/stats
```

D1 publico sin embeddings:

```bash
curl -i -sS --max-time 30 "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes?q=020445N19&page=1"
curl -i -sS --max-time 30 "https://cgr-platform.abogado.workers.dev/api/v1/public/pjos?limit=1"
```

Semantica doctrinal:

```bash
curl -i -sS --max-time 30 "https://cgr-platform.abogado.workers.dev/api/v1/insights/doctrine-search?q=confianza%20legitima&limit=1"
curl -i -sS --max-time 30 "https://cgr-platform.abogado.workers.dev/api/v1/insights/doctrine-lines?limit=1"
```

Al `2026-05-18`, estos ultimos dos smoke tests fallan por el modelo NVIDIA discontinuado. Esa es la primera incidencia operacional a resolver antes de dar por sana la busqueda semantica.
