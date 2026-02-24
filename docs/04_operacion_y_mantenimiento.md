# 4. Operación y Mantenimiento

Manual operativo para mantener el sistema en producción con criterio de ingeniería.

## 4.1 Principios operativos

- Producción primero: validar hipótesis con datos reales (`wrangler ... --remote`).
- Separación de fases: ingesta no implica enriquecimiento automático.
- Observabilidad útil: logs estructurados y trazables por workflow/endpoint.
- Recuperación incremental: corregir causa raíz antes de relanzar lotes masivos.

## 4.2 Despliegue

### Backend

```bash
cd cgr-platform
npx wrangler deploy
```

### Frontend

```bash
cd frontend
npm run build
npx wrangler pages deploy dist --project-name cgr-jurisprudencia
```

## 4.3 Variables y configuración crítica

En `cgr-platform/wrangler.jsonc`:

- `CRAWL_DAYS_LOOKBACK`
- `BACKFILL_BATCH_SIZE`
- `BACKFILL_DELAY_MS`
- `LOG_LEVEL` (`debug|info|warn|error`)

Recomendación:

- operación normal: `LOG_LEVEL=info`
- debugging temporal: `LOG_LEVEL=debug`

## 4.4 Cron y ejecución manual

### Cron

- Trigger configurado en worker (`triggers.crons`)
- crea instancia de `IngestWorkflow` con `lookbackDays`

Importante:

- cron solo ingesta
- no dispara backfill automáticamente

### Crawl manual por rango

```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/crawl/range" \
  -H "Content-Type: application/json" \
  -d '{
    "date_start": "2025-06-01",
    "date_end": "2025-10-27",
    "limit": 50000
  }'
```

Validaciones del endpoint:

- formato `YYYY-MM-DD`
- `date_start <= date_end`
- `limit` acotado

### Backfill manual

```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/batch-enrich" \
  -H "Content-Type: application/json" \
  -d '{"batchSize":50,"delayMs":1000}'
```

## 4.5 Endpoint inventory

### GET

- `/api/v1/stats`
- `/api/v1/dictamenes?q=...&page=...`
- `/api/v1/dictamenes/:id`
- `/search` (legacy)

### POST administrativos

- `/api/v1/dictamenes/crawl/range`
- `/api/v1/dictamenes/batch-enrich`
- `/api/v1/dictamenes/:id/re-process`
- `/api/v1/dictamenes/:id/sync-vector`
- `/ingest/trigger`
- `/api/v1/trigger/kv-sync`
- `/api/v1/debug/cgr`

## 4.6 Observabilidad práctica

### Wrangler tail

```bash
cd cgr-platform
wrangler tail
```

Eventos esperados:

- HTTP: `HTTP`, `HTTP_ERROR`
- Ingesta: `INGEST_RUN_START`, `INGEST_RUN_DONE`, `INGEST_RUN_ERROR`
- Backfill: `BACKFILL_RUN_*`
- KV sync: `KVSYNC_RUN_*`
- IA: `MISTRAL_*_ERROR`

### Dashboard Cloudflare

- Workflows: estado, pasos, retries y salida
- Observabilidad: invocaciones + custom logs
- D1 Studio: inspección puntual (no reemplaza consultas auditables por CLI)

## 4.7 Comandos de diagnóstico remoto (`--remote`)

### Estado de pipeline

```bash
wrangler d1 execute cgr-dictamenes --remote --command "SELECT estado, COUNT(*) c FROM dictamenes GROUP BY estado ORDER BY c DESC;"
```

### Últimos dictámenes actualizados

```bash
wrangler d1 execute cgr-dictamenes --remote --command "SELECT id, estado, updated_at FROM dictamenes ORDER BY updated_at DESC LIMIT 20;"
```

### Verificación de esquema de catálogos

```bash
wrangler d1 execute cgr-dictamenes --remote --command "PRAGMA table_info(cat_abogados);"
wrangler d1 execute cgr-dictamenes --remote --command "PRAGMA table_info(cat_descriptores);"
```

## 4.8 Runbook: backlog alto de `ingested`

1. Medir backlog real:

```bash
wrangler d1 execute cgr-dictamenes --remote --command "SELECT COUNT(*) total_ingested FROM dictamenes WHERE estado='ingested';"
```

2. Ejecutar backfill por lotes sostenibles (ej. `50/1000ms`).
3. Monitorear error rate en workflow.
4. Ajustar `delayMs` si aparecen `429` o timeout de proveedor IA.

## 4.9 Troubleshooting por síntoma

### Síntoma: workflow con retries en `process-page-*`

Revisar error exacto del paso en dashboard y correlacionar con logs estructurados.

### Síntoma: dictámenes detectados pero `processed=0`

Interpretación posible:

- ya existen en D1 y fueron deduplicados
- revisar salida de ingest (`totalFetched`, `totalProcessed`, `totalSkippedExisting`)

### Síntoma: error SQL de columna inexistente en catálogo

Caso real detectado en producción:

- error: `table cat_abogados has no column named nombre`
- esquema real: `cat_abogados.iniciales`

Mitigación aplicada:

- fallback de columnas en ingesta (`nombre|termino|iniciales`)

### Síntoma: logs pobres en tail

Acción:

- subir `LOG_LEVEL=debug`
- redeploy
- repetir flujo

## 4.10 Política de cambios operativos

Toda modificación que cambie comportamiento de:

- cron
- endpoints administrativos
- workflows
- observabilidad

Debe venir con:

1. actualización de este documento
2. comandos de validación post-deploy
3. rollback plan (si aplica)

## 4.11 Validación post-deploy mínima

```bash
curl https://cgr-platform.abogado.workers.dev/
curl "https://cgr-platform.abogado.workers.dev/api/v1/stats"

wrangler d1 execute cgr-dictamenes --remote --command "SELECT estado, COUNT(*) c FROM dictamenes GROUP BY estado;"
```
