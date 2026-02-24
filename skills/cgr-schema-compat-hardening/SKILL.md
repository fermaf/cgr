---
name: cgr-schema-compat-hardening
description: Use this skill when SQL errors suggest schema drift between expected and real production D1 tables (missing columns, naming differences, compatibility fixes).
---

# CGR Schema Compatibility Hardening

## Goal

Resolve production failures caused by schema/code mismatches without blind assumptions.

## Workflow

1. Capture exact SQL error from workflow step.
2. Verify production schema with `PRAGMA table_info(...)` (`--remote`).
3. Confirm DDL from `sqlite_master`.
4. Patch code for compatibility or design migration.
5. Re-run failing workflow on a narrow scope.

## Preferred strategy

- Immediate stability: code fallback across known column variants.
- Long-term cleanup: explicit D1 migration scripts.

## References

- `references/incident-patterns.md`
