---
name: cgr-ingest-workflow-ops
description: Use this skill when operating or debugging IngestWorkflow, including manual crawl range runs, interpretation of fetched/processed/skipped counts, and triage of ingest step failures.
---

# CGR Ingest Workflow Ops

## Goal

Operate `IngestWorkflow` safely and interpret outcomes correctly.

## Key Concepts

- `totalFetched > 0` and `totalProcessed = 0` usually means deduplication, not failure.
- Real failures appear in step retries/errors and logs with `INGEST_RUN_ERROR` / `INGEST_PAGE_ERROR`.

## Manual run

Use `scripts/trigger_crawl_range.sh`.

## Interpretation guide

- `reason = no-results-in-window`: source returned no hits.
- `reason = all-items-already-ingested`: hits existed, all skipped as existing.
- `reason = completed`: new rows were ingested.

## References

- `references/payloads.md`
- `references/triage.md`
