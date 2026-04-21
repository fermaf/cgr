# Plan de Ejecución: Catálogos Derivados (Fase 0)

**Estado del documento**: Archivado como antecedente de diseño
**Estado del proyecto**: Ejecutado y cerrado

Este documento conserva el diseño inicial del rediseño de persistencia para etiquetas y fuentes legales. El cierre real del proyecto quedó en [31_clausura_backfill_derivativas_canonicas.md](/home/bilbao3561/github/cgr/docs/explicacion/31_clausura_backfill_derivativas_canonicas.md).

## Archivos Tocados Esperados

### Backend (cgr-platform)
- `src/storage/d1.ts`: Lógica de persistencia, implementación de escritura dual y nuevas funciones de consulta.
- `src/lib/derivedCatalogs.ts`: [NUEVO] Funciones puras de normalización y construcción de claves (`norma_key`, `etiqueta_norm`).
- `src/lib/legalSourcesCanonical.ts`: Integración con normalizadores existentes.
- `src/workflows/enrichmentWorkflow.ts`: Punto de entrada del hot path para escritura dual.
- `src/workflows/backfillWorkflow.ts`: Punto de entrada alternativo para reprocesos masivos.
- `scripts/backfill_canonical_derived_catalogs.ts`: [NUEVO] Script de migración histórica.
- `schema_prod.sql`: Actualización del esquema canónico.
- `migrations/0014_create_canonical_derived_catalogs.sql`: [NUEVO] Migración D1.

### Frontend
- Por ahora ninguno, se mantiene compatibilidad mediante shape de respuesta idéntico en el backend.

## Tablas Legacy Afectadas
- `dictamen_etiquetas_llm`: Seguirá recibiendo escrituras pero dejará de ser la fuente de verdad para agregaciones.
- `dictamen_fuentes_legales`: Seguirá recibiendo escrituras paralelas.
- `enriquecimiento`: Mantiene `etiquetas_json` y `fuentes_legales_json` como respaldo de la inferencia original.

## Endpoints/API Relevantes
- `GET /api/v1/analytics/statutes/heatmap`: Migrará a `fuentes_legales_catalogo`.
- `GET /api/v1/dictamenes/:id`: La hidratación de etiquetas y fuentes usará preferentemente el nuevo modelo.
- Otros endpoints de agregación doctrinal que consuman estas entidades.

## Riesgos de Compatibilidad
- **Shape de Datos**: El frontend espera listas de strings para etiquetas y objetos específicos para fuentes. El backend debe mapear los nuevos IDs y catálogos de vuelta a este formato.
- **Deduplicación Agresiva**: La normalización determinística podría agrupar variantes que antes se mostraban por separado. Se considera mejora, pero debe validarse.
- **Rows Written**: La escritura dual aumentará temporalmente las `rows_written` en D1 durante el enrichment.

## Resultado final

El plan fue ejecutado con los siguientes resultados:

1. Se creó la capa canónica de derivativas y su tabla de control de backfill.
2. Se incorporó escritura dual en el hot path.
3. Se completó el backfill histórico al `100%`.
4. El siguiente frente ya no es migración histórica, sino **cutover de lectura**.
