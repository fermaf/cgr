# Codemap

## 1) Router y endpoints

| Endpoint | Que hace | Codigo |
| --- | --- | --- |
| GET /health | healthcheck | `src/index.ts` |
| GET /stats | resumen estado | `src/index.ts` -> `getStats()` |
| GET /runs | run_log recientes | `src/index.ts` -> `listRuns()` |
| GET /dictamenes | listado paginado | `src/index.ts` -> `listDictamenes()` |
| POST /internal/crawl-range | crawl manual | `handleCrawlRange()` |
| POST /internal/import | ingesta RAW | `handleImport()` |
| POST /internal/import-mongo | migracion Mongo | `handleImportMongo()` |
| POST /internal/process | enrich + vectorize | `handleProcess()` |
| POST /internal/vectorize | revectorize | `handleVectorize()` |
| POST /internal/recover | re-encolar | `handleRecover()` |

## 2) Run log

- `run_log`: `startRun()` / `finishRun()` en `src/storage/d1.ts`.

## 3) Crawl CGR

- `fetchDictamenesPage()` paginacion base.
- `fetchDictamenesSearchPage()` con filtros.
- `handleCrawlRange()` para crawl manual.
