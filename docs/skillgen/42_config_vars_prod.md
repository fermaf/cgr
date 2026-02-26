# Configuracion de variables (staging/prod)

## Objetivo

Evitar drift: no hardcodear flags en `wrangler.jsonc`. Gestionar variables por entorno.

## Variables

- `SKILL_EXECUTION_ENABLED`: controla ejecucion de skills diagnosticas.
- `SKILL_TEST_ERROR`: solo local o staging.
- `INGEST_TRIGGER_TOKEN`: protege `/ingest/trigger` en prod.

## Configuracion con Wrangler (recomendado)

```bash
cd cgr-platform

# Staging
wrangler deploy --env staging --var SKILL_EXECUTION_ENABLED:1 --keep-vars --minify

# Produccion
wrangler deploy --env "" --var SKILL_EXECUTION_ENABLED:1 --keep-vars --minify

# Proteger /ingest/trigger en prod
wrangler secret put INGEST_TRIGGER_TOKEN --env ""
```

## Reglas

- `SKILL_TEST_ERROR` NO debe existir en prod.
- En local, usa `.dev.vars` (no commitear):
  - `SKILL_TEST_ERROR=1` solo para pruebas.
  - `SKILL_EXECUTION_ENABLED=1` si necesitas diagnosticos locales.

## Verificacion (prod o staging)

1. Dispara incidente controlado (prod requiere header):

```bash
curl -sS -X POST https://cgr-platform.abogado.workers.dev/ingest/trigger \
  -H 'Content-Type: application/json' \
  -H 'x-admin-token: <INGEST_TRIGGER_TOKEN>' \
  --data '{"search":"","limit":1,"options":[]}'
```

2. Verifica ejecuciones:

```bash
wrangler d1 execute cgr-dictamenes --remote --command "SELECT id, skill_name, status, mode, created_at FROM skill_runs ORDER BY id DESC LIMIT 10;"
```

## Rollback rapido

```bash
# Deshabilita ejecucion
wrangler deploy --env "" --var SKILL_EXECUTION_ENABLED:0 --keep-vars --minify
```
