# Prioridades Actuales

## Prioridad 1

Completar el backfill de Regímenes Jurisprudenciales (Fase 1).

Estado actual:
- Pipeline de descubrimiento: **en producción** (`regimenDiscovery.ts`)
- Pipeline de persistencia: **en producción** (`regimenBuilder.ts`)
- Workflow de backfill: **desplegado y disparado** (`RegimenBackfillWorkflow`)
- 6 regímenes piloto en D1 (5 activos, 1 desplazado)

Próximo paso inmediato:
- Verificar que el Workflow completa las 20 semillas correctamente
- Si el backfill falla en semillas sin metadata, investigar cobertura de `dictamen_metadata_doctrinal`

## Prioridad 2

Mejorar valor jurídico visible sin perder recall semántico.

Esto incluye:

- integrar los Regímenes descubiertos en el retrieval de búsqueda;
- mostrar estado del régimen (activo/desplazado/zona_litigiosa) junto al dictamen;
- endurecer fuentes legales y vigencia visible.

## Prioridad 3

Extracción de PJOs (Problemas Jurídicos Operativos) — Fase 2.

- Usar LLM ligero (gemini-flash) para formular la pregunta jurídica de cada régimen
- Poblar `problemas_juridicos_operativos` y `pjo_dictamenes`

## Qué evitar

- staging completo artificial;
- metalenguaje excesivo en UI;
- pseudo-precisión jurídica;
- abrir cinco frentes a la vez;
- introducir arquitectura paralela innecesaria.
