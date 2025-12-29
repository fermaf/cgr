# Endpoints (detalle y contexto)

Este documento describe cada endpoint con su objetivo conceptual, la razon de fondo, ruta de codigo y ejemplos.

## GET /health

**Que hace**: responde un OK simple.
**Para que sirve**: verificar que el worker esta vivo sin tocar recursos externos.
**Ruta de codigo**: `workers-cgr/src/index.ts` (router en `fetch()`)
**Parametros**: ninguno.

Ejemplo:
```bash
curl https://workers-cgr.abogado.workers.dev/health
```

## GET /stats

**Que hace**: devuelve un resumen del estado global.
**Para que sirve**: monitoreo continuo y dashboard.
**Ruta de codigo**: `workers-cgr/src/index.ts` -> `getStats()` en `workers-cgr/src/storage/d1.ts`
**Bemoles**: no expone tamano de cola; solo estado derivado desde D1 y KV.

Ejemplo:
```bash
curl https://workers-cgr.abogado.workers.dev/stats
```

## GET /runs

**Que hace**: lista ejecuciones recientes (run_log).
**Para que sirve**: auditoria de ejecuciones y trazabilidad.
**Ruta de codigo**: `workers-cgr/src/index.ts` -> `listRuns()` en `workers-cgr/src/storage/d1.ts`
**Parametros**:
- `limit` (1-200): cantidad de eventos.

Ejemplo:
```bash
curl "https://workers-cgr.abogado.workers.dev/runs?limit=10"
```

## GET /dictamenes

**Que hace**: lista dictamenes filtrados por estado o flag.
**Para que sirve**: inspeccion operacional sin SQL.
**Ruta de codigo**: `workers-cgr/src/index.ts` -> `listDictamenes()` en `workers-cgr/src/storage/d1.ts`
**Parametros**:
- `estado`: `ingested|enriched|vectorized|error|invalid_input`
- `genera_jurisprudencia`: `0|1|null`
- `limit`, `offset`

Ejemplo:
```bash
curl "https://workers-cgr.abogado.workers.dev/dictamenes?estado=vectorized&limit=50&offset=0"
```

## POST /internal/import

**Que hace**: ingesta RAW puntual.
**Razon de fondo**: cargar dictamenes individuales sin pasar por crawling.
**Ruta de codigo**: `workers-cgr/src/index.ts` -> `handleImport()`
**Bemoles**:
- no llama LLM ni Pinecone si no se usa `enqueue`.
- requiere `IMPORT_TOKEN`.

Body:
```json
{ "items": [ { ... } ] }
```

Ejemplo:
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/import?enqueue=1 \
  -H "content-type: application/json" \
  -H "x-import-token: <token>" \
  -d '{"items":[{...}]}'
```

## POST /internal/import-mongo

**Que hace**: ingesta desde dumps Mongo (RAW + enrichment preexistente).
**Razon de fondo**: poblar el sistema sin volver a llamar LLM/Pinecone.
**Ruta de codigo**: `workers-cgr/src/index.ts` -> `handleImportMongo()`
**Bemoles**:
- si el dictamen ya existe, se omite salvo `backfillExisting=true`.
- requiere `IMPORT_TOKEN`.

Body:
```json
{ "items": [ { ... } ], "backfillExisting": true }
```

Ejemplo:
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/import-mongo \
  -H "content-type: application/json" \
  -H "x-import-token: <token>" \
  -d '{"items":[{...}],"backfillExisting":true}'
```

## POST /internal/crawl-range

**Que hace**: crawl manual con rango de fechas, busqueda (`search`) y filtros CGR.
**Razon de fondo**: procesar periodos especificos sin recorrer todo el historial.
**Ruta de codigo**: `workers-cgr/src/index.ts` -> `handleCrawlRange()` + `workers-cgr/src/services/cgrClient.ts`
**Bemoles**:
- si `disableRange=true`, recorre paginas desde el inicio (mas costoso).
- `limit` max 500 por llamada.
- tambien acepta `search` u `options` sin `from/to` para busqueda directa.
- requiere `IMPORT_TOKEN`.

