# Ingest Triage

1. Check workflow output (`totalFetched`, `totalProcessed`, `totalSkippedExisting`, `reason`).
2. If retries occur, open failing step and copy exact error.
3. Validate D1 schema remotely for impacted table(s).
4. Re-run with narrower date range if needed.

Useful query:

```bash
wrangler d1 execute cgr-dictamenes --remote --command "SELECT id, estado, updated_at FROM dictamenes ORDER BY updated_at DESC LIMIT 20;"
```
