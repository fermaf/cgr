---
name: cgr-production-d1
description: Use this skill for any task that inspects or validates Cloudflare D1 production data and schema in cgr-dictamenes. Trigger when asked to verify counts, inspect columns, validate assumptions, or run SQL diagnostics against real data.
---

# CGR Production D1

## Goal

Run safe, reproducible diagnostics against production D1 (`cgr-dictamenes`) using `--remote`.

## Rules

- Always use `--remote`.
- Never assume table/column names; verify with `PRAGMA table_info(...)`.
- Prefer read-only SQL unless explicitly asked to mutate data.
- Include the exact SQL used in the final report.

## Workflow

1. Confirm database is reachable.
2. Inspect schema for affected tables.
3. Run focused aggregate queries.
4. Run sample row queries (`LIMIT`) to validate interpretation.
5. Summarize findings and contradictions.

## Commands

Use scripts in `scripts/` for consistency.

- `scripts/check_connection.sh`
- `scripts/schema_snapshot.sh`
- `scripts/run_remote_query.sh`

## References

- `references/sql-playbook.md`
