# 3. Guía de Desarrollo

Guía práctica para desarrollar en CGR.ai sin romper producción.

## 3.1 Objetivo técnico del backend

El backend (`cgr-platform`) implementa un pipeline con tres responsabilidades separadas:

- ingesta de documentos desde CGR
- enriquecimiento jurídico asistido por LLM
- vectorización para búsqueda semántica

El diseño evita mezclar estas fases para desacoplar costo de IA, observabilidad y recuperación de errores.

## 3.2 Requisitos de entorno

| Herramienta | Requisito |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| Wrangler | 4.x |
| Cuenta Cloudflare | con acceso al worker y D1 |

Verificación:

```bash
node -v
npm -v
wrangler -v
```

## 3.3 Estructura recomendada de lectura de código

1. `src/types.ts` para comprender bindings/vars
2. `src/index.ts` para endpoints y cron
3. `src/workflows/*.ts` para ciclo de vida de pipeline
4. `src/lib/ingest.ts` para normalización y persistencia
5. `src/storage/d1.ts` para capa SQL
6. `src/clients/*.ts` para integraciones externas

## 3.4 Flujo de desarrollo local

### Backend

```bash
cd cgr-platform
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## 3.5 Variables y secretos

### Vars (`wrangler.jsonc`)

- `APP_TIMEZONE`
- `CGR_BASE_URL`
- `MISTRAL_API_URL`
- `MISTRAL_MODEL`
- `PINECONE_INDEX_HOST`
- `PINECONE_NAMESPACE`
- `CRAWL_DAYS_LOOKBACK`
- `BACKFILL_BATCH_SIZE`
- `BACKFILL_DELAY_MS`
- `LOG_LEVEL`

### Secrets

```bash
wrangler secret put MISTRAL_API_KEY
wrangler secret put PINECONE_API_KEY
wrangler secret put CF_AIG_AUTHORIZATION
```

## 3.6 Reglas de trabajo con datos productivos

- Todo diagnóstico de base debe validarse con `--remote`.
- No asumir esquema D1 por documentos antiguos; confirmar con `PRAGMA table_info(...)`.
- Antes de tocar lógica de catálogo, validar columnas reales en producción.

Comandos de base:

```bash
wrangler d1 execute cgr-dictamenes --remote --command "PRAGMA table_info(cat_abogados);"
wrangler d1 execute cgr-dictamenes --remote --command "PRAGMA table_info(cat_descriptores);"
wrangler d1 execute cgr-dictamenes --remote --command "SELECT estado, COUNT(*) c FROM dictamenes GROUP BY estado;"
```

## 3.7 Patrones obligatorios en Workflows

### Patrón 1: no capturar `this` dentro de `step.do`

Motivo: puede detonar excepciones RPC por serialización.

Correcto:

- declarar `const env = this.env` al inicio de `run`
- usar `env` dentro de callbacks de `step.do`

### Patrón 2: steps con retorno serializable

Cada `step.do` y `run()` debe retornar objetos pequeños y serializables.

### Patrón 3: logs estructurados

Usar `src/lib/log.ts` (`logInfo`, `logWarn`, `logError`) para que `wrangler tail` sea útil.

## 3.8 Incidentes técnicos recientes y aprendizaje

### Incidente A: `outcome: exception` + `eventType: rpc`

- Síntoma: logs de invocación ambiguos (`run`) pese a workflows aparentando avance.
- Causa: clausuras de `step.do` con acceso a `this`.
- Mitigación: blindaje de workflows con variables locales y logging explícito.

### Incidente B: fallos al insertar catálogos

- Síntoma: `table cat_abogados has no column named nombre`.
- Causa: desalineación esquema real vs supuestos de código.
- Producción real: `cat_abogados.iniciales`.
- Mitigación: fallback de columnas en `ingest.ts` (`nombre|termino|iniciales`).

### Incidente C: Iniciales Malformadas y Ruido en Catálogos (27/02/2026)

- Síntoma: `cat_abogados` contenía registros agrupados (ej: "EMV APT") y `cat_descriptores` tenía basura de 1-2 caracteres.
- Causa: La función `extractCommaSeparatedList` no incluía el espacio como delimitador y carecía de filtros Regex robustos.
- Mitigación: Se actualizó el parser con split por `/[\s,;\n]+/` y filtro Regex `/^[A-Z]{2,5}$/`.
- Saneamiento: Se ejecutó ingeniería inversa reprocesando 37 dictámenes para repoblar catálogos.

## 3.9 Checklist antes de merge/deploy

1. `npx tsc --noEmit`
2. revisar logs nuevos si se tocaron workflows
3. validar commands D1 `--remote` para supuestos de esquema
4. documentar cambios en `docs/04` si afectan operación
5. deploy y smoke test de endpoints administrativos

## 3.10 Smoke tests recomendados

```bash
curl https://cgr-platform.abogado.workers.dev/
curl "https://cgr-platform.abogado.workers.dev/api/v1/stats"

curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/crawl/range" \
  -H "Content-Type: application/json" \
  -d '{"date_start":"2025-06-01","date_end":"2025-10-27","limit":2000}'
```

## 3.11 Convención de documentación viva

Si cambias:

- contratos API -> actualizar `docs/04`
- flujo de desarrollo -> actualizar este documento
- arquitectura -> actualizar `docs/02`
- runbooks y troubleshooting -> actualizar `docs/04`
