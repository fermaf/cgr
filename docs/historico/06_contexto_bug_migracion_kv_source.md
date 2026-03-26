# Contexto para Otro Agente: Bug de Migracion de Keys en `DICTAMENES_SOURCE`

## Alcance de este documento

Este archivo existe para delegar a otro agente la investigacion del bug de migracion de keys en `DICTAMENES_SOURCE`.

**No resolver desde este hilo.**

## Hipotesis a investigar

Hubo una migracion que debia dejar los dictamenes de `DICTAMENES_SOURCE` solo con key `id`, eliminando o absorbiendo las keys legacy tipo `dictamen:id`.

La evidencia observada en esta mision indica que ese objetivo no quedo saneado de forma confiable, o al menos no puede asumirse como contrato estable.

## Senales observadas

### 1. El frontend/API necesitó fallback de key

Se agrego fallback de lectura en el worker para probar ambas formas:

- `id`
- `dictamen:id`

Sin ese fallback, varios dictamenes modernos aparecian con `raw = {}` en `GET /api/v1/dictamenes/:id`.

### 2. Ejemplos donde el fallback desbloqueó `raw`

Casos usados en esta mision:

- `OF10641N26`
- `OF33281N26`
- `E119184N25`

Antes del fallback, el detalle API devolvia `raw` vacio para estos casos. Despues del fallback, devolvio payload con wrapper `_source`.

### 3. El CLI de Wrangler no fue fuente confiable suficiente

En sesiones anteriores, `wrangler kv key get/list` dio resultados inconsistentes frente al dashboard de Cloudflare.

Por eso, la investigacion no debe basarse solo en `wrangler kv key get/list`.

## Lo que el otro agente debe responder

1. Existe realmente mezcla de keys `id` y `dictamen:id` en `DICTAMENES_SOURCE`?
2. Si existe, cual es el universo afectado?
3. La migracion fue parcial, fallo, o hay procesos actuales que siguen escribiendo en ambos formatos?
4. El contrato correcto para runtime debe ser solo `id`, o debemos formalizar soporte dual?
5. Hay dictamenes donde solo existe la key legacy?
6. Hay dictamenes duplicados en ambas keys con payload distinto?

## Metodologia recomendada

### Produccion primero

Auditar en produccion, no desde data local.

### No confiar ciegamente en Wrangler KV CLI

Cruzar al menos estas fuentes:

- runtime del worker
- D1 `kv_sync_status`
- dashboard Cloudflare
- si es posible, script o endpoint temporal dentro del worker que pruebe ambas keys y compare payloads

### Muestra sugerida

Partir por estos IDs:

- `OF10641N26`
- `OF33281N26`
- `E119184N25`
- `025436N18`
- `001302N03`
- `008890N20`

## Riesgo funcional

Mientras este bug no quede resuelto o formalizado:

- el frontend puede mostrar `raw` vacio en algunos dictamenes
- herramientas de auditoria pueden subestimar evidencia disponible
- cualquier proceso que asuma una sola forma de key puede fallar silenciosamente

## Restriccion para el otro agente

No mezclar esta investigacion con la mision principal de relaciones entre dictamenes.

Entregable esperado:

- diagnostico del estado real de la migracion
- propuesta de remediacion
- plan de despliegue sin romper el runtime actual
