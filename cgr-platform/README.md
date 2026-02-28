# cgr-platform

Backend productivo de CGR.ai: Cloudflare Worker (TypeScript + Hono) con D1, KV y Workflows.

## Responsabilidad del servicio

- exponer API pública de consulta
- orquestar ingesta desde CGR
- ejecutar enriquecimiento jurídico con Mistral
- sincronizar y mantener estado de pipeline en D1/KV/Pinecone

## Entrypoints clave

- HTTP API: `src/index.ts`
- Ingesta: `src/workflows/ingestWorkflow.ts`
- Backfill IA: `src/workflows/backfillWorkflow.ts`
- Saneamiento KV: `src/workflows/kvSyncWorkflow.ts`

## Entorno local

```bash
npm install
npm run dev
```

URL local por defecto: `http://localhost:8787`

## Skillgen local (sin --persist-to)

Ejecuta siempre desde `cgr-platform` para usar la misma BD local por defecto:

```bash
npm run d1:sanity
```

Prueba error real (CGR_BASE_URL inválida):

1) Cambia temporalmente `CGR_BASE_URL` en `wrangler.jsonc` a `https://invalid.invalid`.
2) Corre `npm run dev`.
3) Dispara:

```bash
curl -sS -X POST http://localhost:8787/ingest/trigger \
  -H 'Content-Type: application/json' \
  --data '{"search":"","limit":1,"options":[]}'
```

4) Verifica inserts:

```bash
wrangler d1 execute cgr-dictamenes --local --command "SELECT COUNT(*) AS n FROM skill_events;"
```

Prueba error sintético (SKILL_TEST_ERROR=1):

1) Restaura `CGR_BASE_URL` a `https://www.contraloria.cl` y setea `SKILL_TEST_ERROR` en `wrangler.jsonc` a `"1"`.
2) Repite `npm run dev` y el `curl` anterior.
3) Verifica inserts y revisa logs (`INCIDENT.code` debe ser `WORKFLOW_TEST_ERROR`).

Al terminar, deja `CGR_BASE_URL` correcto y `SKILL_TEST_ERROR` en `"0"`.

## Comandos operativos frecuentes

### Deploy

```bash
npx wrangler deploy
```

### Tail de logs

```bash
npx wrangler tail
```

### Consultas D1 en producción

```bash
wrangler d1 execute cgr-dictamenes --remote --command "SELECT estado, COUNT(*) c FROM dictamenes GROUP BY estado;"
```

## Variables de entorno clave

Definidas en `wrangler.jsonc`:

- `ENVIRONMENT` (`local|prod|unknown`)
- `CGR_BASE_URL`
- `MISTRAL_API_URL`
- `MISTRAL_MODEL`
- `PINECONE_INDEX_HOST`
- `PINECONE_NAMESPACE`
- `CRAWL_DAYS_LOOKBACK`
- `BACKFILL_BATCH_SIZE`
- `BACKFILL_DELAY_MS`
- `LOG_LEVEL` (`debug|info|warn|error`)

Secrets:

- `CGR_API_TOKEN` (obligatorio en `ENVIRONMENT=prod`)
- `MISTRAL_API_KEY`
- `PINECONE_API_KEY`
- `CF_AIG_AUTHORIZATION` (si aplica por gateway)

## Observabilidad

El sistema usa logging estructurado en `src/lib/log.ts`.

Convención de eventos:

- HTTP: `HTTP`, `HTTP_ERROR`
- Ingest: `INGEST_RUN_START`, `INGEST_RUN_DONE`, `INGEST_RUN_ERROR`
- Backfill: `BACKFILL_RUN_START`, `BACKFILL_RUN_DONE`, `BACKFILL_RUN_ERROR`
- KV Sync: `KVSYNC_RUN_START`, `KVSYNC_RUN_DONE`, `KVSYNC_RUN_ERROR`
- Mistral: `MISTRAL_*_ERROR`

## Incidente relevante resuelto

Desalineación de esquema en producción:

- `cat_abogados` usa columna `iniciales` (no `nombre`).
- La ingesta ahora prueba columnas candidatas y cae a fallback compatible.

Archivo del fix: `src/lib/ingest.ts`.

## Más detalle

- Desarrollo: [../docs/03_guia_desarrollo.md](../docs/03_guia_desarrollo.md)
- Operación: [../docs/04_operacion_y_mantenimiento.md](../docs/04_operacion_y_mantenimiento.md)
- Arquitectura: [../docs/02_arquitectura.md](../docs/02_arquitectura.md)
