---
name: cgr-backfill-workflow-ops
description: Use this skill for backfill operations: batch-enrich triggering, batch tuning, error-rate control, and backlog burn-down using production-safe commands.
---

# CGR Backfill Workflow Ops

## Goal

Process `ingested` backlog into `vectorized` with controlled throughput.

## Operating defaults

- Start with `batchSize=50` and `delayMs=1000`.
- Increase throughput gradually after observing error rate.

## Workflow

1. Measure backlog.
2. Trigger backfill batch.
3. Observe workflow errors and provider limits.
4. Adjust `delayMs`/`batchSize`.

## References

- `references/backfill-runbook.md`
