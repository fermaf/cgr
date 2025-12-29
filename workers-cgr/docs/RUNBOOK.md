# Runbook

Guia tecnica para despliegue, variables y verificaciones rapidas.

## 1) Variables y secretos

Variables (wrangler.jsonc):
- `CGR_BASE_URL`
- `DAILY_QUOTA`
- `QUOTA_RESERVE_RATIO`
- `APP_TIMEZONE`
- `CRON_PAUSED`
- `PIPELINE_PAUSED`
- `BACKFILL_CANONICAL`
- `BACKFILL_CANONICAL_LIMIT`
- `BACKFILL_DOCUMENTO_MISSING`
- `BACKFILL_DOCUMENTO_MISSING_LIMIT`
- `STABLE_PAGE_THRESHOLD`
- `STABLE_PAGE_RATIO`
- `PINECONE_INDEX_HOST`
- `PINECONE_NAMESPACE`
- `MISTRAL_RETRY_MAX`
- `MISTRAL_RETRY_BASE_MS`
- `MISTRAL_MIN_INTERVAL_MS`
- `MISTRAL_429_BACKOFF_MS`
- `MISTRAL_429_THRESHOLD`

Secrets (Cloudflare):
- `MISTRAL_API_KEY`
- `PINECONE_API_KEY`
- `IMPORT_TOKEN`

## 2) Deploy

```bash
wrangler deploy
```

## 3) Verificaciones rapidas

Estado general:
```bash
curl https://workers-cgr.abogado.workers.dev/health
curl https://workers-cgr.abogado.workers.dev/stats
```

Ultimas ejecuciones:
```bash
curl https://workers-cgr.abogado.workers.dev/runs?limit=10
```

## 4) Reprocesos controlados

Re-encolar errores:
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/recover \
  -H "content-type: application/json" \
  -H "x-import-token: <token>" \
  -d '{"statuses":["error"],"limit":100}'
```

Backfill canonico:
```bash
curl -X POST https://workers-cgr.abogado.workers.dev/internal/backfill-canonical \
  -H "content-type: application/json" \
  -H "x-import-token: <token>" \
  -d '{"limit":100}'
```

## 5) D1 queries utiles

Cantidad por estado:
```bash
wrangler d1 execute cgr-d1 --remote --command \
"SELECT estado, COUNT(*) FROM dictamen GROUP BY estado;"
```

Pendientes canonico:
```bash
wrangler d1 execute cgr-d1 --remote --command \
"SELECT COUNT(*) FROM dictamen WHERE canonical_sha256 IS NULL OR canonical_bytes IS NULL;"
```
