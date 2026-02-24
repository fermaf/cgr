---
name: cgr-observability-logs
description: Use this skill when debugging logs, wrangler tail visibility, workflow step errors, and log-level tuning for cgr-platform.
---

# CGR Observability Logs

## Goal

Turn sparse logs into actionable diagnostics.

## Logging model

The project uses structured events from `src/lib/log.ts`.

Main event families:

- HTTP: `HTTP`, `HTTP_ERROR`
- Ingest: `INGEST_RUN_*`
- Backfill: `BACKFILL_RUN_*`
- KV Sync: `KVSYNC_RUN_*`
- Mistral: `MISTRAL_*_ERROR`

## LOG_LEVEL

- `debug`: max verbosity
- `info`: default
- `warn`: warnings/errors
- `error`: errors only

## Workflow

1. Set `LOG_LEVEL=debug` for investigations.
2. Run `wrangler tail`.
3. Trigger one operation.
4. Correlate `workflowId` and `instanceId`.

## References

- `references/event-catalog.md`
