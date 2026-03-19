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

## 🔄 2. Anatomía de la Recursividad (El Backfill de Estado)

El `BackfillWorkflow` (`src/workflows/backfillWorkflow.ts`) es un devorador de estado. Su única misión es despertar, escudriñar la base de datos `dictamenes` buscando estados igual a `ingested`, atraparlos atómicamente pasándolos a `processing`, inyectarles la jurisprudencia de IA y sellarlos en `vectorized`.

### La Flag Mágica: `recursive`

Si has disparado el endpoint de `batch-enrich`:
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/batch-enrich" \
  -d '{"batchSize": 50, "delayMs": 500, "recursive": true}'
```

Lo que ocurre a nivel de código es vital para la ingeniería inversa:
1. El Workflow inicial levanta 50 registros en bloques (*chunks*) de 1, esperando (`delayMs=500`) medio segundo entre ellos para no saturar Cloudflare AI Gateway (Prevención de Error `429 Too Many Requests`).
2. Al finalizar el registro N° 50, el Worker escanea rápidamente D1. **¿Quedan más registros `ingested` en la base?**
3. Si `recursive=true` y la respuesta es SÍ: El Worker actual **crea una nueva instancia clonada de sí mismo** en Cloudflare Workflows enviándole los mismos parámetros, y procede a autodestruirse (Finalización exitosa).
4. El nuevo Worker nace 10 segundos después y engulle los siguientes 50 registros.

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
Esto certifica que la matriz de inferencia para Mistral jamás sea enviada en blanco, rescatando al menos la Metadata estructurada de los años 90.
