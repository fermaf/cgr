# Evaluación Final: Offset vs Cursor en el Backfill D1

**Estado**: Concluido
**Fecha**: 2026-04-21

## Conclusión ejecutiva

La migración histórica de derivativas confirmó que el enfoque correcto para D1 fue:

- **cursor / keyset pagination** para ejecución real;
- **orquestación por ventanas** con validación previa;
- **estados administrativos explícitos** para manejar cierre de ramas y fin de datos.

`OFFSET` quedó desechado como estrategia operativa para este tipo de backfill.

## Razones técnicas

### 1. El conjunto era mutable y largo

La migración recorrió:

- `420.648` filas legacy de etiquetas
- `287.495` filas legacy de fuentes

En recorridos de ese tamaño, `OFFSET` expone a:

- desalineación entre lote lógico y lote físico;
- errores de continuidad por reintento;
- auditorías ambiguas;
- mayor costo administrativo en reanudaciones.

### 2. El cursor permitió trazabilidad real

El control por:

- `cursor_after_id`
- `cursor_start_id`
- `cursor_end_id`

permitió:

- detectar solapamientos reales;
- reanudar tras fallos transitorios;
- certificar exactamente el último rango exitoso;
- cerrar ambas ramas con evidencia directa en D1.

### 3. El cierre exigió estados explícitos

La transición a “solo etiquetas” obligó a formalizar dos estados nuevos del protocolo JSON:

- `skipped_by_config`
- `end_of_data`

Sin esos estados, el orquestador trataba el cierre de una rama como error. Con ellos, la campaña pudo seguir de forma segura cuando fuentes quedó agotada y etiquetas todavía no.

## Lecciones operativas

1. **No usar `OFFSET` para backfills largos sobre D1**.
2. **Persistir siempre el rango físico procesado**.
3. **Separar errores reales de estados administrativos**.
4. **No forzar ventanas artificiales al llegar a fin de datos**.
5. **Reanudar siempre desde el último cursor exitoso certificado en D1**.

## Estado final de la evaluación

- **Método ganador**: cursor
- **Método archivado**: offset
- **Resultado**: backfill completado al `100%` sin duplicados técnicos

## Referencias

- [31_clausura_backfill_derivativas_canonicas.md](/home/bilbao3561/github/cgr/docs/explicacion/31_clausura_backfill_derivativas_canonicas.md)
- [28_checkpoint_backfill_catalogos_canonicos.md](/home/bilbao3561/github/cgr/docs/explicacion/28_checkpoint_backfill_catalogos_canonicos.md)
- [CAMP_2026-04-21T10-59-13-811Z.md](/home/bilbao3561/github/cgr/docs/explicacion/backfill_campaign_reports/CAMP_2026-04-21T10-59-13-811Z.md)