Body base:
```json
{ "from":"YYYY-MM-DD", "to":"YYYY-MM-DD", "limit":200, "enqueue":true }
```

Ejemplo (rango):
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/crawl-range \
  -H "content-type: application/json" \
  -H "x-import-token: <token>" \
  -d '{"from":"2025-12-01","to":"2025-12-31","limit":200,"enqueue":true}'
```

Ejemplo (rango + filtros):
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/crawl-range \
  -H "content-type: application/json" \
  -H "x-import-token: <token>" \
  -d '{
    "from":"2025-01-01",
    "to":"2025-12-31",
    "limit":50,
    "enqueue":true,
    "options":[{"type":"category","field":"criterio","value":"Genera Jurisprudencia"}]
  }'
```

Ejemplo (search sin rango):
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/crawl-range \
  -H "content-type: application/json" \
  -H "x-import-token: <token>" \
  -d '{"limit":5,"enqueue":false,"search":"E144420N25"}'
```

## POST /internal/process

**Que hace**: ejecuta `enrich` + `vectorize` para un dictamen especifico.
**Razon de fondo**: reproceso puntual con control manual.
**Ruta de codigo**: `workers-cgr/src/index.ts` -> `handleProcess()`
**Bemoles**:
- si falta RAW o `documento_completo`, termina en error.
- requiere `IMPORT_TOKEN`.

Body:
```json
{ "dictamenId":"E000001N25" }
```

## POST /internal/vectorize

**Que hace**: re-upsert a Pinecone usando el enrichment mas reciente.
**Razon de fondo**: corregir o refrescar embeddings sin volver a llamar LLM.
**Ruta de codigo**: `workers-cgr/src/index.ts` -> `handleVectorize()` + `workers-cgr/src/services/pineconeClient.ts`
**Bemoles**:
- requiere enrichment valido en D1.
- requiere `IMPORT_TOKEN`.

Body:
```json
{ "dictamenIds":["E000001N25"] }
```

## POST /internal/recover

**Que hace**: re-encola por estado.
**Razon de fondo**: orquestar reprocesos masivos sin tocar la cola manualmente.
**Ruta de codigo**: `workers-cgr/src/index.ts` -> `handleRecover()`
**Bemoles**:
- no ejecuta LLM ni Pinecone directamente; solo encola.

Body (por estado):
```json
{ "statuses":["error","ingested"], "limit":100 }
```

## POST /internal/recover-fuentes

**Que hace**: re-encola fuentes legales faltantes.
**Razon de fondo**: completar fuentes sin reprocesar todo el dictamen.
**Ruta de codigo**: `workers-cgr/src/index.ts` -> `handleRecoverFuentes()`

## POST /internal/backfill-canonical

**Que hace**: recalcula `canonical_sha256` y `canonical_bytes`.
**Razon de fondo**: sincronizar control de cambios tras cambios de criterio o migraciones.
**Ruta de codigo**: `workers-cgr/src/index.ts` -> `handleBackfillCanonical()` -> `runBackfillCanonical()`
**Bemoles**:
- `force=true` recalcula aunque ya exista hash.

## POST /internal/backfill-documento-missing

**Que hace**: recalcula `documento_completo_missing` desde RAW KV.
**Razon de fondo**: corregir flags faltantes en migraciones antiguas.
**Ruta de codigo**: `workers-cgr/src/index.ts` -> `handleBackfillDocumentoMissing()`

## POST /internal/compare-canonical

**Que hace**: compara canonical entre RAW en KV y respuesta actual de CGR.
**Razon de fondo**: diagnosticar por que el crawl marca cambios cuando no deberia.
**Ruta de codigo**: `workers-cgr/src/index.ts` -> `handleCompareCanonical()`
