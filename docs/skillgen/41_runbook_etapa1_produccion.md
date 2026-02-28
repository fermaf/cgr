# Runbook Etapa 1 en Produccion

## Objetivo

Dejar Etapa 1 estable en produccion con evidencia en D1.

## 1) Inspeccion de esquema local (solo lectura)

```bash
cd cgr-platform
wrangler d1 execute cgr-dictamenes --local --command "SELECT name, sql FROM sqlite_master WHERE type IN ('table','index') AND name LIKE 'skill_%';"
wrangler d1 execute cgr-dictamenes --local --command "PRAGMA table_info(skill_events);"
```

## 2) Migracion remota (idempotente)

```bash
cd cgr-platform
npx tsx scripts/runMigrationEtapa1.ts --remote
```

## 3) Deploy

```bash
cd cgr-platform
wrangler deploy --minify
```

## 4) Verificacion D1 remoto

```bash
wrangler d1 execute cgr-dictamenes --remote --command "PRAGMA table_info(skill_events);"
wrangler d1 execute cgr-dictamenes --remote --command "SELECT id, code, decision_skill, matched, created_at FROM skill_events ORDER BY id DESC LIMIT 5;"
```

## Panel minimo (3 queries)

```bash
# 1) Ultimos incidentes
wrangler d1 execute cgr-dictamenes --remote --command "SELECT id, code, decision_skill, matched, created_at FROM skill_events ORDER BY id DESC LIMIT 10;"

# 2) Ultimas ejecuciones de skills
wrangler d1 execute cgr-dictamenes --remote --command "SELECT id, skill_name, status, mode, created_at FROM skill_runs ORDER BY id DESC LIMIT 10;"

# 3) Join por fingerprint (incidente + ejecuciones)
wrangler d1 execute cgr-dictamenes --remote --command \"SELECT e.id AS event_id, e.code, r.skill_name, r.status, r.mode, r.created_at FROM skill_events e LEFT JOIN skill_runs r ON e.fingerprint = r.incident_fingerprint ORDER BY e.id DESC LIMIT 10;\"
```

## 5) Rollback minimo

- Re-deploy a la version anterior conocida estable.
- Mantener evidencia en D1 (no borrar).
- Registrar incidente y abrir postmortem.
