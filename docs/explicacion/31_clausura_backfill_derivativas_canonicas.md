# Clausura: Backfill Canónico de Derivativas

**Fecha de clausura**: 2026-04-21
**Estado**: Completado y archivado

## Resumen ejecutivo

El backfill canónico de derivativas quedó completado al `100%` para ambos catálogos:

- **Etiquetas**: cursor final `420648`
- **Fuentes legales**: cursor final `287495`

El run final fue el **`4385`**, con estado **`end_of_data`**, confirmando agotamiento total del backlog legacy.

## Métricas finales certificadas

| Métrica | Valor |
| :--- | ---: |
| `MAX(id)` en `backfill_canonical_derivatives_runs` | `4385` |
| Total de runs persistidos | `4382` |
| Relaciones `dictamen_etiquetas` | `327.956` |
| Relaciones `dictamen_fuentes` | `211.088` |
| Catálogo `etiquetas_catalogo` | `40.086` |
| Catálogo `fuentes_legales_catalogo` | `47.130` |
| Multi-menciones en fuentes | `13.122` |
| Duplicados técnicos en etiquetas | `0` |
| Duplicados técnicos en fuentes | `0` |

## Cierre físico contra legacy

| Catálogo | MAX legacy | Cursor final | Estado |
| :--- | ---: | ---: | :--- |
| Etiquetas | `420648` | `420648` | Cerrado |
| Fuentes | `287495` | `287495` | Cerrado |

## Tramo final de cierre

Los últimos runs relevantes fueron:

| Run | Kind | Cursor inicio | Cursor fin | Legacy rows | Apply status |
| :--- | :--- | ---: | ---: | ---: | :--- |
| `4384` | etiquetas | `420446` | `420648` | `139` | `success` |
| `4385` | etiquetas | `NULL` | `NULL` | `0` | `end_of_data` |

El último lote con datos reales fue el `4384`. El run `4385` confirmó fin de datos sin escrituras adicionales.

## Incidentes relevantes del proyecto

### 1. Fallos transitorios de infraestructura

Hubo incidentes de Wrangler / Cloudflare D1 por upload fallido de SQL:

- errores `500` / `File could not be uploaded`;
- reanudación posterior desde cursor certificado;
- sin duplicados ni sobreescrituras efectivas.

El caso más relevante del tramo final fue el run fallido `4198`, reanudado limpiamente desde el mismo cursor mediante el run `4199`.

### 2. Cierre temprano de fuentes

Fuentes alcanzó fin de datos antes que etiquetas. Eso forzó un cambio de régimen operativo:

- fuentes quedó cerrada en `287495`;
- se introdujo soporte administrativo para `skipped_by_config` y `end_of_data`;
- la campaña pasó a modo **solo etiquetas** sin inventar lotes artificiales.

### 3. Evolución del protocolo del runner

El proyecto terminó con tres estados operativos claros para cada lote:

- `success`
- `skipped_by_config`
- `end_of_data`

Ese contrato fue necesario para permitir campañas mixtas, cierre de ramas y reanudaciones seguras.

## Diferencia entre `MAX(id)` y `COUNT(*)`

La tabla de runs termina con:

- `MAX(id) = 4385`
- `COUNT(*) = 4382`

Los IDs faltantes son:

- `1477`
- `1724`
- `4199`

La causa es administrativa: el `AUTOINCREMENT` de SQLite consumió esos IDs en intentos de inserción fallidos que no persistieron fila. No indica pérdida de datos migrados ni huecos doctrinales.

## Cómo quedó la lógica viva

### Escritura

Las nuevas ingestas ya no dependen del backfill histórico. El sistema escribe en simultáneo:

- **legacy**
  - `dictamen_etiquetas_llm`
  - `dictamen_fuentes_legales`
- **canónico**
  - `etiquetas_catalogo`
  - `dictamen_etiquetas`
  - `fuentes_legales_catalogo`
  - `dictamen_fuentes`

Además, en re-enrichment se limpian ambas capas antes de reinsertar.

### Lectura

El **read path** productivo todavía no hizo el cutover completo a la capa canónica. Siguen existiendo consumidores de:

- `enriquecimiento.etiquetas_json`
- `enriquecimiento.fuentes_legales_json`
- `dictamen_fuentes_legales`

Por eso, el siguiente frente técnico ya no es otro backfill, sino una **auditoría y migración de consumo** desde legacy/JSON hacia las tablas canónicas.

## Fuentes de verdad de cierre

1. [CAMP_2026-04-21T10-59-13-811Z.md](/home/bilbao3561/github/cgr/docs/explicacion/backfill_campaign_reports/CAMP_2026-04-21T10-59-13-811Z.md)
2. [28_checkpoint_backfill_catalogos_canonicos.md](/home/bilbao3561/github/cgr/docs/explicacion/28_checkpoint_backfill_catalogos_canonicos.md)
3. Tabla D1 `backfill_canonical_derivatives_runs`

## Regla final

> [!IMPORTANT]
> **No relanzar más campañas** de este proyecto.

El frente de backfill canónico de derivativas queda **cerrado y archivado**.
