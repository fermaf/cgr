# 4. Operación y Mantenimiento

## 4.1 Despliegue

### Backend (Cloudflare Worker)
```bash
cd cgr-platform
npx wrangler deploy
```
Esto compila TypeScript, empaqueta el Worker y lo despliega. El output confirma:
- URL del worker
- Cron schedule activo
- Workflows registrados

### Frontend (Cloudflare Pages)
```bash
cd frontend
npm run build
npx wrangler pages deploy dist --project-name cgr-jurisprudencia
```

O bien via Git: cualquier push a `main` dispara el build automático si se configuró CI/CD en el Dashboard de Pages.

### Gestión de Secrets
```bash
# Listar secrets actuales
npx wrangler secret list

# Configurar un secret
npx wrangler secret put CF_AIG_AUTHORIZATION
# (pegar el valor cuando se solicite)

# Secrets obligatorios en producción:
# - PINECONE_API_KEY
# - MISTRAL_API_KEY
# - CF_AIG_AUTHORIZATION
```

---

## 4.2 Cron Job Automático

| Config | Valor |
|---|---|
| Schedule | `0 */6 * * *` (cada 6 horas: 00:00, 06:00, 12:00, 18:00 UTC) |
| Acción | Lanza `IngestWorkflow` con `lookbackDays: 3` |
| Alcance | Busca dictámenes nuevos de los últimos 3 días en CGR.cl |
| Paginación | Hasta 50 páginas automáticamente (~1.000 dictámenes máximo) |
| Deduplicación | Si el dictamen ya existe en D1 y no está en `error`, lo omite |

> [!IMPORTANT]
> **El cron solo hace ingesta (estado `ingested`). NO enriquece ni vectoriza.** Para procesar los `ingested` pendientes, se necesita ejecutar `batch-enrich` manual o automáticamente.

Para hacer que el cron también enriquezca, se necesitaría agregar una segunda llamada a `BACKFILL_WORKFLOW` en el handler `scheduled` de `index.ts`.

---

## 4.3 Catálogo de Endpoints

URL base de producción: `https://cgr-platform.abogado.workers.dev`

### Endpoints de Consulta (GET)

#### `GET /api/v1/stats`
Estadísticas generales del repositorio.
```bash
curl -s "https://cgr-platform.abogado.workers.dev/api/v1/stats"
```
```json
{"total": 84973, "last_updated": "2026-02-22T13:58:26", "by_year": [{"anio": 2025, "count": 820}, ...]}
```

#### `GET /api/v1/dictamenes?q=...&page=1`
Búsqueda de dictámenes. Intenta búsqueda vectorial (Pinecone) primero; si falla, degrada a SQL.
```bash
curl -s "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes?q=probidad+contratos&page=1"
```
Respuesta: `{ data: [...], meta: { page, limit, total, totalPages } }`

Cada resultado incluye `origen_busqueda: 'vectorial'|'literal'` para que el frontend muestre el badge correspondiente.

#### `GET /api/v1/dictamenes/:id`
Detalle completo de un dictamen. Consolida D1 + KV + enrichment.
```bash
curl -s "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/E129499N25"
```
```json
{
  "meta": { "id": "E129499N25", "numero": "129499", "fecha_documento": "2025-01-15", ... },
  "raw": { /* JSON crudo original de CGR */ },
  "extrae_jurisprudencia": {
    "titulo": "Procedencia de pagos de reajustes y bonos...",
    "resumen": "Se aborda la procedencia del pago...",
    "analisis": "El dictamen examina...",
    "etiquetas": ["laboral", "municipal", "educación"],
    "genera_jurisprudencia": false
  }
}
```

#### `GET /search?q=...&limit=10`
Endpoint legacy. Búsqueda vectorial directa contra Pinecone. Mantenido por compatibilidad.

### Endpoints Administrativos (POST)

#### `POST /api/v1/dictamenes/crawl/range`
Crawl manual de un rango de fechas.
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/crawl/range" \
  -H "Content-Type: application/json" \
  -d '{"date_start": "2024-06-01", "date_end": "2024-12-30"}'
```
```json
{"success": true, "workflowId": "17b61215-..."}
```
Los dictámenes quedan como `ingested` — requieren `batch-enrich` posterior.

#### `POST /api/v1/dictamenes/batch-enrich`
Procesa un lote de dictámenes `ingested` → Mistral → Pinecone → `vectorized`.
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/batch-enrich" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 50, "delayMs": 1000}'
```
```json
{"success": true, "workflowId": "e5ccbd39-..."}
```

