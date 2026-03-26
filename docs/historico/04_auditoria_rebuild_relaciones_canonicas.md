# Auditoria Final del Rebuild de Relaciones Canonicas

## Resumen ejecutivo

La reconstruccion canonica de relaciones entre dictamenes quedo materializada nuevamente en produccion y la tabla `dictamen_relaciones_juridicas` termino saneada:

- todas las filas activas provienen de `canonical_v1_accion_html`
- no quedan filas legacy de `backfill_workflow_regex`
- no quedan filas residuales de `ai_mistral`
- no quedan filas residuales de `retro_update_test`

El resultado ya es visible desde el frontend y desde `GET /api/v1/dictamenes/:id`.

## Evidencia verificada en produccion

Consultas ejecutadas sobre D1 `cgr-dictamenes`:

- `dictamen_relaciones_juridicas` activas: `80345`
- `dictamen_relaciones_huerfanas` canonicas: `4271`
- dictamenes con al menos un flag doctrinal: `30193`
- dictamenes con al menos una relacion materializada: `24457`
- dictamenes con al menos una huerfana canonica: `1904`
- dictamenes con flags sin relacion ni huerfana: `5536`

Distribucion por `tipo_accion`:

- `aplicado`: `75657`
- `confirmado`: `1820`
- `reconsiderado`: `1722`
- `complementado`: `854`
- `aclarado`: `292`

Distribucion por `origen_extracccion`:

- `canonical_v1_accion_html`: `80345`

Chequeo de residuos legacy:

- `backfill_workflow_regex`: `0`
- `ai_mistral`: `0`
- `retro_update_test`: `0`

## Casos auditados en API

### `001302N03`

Estado esperado tras la remediacion:

- `is_accion`: `aplica dictamen 2861/96`
- `relaciones_efecto`: `002861N96 aplicado`
- ya no aparece la falsa relacion con `000003N08`

### `025436N18`

Caso critico de acciones mixtas:

- `is_accion`: `Aplica dictámenes 60795/2008, 66029/2009, 21124/2017, Confirma dictamen 41169/2017`
- `relaciones_efecto` observadas:
  - `041169N17 confirmado`
  - `021124N17 aplicado`
  - `066029N09 aplicado`
  - `060795N08 aplicado`

### `008890N20`

Caso residual antes almacenado como `retro_update_test`:

- `is_accion`: `Complementa dictamen 7640/2007`
- `relaciones_efecto`: `007640N07 complementado`

## Incidentes observados durante el rebuild

El rebuild completo no fallo por datos, sino por dos bugs operacionales del workflow recursivo:

1. `instance_already_exists`
   - causa: IDs hijos fijos por `offset`
   - efecto: colision con corridas previas

2. `instance_invalid_id`
   - causa: IDs hijos demasiado largos al concatenar `instanceId` completos
   - efecto: rechazo por formato o longitud de Cloudflare Workflows

Correccion aplicada:

- el workflow ahora acepta `runTag`
- los hijos usan `canonical-relations-${runTag}-${nextOffset}`
- el trigger permite inyectar `runTag` corto y estable

## Lectura tecnica del resultado

El rebuild actual ya aporta valor real y verificable:

- limpia el lote historico errado
- reemplaza datos de prueba o experimentales por provenance canonica
- corrige documentos con multiples acciones juridicas en una misma fuente
- expone el resultado al frontend

Pero todavia no cierra todo el problema de relaciones entre dictamenes.

La deuda funcional que queda en produccion es concreta:

- `5536` dictamenes con flags doctrinales siguen sin relacion ni huerfana
- `4271` huerfanas canonicas indican evidencia detectada sin `destino_id` resuelto
- existen `2015` dictamenes con multiples tipos de accion, que requieren auditoria muestral permanente

## Plan sistematizado para cerrar relaciones entre dictamenes

### Fase 1. Cerrar cobertura determinista

Objetivo: bajar de manera medible los `5536` dictamenes con flags sin salida.

1. Extraer una muestra estratificada de esos casos.
2. Clasificarlos por causa:
   - `accion` vacia o inutil
   - `is_accion` inconsistente
   - destino no resoluble por `numero/anio`
   - texto juridico complejo
3. Implementar mejoras solo por categoria con medicion antes/despues.

Metricas a seguir:

- `flagged_without_rel_or_orphan`
- `flagged_with_rel`
- `flagged_with_orphan`

### Fase 2. Resolver huérfanas canonicas

Objetivo: reducir `4271` huérfanas mejorando el linker.

1. Auditar muestra de huérfanas por año y tipo de accion.
2. Mejorar matching `numero/anio -> dictamen_id`:
   - normalizacion de ceros
   - años abreviados
   - colisiones por formatos `E`, `D`, `C`
3. Reprocesar solo huérfanas afectadas y medir conversion a relacion materializada.

### Fase 3. Introducir LLM solo en ambiguos

Objetivo: usar `mistral-large-2411` donde el parser determinista no alcanza.

Aplicar solo a:

- multi-verbo ambiguo
- referencias indirectas
- contradicciones entre `accion`, `is_accion` y flags
- destinos no resolubles con reglas

Salida minima esperada:

- `tipo_canonico`
- `destino_probable`
- `confianza`
- `justificacion`

### Fase 4. Auditoria visible en frontend

Objetivo: que el usuario revise no solo la relacion, sino su calidad.

1. Exponer provenance por arista.
2. Marcar si fue deterministica o inferida.
3. Agregar una vista de huérfanas/conflictos para auditoria.

### Fase 5. Hardening operacional

Objetivo: evitar repetir deuda operativa en futuros rebuilds.

1. Mantener `runTag` en el workflow canonico.
2. Evaluar un driver por cola o script para backfills grandes.
3. Para futuros rebuilds completos, preferir tabla sombra + swap.

## Archivos clave para retomar

- `cgr-platform/src/lib/relationsCanonical.ts`
- `cgr-platform/src/workflows/canonicalRelationsWorkflow.ts`
- `cgr-platform/src/index.ts`
- `docs/historico/02_workflow_temporal_relaciones_canonicas.md`
- `docs/historico/03_remediacion_relaciones_legacy_regex.md`
- `docs/historico/04_auditoria_rebuild_relaciones_canonicas.md`
