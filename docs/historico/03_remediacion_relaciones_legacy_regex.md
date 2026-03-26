# Remediacion de Relaciones Legacy Regex (Marzo 2026)

## Hallazgo

Durante la revision manual del dictamen `001302N03`, el frontend/API mostraba una relacion entrante incorrecta:

- `000003N08 -> 001302N03`
- `tipo_accion = reconsiderado`

La verificacion contra produccion mostro que:

- `001302N03` en `raw.source["accion"]` e `is_accion` solo indica `aplica dictamen 2861/96`.
- `000003N08` en `raw.source["accion"]` e `is_accion` indica `Confirma dictamenes 51481/2007, 55098/2007`.
- Ninguno de los dos datos fuente respalda la relacion `000003N08 -> 001302N03 reconsiderado`.

La fila exacta en D1 era:

- `rowid = 5`
- `dictamen_origen_id = 000003N08`
- `dictamen_destino_id = 001302N03`
- `tipo_accion = reconsiderado`
- `origen_extracccion = backfill_workflow_regex`

## Causa

La relacion provenia del workflow historico basado en regex, no del extractor canonico actual.

Consulta usada para confirmarlo:

```sql
SELECT rowid, dictamen_origen_id, dictamen_destino_id, tipo_accion, origen_extracccion
FROM dictamen_relaciones_juridicas
WHERE (dictamen_origen_id = '001302N03' AND dictamen_destino_id = '000003N08')
   OR (dictamen_origen_id = '000003N08' AND dictamen_destino_id = '001302N03')
   OR dictamen_origen_id IN ('001302N03', '000003N08')
   OR dictamen_destino_id IN ('001302N03', '000003N08')
ORDER BY rowid DESC;
```

## Alcance del lote legacy

En produccion quedaban:

- `596` filas con `origen_extracccion = 'backfill_workflow_regex'`
- `0` coincidencias exactas con filas `canonical_v1_%`

Distribucion por `tipo_accion`:

- `aplicado`: `511`
- `reconsiderado`: `52`
- `complementado`: `19`
- `aclarado`: `10`
- `alterado`: `4`

## Decision de remediacion

En esta etapa, las filas `backfill_workflow_regex` deben considerarse legacy no confiable para consumo de producto.

Se aplica una medida principal:

1. El lote legacy se purga de `dictamen_relaciones_juridicas` en produccion.

## Validacion

1. Consultar el detalle de `001302N03`:

```bash
curl -sS https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/001302N03
```

Esperado:

- `meta.relaciones_causa` ya no contiene `000003N08`.

2. Verificar que no queden filas legacy:

```sql
SELECT COUNT(*) AS total
FROM dictamen_relaciones_juridicas
WHERE origen_extracccion = 'backfill_workflow_regex';
```

Esperado:

- `0`

## Continuidad

Si reaparecen relaciones historicas dudosas:

1. inspeccionar `origen_extracccion`
2. contrastar contra `raw.source["accion"]`, `raw.is_accion` y `dictamen_referencias`
3. corregir o purgar el lote defectuoso en origen, evitando filtros transitorios
4. solo promover relaciones nuevas desde extractores canonicos auditables

## Limpieza adicional de origenes residuales

Despues de purgar `backfill_workflow_regex`, quedaban dos filas no canonicas en produccion:

- `retro_update_test`: artefacto de prueba
- `ai_mistral`: relacion correcta semanticamente, pero fuera del flujo canonico

Se mejoro el extractor canonico para soportar textos y tablas con verbos multiples (`Aplica ..., Confirma ...`) y luego se reejecutaron de forma dirigida los dictamenes afectados.

Resultado:

- `008890N20 -> 007640N07 complementado` quedo como `canonical_v1_accion_html`
- `025436N18 -> 041169N17 confirmado` quedo como `canonical_v1_accion_html`
- las filas `retro_update_test` y `ai_mistral` fueron purgadas

Leccion: la tabla consumida por frontend no debe mezclar origenes de prueba, experimentales o transitorios con el flujo canonico.
