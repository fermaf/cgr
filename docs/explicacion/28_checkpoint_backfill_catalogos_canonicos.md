# Checkpoint Final: Backfill de Catálogos Canónicos

**Fecha de cierre**: 2026-04-21
**Estado**: Completado y archivado

Este documento deja el último checkpoint operativo del backfill canónico de derivativas. El detalle consolidado de cierre vive en [31_clausura_backfill_derivativas_canonicas.md](/home/bilbao3561/github/cgr/docs/explicacion/31_clausura_backfill_derivativas_canonicas.md).

## Estado final certificado

- **Cursor final etiquetas**: `420648`
- **Cursor final fuentes**: `287495`
- **Run final**: `4385`
- **Estado del run final**: `end_of_data`
- **Total runs persistidos**: `4382`
- **MAX(id)** de `backfill_canonical_derivatives_runs`: `4385`

## Relaciones finales

| Métrica | Valor |
| :--- | ---: |
| Relaciones `dictamen_etiquetas` | `327.956` |
| Relaciones `dictamen_fuentes` | `211.088` |
| Catálogo `etiquetas_catalogo` | `40.086` |
| Catálogo `fuentes_legales_catalogo` | `47.130` |
| Multi-menciones en fuentes | `13.122` |
| Duplicados técnicos etiquetas | `0` |
| Duplicados técnicos fuentes | `0` |

## Últimos runs de cierre

| Run | Kind | Cursor inicio | Cursor fin | Legacy rows | Rel. unique | Apply status |
| :--- | :--- | ---: | ---: | ---: | ---: | :--- |
| `4380` | etiquetas | `419646` | `419845` | `200` | `200` | `success` |
| `4381` | etiquetas | `419846` | `420045` | `200` | `200` | `success` |
| `4382` | etiquetas | `420046` | `420245` | `200` | `200` | `success` |
| `4383` | etiquetas | `420246` | `420445` | `200` | `200` | `success` |
| `4384` | etiquetas | `420446` | `420648` | `139` | `139` | `success` |
| `4385` | etiquetas | `NULL` | `NULL` | `0` | `0` | `end_of_data` |

## Nota sobre la diferencia entre `MAX(id)` y `COUNT(*)`

El sistema termina con:

- `MAX(id) = 4385`
- `COUNT(*) = 4382`

Los IDs faltantes son `1477`, `1724` y `4199`. Corresponden a intentos fallidos de inserción en la tabla de control: SQLite consumió el valor de `AUTOINCREMENT`, pero la fila no quedó persistida. Es una diferencia administrativa del secuenciador, no una pérdida de datos migrados.

## Estado operativo posterior

- **No relanzar más campañas**.
- El backfill histórico quedó cerrado para ambos catálogos.
- Las nuevas ingestas quedan cubiertas por escritura dual en legacy + canónico.
- El siguiente frente técnico ya no es migración histórica, sino **cutover de lectura** desde tablas legacy/JSON hacia tablas canónicas.

## Fuentes de verdad del cierre

1. [31_clausura_backfill_derivativas_canonicas.md](/home/bilbao3561/github/cgr/docs/explicacion/31_clausura_backfill_derivativas_canonicas.md)
2. [CAMP_2026-04-21T10-59-13-811Z.md](/home/bilbao3561/github/cgr/docs/explicacion/backfill_campaign_reports/CAMP_2026-04-21T10-59-13-811Z.md)
3. Tabla D1 `backfill_canonical_derivatives_runs`
