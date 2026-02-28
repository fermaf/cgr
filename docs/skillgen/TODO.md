# TODO: Comandos operativos

## Rotar token /ingest/trigger (produccion)

```bash
cd cgr-platform
wrangler secret put INGEST_TRIGGER_TOKEN --env production
```

## Deploy produccion

```bash
cd cgr-platform
wrangler deploy --env production --minify
```

## Verificacion (trigger + skill_runs)

```bash
# Disparar incidente controlado
curl -sS -X POST https://cgr-platform.abogado.workers.dev/ingest/trigger \
  -H 'Content-Type: application/json' \
  -H 'x-admin-token: <INGEST_TRIGGER_TOKEN>' \
  --data '{"search":"","limit":1,"options":[]}'

# Verificar ejecuciones
wrangler d1 execute cgr-dictamenes --remote --command "SELECT id, skill_name, status, mode, created_at FROM skill_runs ORDER BY id DESC LIMIT 10;"
```
