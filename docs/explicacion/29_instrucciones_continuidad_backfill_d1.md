# Instrucciones de Continuidad: Backfill D1

**Estado del documento**: Archivado por cierre del proyecto
**Última actualización**: 2026-04-21

Este documento deja constancia de que el protocolo de continuidad usado durante la ejecución ya no debe invocarse para este frente.

## Estado final

- **Etiquetas**: `420648 / 420648`
- **Fuentes**: `287495 / 287495`
- **Run final**: `4385`
- **Estado final**: `end_of_data`
- **Duplicados técnicos**: `0`

## Regla vigente

> [!IMPORTANT]
> **No relanzar más campañas** sobre `backfill_canonical_derivatives_runs` para este proyecto.

La continuidad histórica quedó resuelta y el backlog legacy fue agotado por completo. Cualquier trabajo futuro sobre derivativas debe tratarse como un frente distinto:

1. **cutover de lectura** desde legacy/JSON hacia canónico; o
2. **nueva migración** derivada de un cambio futuro de modelo de datos.

## Qué sí sigue vigente

El cierre del backfill no elimina el modelo dual vigente en la escritura:

- legacy:
  - `dictamen_etiquetas_llm`
  - `dictamen_fuentes_legales`
- canónico:
  - `etiquetas_catalogo`
  - `dictamen_etiquetas`
  - `fuentes_legales_catalogo`
  - `dictamen_fuentes`

Las nuevas ingestas ya nacen sincronizadas en ambas capas. No hace falta otro backfill histórico para etiquetas/fuentes mientras ese contrato de escritura se mantenga.

## Qué no quedó migrado todavía

El **read path** productivo sigue usando en parte:

- `enriquecimiento.etiquetas_json`
- `enriquecimiento.fuentes_legales_json`
- `dictamen_fuentes_legales`

Por eso, la continuidad real después del cierre ya no es operativa de backfill, sino de **migración de consumo**.

## Referencias canónicas

- [31_clausura_backfill_derivativas_canonicas.md](/home/bilbao3561/github/cgr/docs/explicacion/31_clausura_backfill_derivativas_canonicas.md)
- [28_checkpoint_backfill_catalogos_canonicos.md](/home/bilbao3561/github/cgr/docs/explicacion/28_checkpoint_backfill_catalogos_canonicos.md)
- [CAMP_2026-04-21T10-59-13-811Z.md](/home/bilbao3561/github/cgr/docs/explicacion/backfill_campaign_reports/CAMP_2026-04-21T10-59-13-811Z.md)
