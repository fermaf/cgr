# Payloads

## Crawl by explicit date range

```json
{
  "date_start": "2025-06-01",
  "date_end": "2025-10-27",
  "limit": 50000
}
```

## Trigger endpoint

```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/crawl/range" \
  -H "Content-Type: application/json" \
  -d '{"date_start":"2025-06-01","date_end":"2025-10-27","limit":50000}'
```
