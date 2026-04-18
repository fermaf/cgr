# 02 - Diccionario Profundo de Variables de Entorno y Arquitectura (`wrangler.jsonc`)

> [!IMPORTANT]
> **Tipo Diátaxis**: Referencia. Este documento no enumera valores; desmenuza las implicancias que cada variable, *binding* y secreto tiene sobre la estabilidad transaccional de **CGR-Platform**. Cualquier alteración a estos valores modifica profundamente el comportamiento de Edge (Cloudflare).

Esta topología se administra desde `wrangler.jsonc` (y ocultamente desde `.dev.vars` / Interfaz web de Cloudflare para los Secretos).

---

## 🛠️ 1. Entorno y Tuning Operacional (Variables)

Las `vars` rigen el comportamiento aplicativo del código TypeScript desplegado.

| Variable | Tipo y Valor Típico | Impacto de Arquitectura y Razones de Diseño |
| :--- | :--- | :--- |
| `ENVIRONMENT` | Enum de String (`local` / `staging` / `prod`) | Identifica el contexto de ejecución real del Worker. Hoy `staging` y `prod` comparten recursos físicos en `wrangler.jsonc`, por lo que el valor sirve principalmente para trazabilidad, guardas operativas y auditoría; no garantiza aislamiento de datos. |
| `APP_TIMEZONE` | `America/Santiago` | Estándar base para cronjobs. Si CGR publica fallos a las 11:59PM en Chile, el Cron debe dispararse respetando esta franja y no `UTC`, para no adelantar ni retrasar los "días retroactivos". |
| `LOG_LEVEL` | Enum (`debug` / `info` / `error`) | Nivel de verbosidad del logger (`src/lib/log.ts`). En `debug` expones cargas completas en el `wrangler tail`, ideal pero extremadamente devorador de memoria en producción si se mantiene prolongado. |

---

## 🤖 2. IA Configurations (Modelos y Latencia)

| Variable | Impacto de Arquitectura y Razones de Diseño |
| :--- | :--- |
| `MISTRAL_MODEL` | (Ej: `mistral-large-2512`). Si modificas esta cadena, apagarás retroactivamente el seguimiento heurístico de tu base de datos si ingresas un nombre falso. Mistral Large exige ventanas de contexto amplias; si reduces el modelo a `mistral-small`, los prompts consolidados se cortarán a medias arrojando errores 400 por límite de *tokens*. |
| `MISTRAL_API_URL` | Define la puerta de enlace (`gateway.ai.cloudflare.com/...`). Forzar el paso a través de Cloudflare AI Gateway provee observabilidad, métricas de latencia de LLM y cache sin impacto en la API Key real de Mistral. |
| `PINECONE_INDEX_HOST` / `PINECONE_NAMESPACE` | Rutas directas hacia nuestra memoria matemática para *Búsqueda Híbrida*. Nunca las mezcles; si cambias el modelo de *embeddings*, debes purgar y cambiar el namespace para evitar chocar vectores antiguos (1024 dims) con los nuevos. |

---

## 🚦 3. Variables de Control de Acelerador (Workflows)

**Estas son las válvulas del motor asíncrono para Ingesta**. Modificarlas de golpe provoca fallas críticas.

| Variable | Razón del Límite Estructural |
| :--- | :--- |
| `CRAWL_DAYS_LOOKBACK` | `3`. El Cronjob diario buscará dictámenes ignorados en los últimos 3 días. Subirlo a `30` en un cron diario provocará que el web-scraper sature y sea baneado por la WAF de CGR (Contraloría). |
| `BACKFILL_BATCH_SIZE` | `50`. Tamaño máximo del lote usado por `EnrichmentWorkflow` y `VectorizationWorkflow`. Mantener un batch acotado evita `step.do` demasiado largos y hace más predecible el reciclado de cuotas. |
| `BACKFILL_DELAY_MS` | `500`. Freno de mano común para ambas colas. En enrichment protege la cuota de LLM; en vectorización, amortigua picos de upsert a Pinecone. |
| `ANALYTICS_CACHE_TTL_SECONDS`| `900`. 15 Minutos de vida del Snapshot para la ruta del Heatmap. Bajar esto significa aplastar la base de datos D1 con agrupaciones pesadas. |

---

## 🔐 4. Secretos Críticos

Son parámetros invisibles en el repositorio inyectados mediante:
`npx wrangler secret put TU_SECRETO --env prod`

| Secreto de Infraestructura | Función y Consecuencia de Fuga |
| :--- | :--- |
| Secreto de Infraestructura | Función y Consecuencia de Fuga |
| :--- | :--- |
| `MISTRAL_API_KEY` | Autenticación real frente al proveedor de Inferencia (Pool global). Si es robada, agota el presupuesto corporativo. |
| `MISTRAL_API_KEY_CRAWLER_ALE` | Clave exclusiva para el flujo de nuevos dictámenes recolectados por el Crawler (estado `ingested`). |
| `MISTRAL_API_KEY_IMPORTANTES_OLGA` | Clave exclusiva para el flujo de dictámenes importantes/boletín (estado `ingested_importante`). |
| `GEMINI_API_KEY` | Autenticación para Google AI Studio. **Deprecada para enriquecimiento doctrinal** (migrada a Mistral Olga), mantenida para tareas generativas auxiliares o boletines. |
| `PINECONE_API_KEY` | Autenticación frente a la BBDD Vectorial. Evita inserción de tensores corrompidos. |
| `INGEST_TRIGGER_TOKEN` | (Alias: `x-admin-token`). Llave de paso maestra del Sistema CGR. Controla los endpoints de re-escritura masiva de D1 y disparo de colas operativas (`POST /api/v1/dictamenes/batch-enrich`, `POST /api/v1/dictamenes/batch-vectorize`). Si alguien externa posee esta clave, puede detonar workflows recursivos y costo operativo. **Debe ser aleatorio, criptográficamente seguro y rotarse cada N meses**. |
