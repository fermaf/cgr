# Separación de workflows de enrichment y vectorización

## Objetivo

Eliminar el acople entre cuotas de LLM y cuota de Pinecone.

La arquitectura anterior usaba un solo `BackfillWorkflow` para:

- seleccionar dictámenes pendientes;
- ejecutar enrichment con LLM;
- persistir en KV y D1;
- vectorizar en Pinecone.

Eso producía dos problemas operativos:

- una cuota agotada de Gemini o Mistral frenaba dictámenes que sí podían avanzar por otra cola;
- una cuota agotada de Pinecone contaminaba la observabilidad del enrichment.

## Nueva arquitectura

### 1. `EnrichmentWorkflow`

Solo procesa estados:

- `ingested`
- `ingested_importante`
- `ingested_trivial`

Transiciones:

- `ingested` -> `enriching_ingested`
- `ingested_importante` -> `enriching_importante`
- `ingested_trivial` -> `enriching_trivial`
- `enriching_*` -> `enriched_pending_vectorization`

La corrida termina cuando:

1. el LLM responde correctamente;
2. se guarda `DICTAMENES_PASO`;
3. se actualiza D1 derivado del enrichment;
4. el dictamen queda en `enriched_pending_vectorization`.

No hace vectorización.

### 2. `VectorizationWorkflow`

Solo procesa estados:

- `enriched_pending_vectorization`

Transiciones:

- `enriched_pending_vectorization` -> `vectorizing`
- `vectorizing` -> `vectorized`

Si Pinecone responde con cuota agotada, el dictamen vuelve a `enriched_pending_vectorization`.

## Regla de selección

Ambos workflows toman primero los dictámenes más recientes:

- `fecha_documento DESC`
- `numero DESC`
- `id DESC`

## Segmentación operativa del enrichment

El endpoint `POST /api/v1/dictamenes/batch-enrich` acepta `allowedStatuses` para disparar colas específicas:

- `["ingested"]`
- `["ingested_importante"]`
- `["ingested_trivial"]`

Eso permite correr solo la cola que aún tiene cuota disponible.

## Estados legacy

Se dejan solo por compatibilidad y migración:

- `processing`
- `enriched`
- `error_quota`
- `error_quota_pinecone`

La operación normal no debe producirlos.

## Scripts operativos

- `cgr-platform/scripts/reset_processing_to_correct_state.sql`
  Resetea cualquier estado transitorio legacy o actual a su estado reintentable correcto.

- `cgr-platform/scripts/audit_pipeline_consistency.sql`
  Verifica consistencia de estados, enrichment y transitorios pegados.

## Principio operativo

El workflow de enrichment termina al concluir enrichment.

El workflow de vectorización comienza donde el anterior termina.

La coordinación entre ambos se hace por estado persistido en `dictamenes` y por trazabilidad completa en `dictamen_events`.
