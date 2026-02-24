# CGR Platform: Briefing Técnico para Agente Experto

Documento de contexto operativo para agentes LLM que mantengan, depuren y evolucionen `cgr-platform`.

## 1. Misión

Mantener un pipeline confiable sobre Cloudflare que:

- ingeste dictámenes de CGR
- los enriquezca jurídicamente con IA
- los vectorice para búsqueda semántica

## 2. Contexto tecnológico

- Runtime: Cloudflare Workers (TypeScript, ESM)
- Framework API: Hono
- SQL: Cloudflare D1
- KV: `DICTAMENES_SOURCE`, `DICTAMENES_PASO`
- Orquestación: Cloudflare Workflows
- IA: Mistral vía OpenAI SDK (`MISTRAL_API_URL`)
- Vector DB: Pinecone (Integrated Inference)

## 3. Archivos críticos

- `src/index.ts`: API, triggers manuales, cron
- `src/workflows/ingestWorkflow.ts`: crawl por rango/lookback
- `src/workflows/backfillWorkflow.ts`: enrich + vectorize
- `src/workflows/kvSyncWorkflow.ts`: saneamiento histórico KV
- `src/lib/ingest.ts`: normalización + persistencia + catálogos
- `src/storage/d1.ts`: acceso SQL y estado pipeline
- `src/lib/log.ts`: logging estructurado con niveles

## 4. Hechos operativos confirmados (24-feb-2026)

### 4.1 RPC y serialización

Incidente histórico:

- `outcome: exception` + `eventType: rpc` en workflows

Causa corregida:

- capturas de `this` dentro de callbacks `step.do`

Patrón obligatorio actual:

- extraer `env` al inicio de `run`
- usar solo referencias serializables dentro de `step.do`

### 4.2 Esquema productivo real en catálogos

Validado con `wrangler d1 execute --remote`:

- `cat_abogados`: columnas `id`, `iniciales`
- `cat_descriptores`: columnas `id`, `termino`

Consecuencia:

- evitar asumir `cat_abogados.nombre`
- usar fallback de columnas en ingesta

### 4.3 Observabilidad

Se incorporó `LOG_LEVEL` y logging estructurado:

- `debug|info|warn|error`
- eventos `INGEST_*`, `BACKFILL_*`, `KVSYNC_*`, `HTTP*`, `MISTRAL_*_ERROR`

## 5. Reglas de intervención para el agente

1. Toda hipótesis de datos/esquema debe validarse con D1 remoto (`--remote`).
2. No modificar código operativo sin actualizar documentación (`docs/03` y `docs/04`).
3. En Workflows, priorizar idempotencia y pasos pequeños con retorno serializable.
4. Cuando un error sea ambiguo, instrumentar logs antes de proponer refactor mayor.
5. No asumir que "sin procesados" implica fallo; verificar deduplicación vs ausencia real.

## 6. Pendientes recomendados

- definir migraciones D1 versionadas en el repo (`migrations/*.sql`)
- agregar endpoint/control para backfill automático post-ingesta (opcional según costos)
- consolidar autenticación para endpoints administrativos

## 7. Referencias internas

- [Guía de Desarrollo](./03_guia_desarrollo.md)
- [Operación y Mantenimiento](./04_operacion_y_mantenimiento.md)
- [Arquitectura](./02_arquitectura.md)
