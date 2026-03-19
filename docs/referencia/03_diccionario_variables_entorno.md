# 03 - Diccionario de Variables y Entorno

Este documento describe la configuración de **CGR-Platform** definida en `wrangler.jsonc`. Estos valores controlan el comportamiento del Worker, los límites de la IA y las conexiones a bases de datos.

---

## 🛠️ Variables Globales (`vars`)

| Variable | Descripción | Valor Local (Ej) |
| :--- | :--- | :--- |
| `ENVIRONMENT` | Entorno de ejecución (`local`, `staging`, `prod`). | `local` |
| `MISTRAL_MODEL` | Modelo de Mistral utilizado para inferencia. | `mistral-large-2512` |
| `LOG_LEVEL` | Nivel de verbosidad del logger (`debug`, `info`, `error`). | `debug` |
| `CRAWL_DAYS_LOOKBACK` | Días de historia a revisar en la ingesta diaria. | `3` |
| `BACKFILL_BATCH_SIZE` | Tamaño de lote para el BackfillWorkflow. | `50` |
| `INGEST_TRIGGER_TOKEN` | Token secreto para disparar jobs administrativos. | `<TU_TOKEN_SECRETO>` |
| `ANALYTICS_CACHE_TTL` | Tiempo de vida (segundos) del cache en KV Paso. | `900` |

---

## 🏗️ Bindings de Infraestructura

### Cloudflare D1 (Bases de Datos Relacionales)
- **Binding**: `DB`
- **Nombre**: `cgr-dictamenes`
- **Uso**: Metadata de dictámenes, tablas de enriquecimiento, analíticas pre-calculadas y logs de auditoría.

### Cloudflare KV (Almacenamiento de Key-Value)
1.  **`DICTAMENES_SOURCE`**: Fuente de verdad. Contiene los JSON originales tal cual se obtienen de la CGR. Inmutable.
2.  **`DICTAMENES_PASO`**: Almacenamiento temporal y caché. Contiene los JSON enriquecidos tras pasar por la IA y resultados de analíticas para acceso rápido.

### Cloudflare Queues
- **Binding**: `REPAIR_QUEUE`
- **Cola**: `repair-nulls-queue`
- **Uso**: Gestión asíncrona de la reparación de registros con `division_id` nulo.

### Cloudflare Workflows
1.  **`WORKFLOW`**: `IngestWorkflow` (Ingesta diaria).
2.  **`BACKFILL_WORKFLOW`**: `BackfillWorkflow` (Enriquecimiento masivo).
3.  **`KV_SYNC_WORKFLOW`**: `KVSyncWorkflow` (Sincronización manual D1 -> Pinecone).

---

## 🔐 Seguridad y Tokens

### `x-admin-token`
Este header es obligatorio para todos los endpoints bajo la ruta `/api/v1/jobs/*` y para triggering de Workflows en producción.
- **Validación**: El Worker compara el header con la variable `INGEST_TRIGGER_TOKEN`.
- **Importante**: No compartas este token fuera de canales seguros.

---

> [!WARNING]
> **Cambios en Configuración**: Cualquier cambio en `wrangler.jsonc` requiere un redeploy del Worker (`npx wrangler deploy`) para que las nuevas variables surtan efecto en el entorno de producción.
