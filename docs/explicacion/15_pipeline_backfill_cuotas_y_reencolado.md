# Pipeline de backfill, cuotas y reencolado

## Objetivo

Ordenar el flujo de ingesta, enrichment y vectorización cuando existen:

- cuotas distintas por modelo;
- dictámenes reencolados para reproceso;
- fallas parciales en Pinecone;
- necesidad de trazabilidad histórica real en `dictamen_events`.

## Regla de ruteo

- Año `2026`: `ingested` y procesamiento con `mistral-large-2512`.
- Antes de `2026` con `es_relevante = 1` o `en_boletin = 1`: `ingested_importante` y procesamiento con `gemini-3.1-flash-lite-preview`.
- Antes de `2026` sin esos flags: `ingested_trivial` y procesamiento con `mistral-large-2411`.

## Regla de estado por falla parcial

- Si el enrichment ya existe pero Pinecone falla por cuota, el dictamen debe quedar en `enriched_pending_vectorization`.
- Ese estado significa que el enriquecimiento sí existe y solo falta reintentar la vectorización.
- No debe confundirse con errores de enrichment.

## Reencolado

- Si un dictamen vuelve manualmente a `ingested`, `ingested_importante` o `ingested_trivial`, el workflow debe ignorar el enriquecimiento previo y ejecutar IA otra vez.
- Antes de reinsertar derivados del enrichment, se limpian `dictamen_etiquetas_llm` y `dictamen_fuentes_legales` para evitar duplicados.

## Trazabilidad

- Todo cambio operativo de estado debe quedar en `dictamen_events`.
- Los scripts de corrección masiva deben insertar primero el evento y luego actualizar `dictamenes`.

## Rotación de claves

- Gemini usa un pool de claves configurado en `GEMINI_API_KEYS`.
- Las claves filtradas o bloqueadas se excluyen mediante `GEMINI_BLOCKED_API_KEYS`.
- Mistral usa un pool de claves configurado en `MISTRAL_API_KEYS`.
- Cuando una clave Mistral cae por cuota, se marca en enfriamiento temporal y luego vuelve a ser elegible para detectar si ya reseteó.

## Configuración sensible

Las claves no deben quedar en `wrangler.jsonc`.

Se deben cargar como secrets en Cloudflare:

- `GEMINI_API_KEYS`
- `GEMINI_BLOCKED_API_KEYS`
- `MISTRAL_API_KEYS`

Las variables operativas no sensibles sí pueden vivir en `wrangler.jsonc`, por ejemplo:

- `GEMINI_RPM_LIMIT_PER_KEY`
- `MISTRAL_QUOTA_COOLDOWN_HOURS`

## Scripts operativos

- `cgr-platform/scripts/reset_processing_to_correct_state.sql`
  Reencola dictámenes atrapados en `processing`.

- `cgr-platform/scripts/requeue_2026_wrong_model.sql`
  Reencola dictámenes 2026 enriquecidos con modelo incorrecto.

- `cgr-platform/scripts/audit_pipeline_consistency.sql`
  Levanta consistencia real del pipeline y detecta desvíos de modelo/estado.
