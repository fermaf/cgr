# Backfill Runbook

## Measure backlog

```bash
wrangler d1 execute cgr-dictamenes --remote --command "SELECT COUNT(*) total_ingested FROM dictamenes WHERE estado='ingested';"
```

## Trigger batch

```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/batch-enrich" \
  -H "Content-Type: application/json" \
  -d '{"batchSize":50,"delayMs":1000}'
```

## Typical adjustments

- 429/timeouts: increase `delayMs`.
- low throughput with no errors: increase `batchSize` moderately.

## Verify progress

```bash
wrangler d1 execute cgr-dictamenes --remote --command "SELECT estado, COUNT(*) c FROM dictamenes GROUP BY estado ORDER BY c DESC;"
```
