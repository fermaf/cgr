# SQL Playbook (D1 Remote)

## Connectivity

```bash
wrangler d1 list --json
```

## Schema inspection

```bash
wrangler d1 execute cgr-dictamenes --remote --command "PRAGMA table_info(dictamenes);"
wrangler d1 execute cgr-dictamenes --remote --command "PRAGMA table_info(cat_abogados);"
wrangler d1 execute cgr-dictamenes --remote --command "PRAGMA table_info(cat_descriptores);"
```

## Pipeline status

```bash
wrangler d1 execute cgr-dictamenes --remote --command "SELECT estado, COUNT(*) c FROM dictamenes GROUP BY estado ORDER BY c DESC;"
```

## Recency checks

```bash
wrangler d1 execute cgr-dictamenes --remote --command "SELECT id, estado, updated_at FROM dictamenes ORDER BY updated_at DESC LIMIT 20;"
```

## Table DDL

```bash
wrangler d1 execute cgr-dictamenes --remote --command "SELECT sql FROM sqlite_master WHERE type='table' AND name='cat_abogados';"
```