El workflow retorna un resumen al finalizar:
```json
{"total": 50, "ok": 50, "error": 0, "mensaje": "Backfill completado: 50 vectorizados, 0 errores de 50 procesados."}
```

Tiempo estimado: ~10 minutos para 50 dictámenes con `delayMs: 1000`.

#### `POST /api/v1/dictamenes/:id/re-process`
Reprocesa un dictamen individual desde cero (Mistral + Pinecone), incluso si ya estaba `vectorized`.
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/E129499N25/re-process"
```
```json
{"success": true, "message": "Reproceso integral completado con exito"}
```

#### `POST /api/v1/dictamenes/:id/sync-vector`
Re-sube a Pinecone un dictamen ya enriquecido, SIN invocar a Mistral (ahorra costos IA).
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/D56N26/sync-vector"
```
```json
{"success": true, "message": "Vector sync done."}
```

---

## 4.4 Workflows en el Dashboard

Los workflows se pueden monitorear en: **Dashboard Cloudflare → Compute → Workflows**

Cada workflow instance muestra:
- **Estado**: Ejecutándose / Completado / Error
- **Pasos completados**: Contador de steps procesados
- **Salida**: JSON con el resumen final (`{total, ok, error, mensaje}`)
- **Historial de pasos**: Listado con duración individual y logs

Para ver los logs detallados de cada step, haga clic en el ícono `+` a la derecha del paso. Los `console.log` aparecen ahí y también en **Observabilidad → Logs** en el Dashboard.

---

## 4.5 Observabilidad

### Cloudflare Dashboard
- **Observabilidad**: Logs de invocación con tipo, timestamp y status code
- **Workflows**: Estado en vivo de cada workflow instance
- **D1**: Métricas de uso (queries/día, rows leídas/escritas)
- **KV**: Operaciones de lectura/escritura

### Línea de comandos
```bash
# Estado actual de la base de datos
npx wrangler d1 execute cgr-dictamenes --remote \
  --command="SELECT estado, COUNT(*) as count FROM dictamenes GROUP BY estado ORDER BY count DESC"

# Últimos dictámenes procesados
npx wrangler d1 execute cgr-dictamenes --remote \
  --command="SELECT id, estado, updated_at FROM dictamenes ORDER BY updated_at DESC LIMIT 10"

# Verificar secrets configurados
npx wrangler secret list
```

---

## 4.6 Troubleshooting

### Error: `401 Unauthorized` en Mistral
**Causa**: Falta el secret `CF_AIG_AUTHORIZATION` en producción.
```bash
npx wrangler secret put CF_AIG_AUTHORIZATION
# Pegar: Bearer <token del AI Gateway>
```

### Error: `400 INVALID_ARGUMENT: expected 'object', but found 'array'` en Pinecone
**Causa**: El payload de upsert se envió como array `[{...}]` en lugar de objeto `{...}`.
**Solución**: Verificar que `pinecone.ts` envíe `{_id, ...fields}` sin envolver en array.

### Error: `429 Too Many Requests` en Mistral
**Causa**: Rate limit del AI Gateway excedido.
**Solución**: Aumentar `BACKFILL_DELAY_MS` a `2000`+ o reducir `batchSize`.

### Error: `Vector dimension 256 does not match the dimension of the index 1024`
**Causa**: Algún fallback intentó usar un modelo de embedding diferente.
**Solución**: Usar siempre `fetch` crudo y Pinecone Integrated Inference. No instalar `@pinecone-database/pinecone`.

### Dictámenes atascados en `enriched`
**Causa**: Mistral procesó exitosamente pero Pinecone falló después.
**Solución**: Ejecutar `sync-vector` para cada dictamen afectado.
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/{ID}/sync-vector"
```

---

## 4.7 Datos de Producción de Referencia (Feb 2026)

| Métrica | Valor |
|---|---|
| Total dictámenes | 84.973 |
| `vectorized` | 10.047 (11.8%) |
| `ingested` (pendientes enriquecimiento) | 74.926 |
| Rango temporal | 1949–2025 |
| Base de datos D1 | `cgr-dictamenes` (c391c767) |
| Tamaño D1 | ~146 MB |
| Tiempo por dictamen (batch) | ~10-12 seg |
| Tiempo por batch de 50 | ~8-10 min |
| Workflows simultáneos | Se pueden ejecutar múltiples en paralelo |
