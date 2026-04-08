# 01 - Inteligencia y Operación de Workflows (Deep Dive)

> [!IMPORTANT]
> **Tipo Diátaxis**: Guía de Tareas Avanzada. 
> Dirigida a Ingenieros de Operaciones SRE y Desarrolladores que necesiten alterar la orquestación masiva. Documenta la justificación ingenieril de por qué la plataforma ingiere los datos como lo hace.

---

## 🏗️ 1. El Problema de Arquitectura (Por qué Workflows)

El proceso de enriquecimiento de un dictamen con Inteligencia Artificial comprende:
1. Extraer su Source JSON desde D1/KV.
2. Inyectar ~15.000 tokens a la API de Mistral.
3. Esperar ~4-8 segundos por inferencia.
4. Generar el Embedding Vectorial.
5. Inyectar a Pinecone.
6. Guardar estado transaccional en D1.

**¿Por qué no usar un endpoint POST tradicional o un Cron genérico?**
Cloudflare Workers Opera bajo "V8 Isolates", que imponen un límite estricto de **30 segundos de CPU Time** por solicitud HTTP. Intentar procesar 50 dictámenes en un ciclo sincrónico mataría al Worker por Timeout. 
Por eso **CGR-Platform confía su pipeline a `Cloudflare Workflows`**: una primitiva de estado duradero que permite pausar la ejecución (`step.do`, `step.sleep`), guardar la memoria en disco, y retomarla evadiendo los límites de CPU.

---

## 🔄 2. Anatomía de la Recursividad (Colas Separadas)

La arquitectura vigente separa el pipeline en dos workflows:

1. `EnrichmentWorkflow` (`src/workflows/enrichmentWorkflow.ts`)
   Consume `ingested`, `ingested_importante` e `ingested_trivial`, los pasa a `enriching_*` y termina en `enriched_pending_vectorization`.
2. `VectorizationWorkflow` (`src/workflows/vectorizationWorkflow.ts`)
   Consume `enriched_pending_vectorization`, los pasa a `vectorizing` y termina en `vectorized`.

La separación evita que una cuota agotada de LLM frene la vectorización, o que una cuota agotada de Pinecone ensucie la cola de enrichment.

### La Flag Mágica: `recursive`

Si has disparado el endpoint de `batch-enrich`:
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/batch-enrich" \
  -d '{"batchSize": 50, "delayMs": 500, "recursive": true, "allowedStatuses": ["ingested_importante"]}'
```

Lo que ocurre a nivel de código es vital para la ingeniería inversa:
1. El workflow inicial levanta un lote desde una sola cola operativa.
2. Cada dictamen pasa a un estado transitorio explícito (`enriching_ingested`, `enriching_importante`, `enriching_trivial` o `vectorizing`).
3. Al finalizar el lote, el workflow consulta si siguen quedando pendientes en su misma cola.
4. Si `recursive=true` y la respuesta es SÍ, crea una nueva instancia de sí mismo y sigue consumiendo solo esa etapa.

**Casos de Uso Operativos:**
- **Re-Ingesta Total (Destrucción y Recreación):** Si acabas de actualizar la base de datos completa reseteando el estado de 30.000 dictámenes, usas `recursive: true` para que el orquestador trabaje solo durante 3 días ininterrumpidos.
- **Auditoría de Prompt:** Si ajustaste el *Mega Prompt V5* en código y quieres ver si acierta en detectar una norma oscura. Purgas 5 registros, usas `batchSize: 5` y `recursive: false`. El orquestador morirá luego de 5 registros y podrás auditar el resultado en D1 sin riesgo de que se extienda consumiendo tokens innecesarios.

---

## 🧐 3. Reparación Sistémica: Extracción Forzada en D1 y KV

### Sincronía Deficiente (Truly Missing Dictamenes)
Un dictamen (Ej: `E121949N25`) puede aparecer en los registros analíticos pero arrojar 404 en el Frontend.

**Causa Raíz Típica:** Un CronJob abortado prematuramente (drift entre scraping y database) o el portal público de la CGR denegó conexión transitoria al worker transaccional.

**Protocolo de Remediación Definitivo (Scraping Forzado):**
No pierdas tiempo intentando alterar el estado en SQL a mano. Inyecta el identificador en la capa topológica superior (El Ingestor Original):

```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/crawl/range" \
  -H "x-admin-token: <<TU_TOKEN_SECRETO>>" \
  -d '{
    "date_start": "2025-01-01", 
    "date_end": "2025-01-02", 
    "limit": 2000
  }'
```
*(Nota: El Ingestor se salta los que ya existen en D1. Esta es una operación de inserción o idempotencia).*

### Fallback Documental (Sobrevivencia IA)
Mucha de la ingeniería inversa sobre los fallos de 2017 hacia atrás revelará que carecen de texto. El código de la **CGR-Platform** implementa una jerarquía defensiva en el Backfill:

```typescript
// Extraer documento_completo -> Sino, extraer materia -> Sino extraer texto.
const sourceContent = rawJson._source ?? rawJson.source ?? (rawJson as any).raw_data ?? rawJson;
```
Esto certifica que la matriz de inferencia jamás sea enviada en blanco, rescatando al menos la Metadata estructurada de los años 90.

---

## 🚦 4. Estados de Error Comunes (Observabilidad)

El ciclo de vida del Workflow clasifica las interrupciones en estados semánticos dentro de la tabla `dictamenes` para facilitar la gestión SRE:

| Estado | Significado | Acción Recomendada |
| :--- | :--- | :--- |
| `error` | Fallo técnico general (AI_INFERENCE_ERROR, D1, Logging). | Revisar eventos en `dictamen_events` y reintentar si es transitorio. |
| `error_longitud` | Cantidad de tokens superó los 32k o límites del modelo AI. | Evaluar sustracción manual o acotar texto indexable. |
| `error_sin_KV_source` | El ID existe en D1 pero falta el Raw JSON original en Storage. | Disparar Scraping Forzado del tramo de fechas. |
| `enriched_pending_vectorization` | El enrichment ya está persistido y solo falta Pinecone. | Disparar `batch-vectorize` o esperar el siguiente ciclo de vectorización. |
| `error_quota` | **Legacy**. El flujo actual debe reencolar al estado `ingested*` correcto en vez de quedarse aquí. | Normalizarlo y dejar trazabilidad en `dictamen_events`. |
