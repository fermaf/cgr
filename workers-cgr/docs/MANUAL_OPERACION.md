# Manual de operacion

Este manual explica el uso diario del sistema, la cola, el dashboard y los reprocesos.

## 1) Conceptos clave

- **Dictamen**: unidad base del flujo.
- **RAW**: JSON original de CGR o Mongo (se guarda en KV).
- **Enrichment**: salida de LLM.
- **Vectorize**: upsert en Pinecone.
- **Cola**: lista de tareas asincronas (`cgr-pipeline`).

## 2) Arranque operativo

Para que el sistema procese:
1) `PIPELINE_PAUSED=false`
2) debe haber mensajes en la cola.

El crawl automatico se controla con:
- `CRON_PAUSED=true/false`

## 3) Dashboard (uso rapido)

Secciones principales:
- **Resumen general**: distribucion por estado.
- **Trabajo en curso**: pendientes por etapa.
- **Errores**: volumen y tipo.
- **Programador manual**: ejecutar endpoints sin CLI.

## 4) Ejecuciones manuales (sin CLI)

En el dashboard puedes:
- Ejecutar crawl con rango y filtros CGR.
- Reprocesar errores o vectorizados.
- Hacer backfill de canonical o documento faltante.

## 5) Endpoints operativos (con token)

Re-encolar errores:
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/recover \
  -H "content-type: application/json" \
  -H "x-import-token: <token>" \
  -d '{"statuses":["error"],"limit":500}'
```

Re-encolar enrichment vacio:
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/recover \
  -H "content-type: application/json" \
  -H "x-import-token: <token>" \
  -d '{"emptyEnrichment":true,"limit":500}'
```

Crawl por rango:
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/crawl-range \
  -H "content-type: application/json" \
  -H "x-import-token: <token>" \
  -d '{"from":"2025-12-18","to":"2025-12-19","limit":200,"enqueue":true}'
```

Crawl con filtros CGR:
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

Backfill canonico por rango:
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/backfill-canonical \
  -H "content-type: application/json" \
  -H "x-import-token: <token>" \
  -d '{"limit":200,"force":true,"from":"2025-11-01","to":"2025-12-31"}'
```

Comparar canonical KV vs CGR:
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/compare-canonical \
  -H "content-type: application/json" \
  -H "x-import-token: <token>" \
  -d '{"dictamenId":"E000001N25"}'
```

## 6) Errores frecuentes

- `invalid_input`: falta `documento_completo` o exceso de tokens.
- `invalid_enrichment`: LLM devolvio campos vacios.
- `error`: fallas externas (LLM, Pinecone, red).

## 7) Cola y consumo

- La cola se consume dentro del mismo Worker.
- Si `PIPELINE_PAUSED=true`, la cola no se procesa.
- En Cloudflare UI puedes ver backlog y tasa de consumo.

## 8) Limites de LLM

- `MISTRAL_MIN_INTERVAL_MS`: intervalo minimo entre llamadas.
- `MISTRAL_RETRY_MAX`: reintentos por request.
- `MISTRAL_429_THRESHOLD` + `MISTRAL_429_BACKOFF_MS`: backoff ante 429 repetidos.

## 9) Backfill automatico

- `BACKFILL_CANONICAL=true` ejecuta backfill en cada cron.
- Mientras esta activo, el cron no hace crawl.
