# Contexto Actual del Proyecto

## Stack real

- Backend doctrinal: Cloudflare Workers + Hono en [cgr-platform/](/home/bilbao3561/github/cgr/cgr-platform)
- Frontend: React + Vite + Cloudflare Pages en [frontend/](/home/bilbao3561/github/cgr/frontend)
- Base de datos principal: D1
- Almacenamiento derivado: KV
- Búsqueda vectorial: Pinecone

## Modelos y capas AI

- Enrichment doctrinal: `mistral-large-2512`
- Query understanding y rewrite conservador: `mistral-large-2411`
- Metadata doctrinal y reproceso del core: `mistral-large-2411`

## Capacidades productivas ya operativas

- `doctrine-search`
- `doctrine-lines`
- snapshot de `estado_actual_materia` con prioridad visible en búsqueda doctrinal
- `semantic_anchor_dictamen`
- `representative_dictamen_id`
- `pivot_dictamen`
- `reading_priority_reason`
- `graph_doctrinal_status`
- `dictamen_metadata_doctrinal`
- ranking híbrido semántico-doctrinal
- priorización por vigencia doctrinal
- remediación estructural de líneas doctrinales

## Notas operativas del pipeline

- La ingesta distingue backlog `ingested`, `ingested_importante` e `ingested_trivial` para enrutar modelos distintos en enrichment.
- El pipeline productivo ya no usa un workflow mixto: existe un `EnrichmentWorkflow` para LLM y un `VectorizationWorkflow` para Pinecone.
- Los estados transitorios correctos son `enriching_ingested`, `enriching_importante`, `enriching_trivial` y `vectorizing`.
- Cuando Pinecone queda sin cuota, el estado operativo correcto del dictamen es `enriched_pending_vectorization`, no un error genérico de enrichment.
- El workflow de enrichment termina en `enriched_pending_vectorization`; no debe vectorizar dentro de la misma corrida.
- Ambos workflows seleccionan primero los dictámenes más recientes (`fecha_documento DESC`, `numero DESC`).
- La trazabilidad histórica de cambios de estado debe vivir en `dictamen_events`.

## Grafo jurídico

La red principal vive en:

- `dictamen_relaciones_juridicas`

Ya se usa para:

- buckets visibles de relación;
- estado del criterio;
- lectura sugerida;
- orden doctrinal;
- explicación de vigencia.

## Fuentes legales

Las fuentes legales viven en:

- `dictamen_fuentes_legales`

La plataforma ya tiene:

- diccionario canónico base de normas;
- saneamiento histórico seguro para alias y variantes triviales;
- render más confiable en detalle de dictamen.

## Metadata doctrinal

La plataforma ahora cuenta con:

- `dictamen_metadata_doctrinal` como snapshot operativo por dictamen;
- `dictamen_metadata_doctrinal_evidence` para trazabilidad de señales;
- reproceso administrable desde el backend para recalcular la capa sin tocar el retrieval semántico;
- regla general de negocio: si una materia exhibe abstención competencial, litigiosidad o cambio de régimen visible, `doctrine-search` debe mostrar primero ese estado actual y degradar la doctrina previa a contexto histórico.

Notas operativas relevantes:

- el workflow doctrinal debe drenar backlog faltante por condición `md IS NULL`, no paginar con `OFFSET` sobre un conjunto mutable;
- el universo operativo del reproceso automático es `estado IN ('enriched_pending_vectorization', 'vectorized')`;
- desde `2026-04-08`, `EnrichmentWorkflow` dispara automáticamente sub-batches de `DoctrinalMetadataWorkflow` para los IDs enriquecidos exitosamente;
- ese disparo doctrinal es no bloqueante: si falla, enrichment no retrocede ni bloquea vectorización;
- la metadata doctrinal se calcula lo antes posible tras enrichment, no después de Pinecone;
- una cadena recursiva puede terminar con backlog pendiente si la selección por páginas se desalineó con entradas nuevas o reinicios del workflow;
- la auditoría al `2026-04-08` dejó cobertura doctrinal de `96,6%` sobre ese universo y backlog remanente de `913` filas.

## Despliegue principal

- Worker principal: `cgr-platform`
- URL principal backend: `https://cgr-platform.abogado.workers.dev`
- Pages principal: `cgr-jurisprudencia-frontend`
- URL principal frontend: `https://cgr-jurisprudencia-frontend.pages.dev`

No tratar previews o alias auxiliares como canonical URLs.
