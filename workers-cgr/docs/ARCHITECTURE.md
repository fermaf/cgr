# Arquitectura

## 1) Componentes

- Worker (Cloudflare): orquesta crawling, enrichment, fuentes legales y vectorizacion.
- D1: catalogo de dictamenes, enrichment, run_log y vistas de control.
- KV: RAW JSON y estado de crawl.
- Queue: pipeline asincrono `crawl -> enrich -> fuentes -> vectorize`.
- LLM: analisis y clasificacion.
- Pinecone: embeddings y busqueda semantica.

## 2) Flujo de procesamiento

1) Crawl CGR o import mongo.
2) Inserta/actualiza dictamen + RAW en KV.
3) Enrich (LLM) -> actualiza `dictamen.estado` a `enriched`.
4) Fuentes legales -> completa `fuentes_legales_json`.
5) Vectorize -> `dictamen.estado` a `vectorized`.

## 3) Ciclo de vida de un dictamen

- Busca dictamenes en CGR (con filtros o paginacion).
- Inserta/actualiza `dictamen`.
- Si el hash canonical cambia, se considera modificado y se reingesta.

## 4) Auto-detencion del crawl

- `STABLE_PAGE_RATIO` define el porcentaje de dictamenes sin cambios en una pagina.
- El estado queda en `STATE_KV` bajo `crawl:cgr`.

## 5) Run log

- `run_log` registra cada ejecucion con `run_type` y `status`.
- Sirve para auditoria y dashboard.
