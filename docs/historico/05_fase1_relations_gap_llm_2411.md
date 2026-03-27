# Fase 1: Relations Gap con Mistral Large 2411

## Objetivo

Abrir una via segura para analizar el cohorte de dictamenes con flags doctrinales pero sin relacion ni huerfana, usando explicitamente `mistral-large-2411` y evitando el `re-process` integral del enrichment.

## Hallazgos previos consolidados

Universo observado en produccion:

- dictamenes con flags doctrinales: `30193`
- con relacion materializada: `24457`
- con huerfana canonica: `1904`
- sin relacion ni huerfana: `5536`

Distribucion del cohorte faltante por estado:

- `ingested`: `4428`
- `vectorized`: `863`
- `error_quota`: `232`
- `error_longitud`: `8`
- `processing`: `5`

Distribucion por cohorte temporal:

- historico `<= 2019`: `4794`
- moderno `>= 2020`: `742`

Observacion de muestra:

- en muchos historicos, `is_accion` y `accion` vienen vacios aunque los flags esten activos
- en varios modernos, el `raw` venia oculto por la forma de key o por wrapper `_source`

## Cambios implementados en esta fase

### 1. Fallback de lectura de `DICTAMENES_SOURCE`

Se agrego lectura con fallback `id` / `dictamen:id` en el worker, para que frontend y endpoints administrativos no dependan de una sola forma de key.

Impacto:

- el detalle de dictamen ya vuelve a exponer `raw` en casos modernos donde antes aparecia `{}`
- la auditoria ya puede trabajar con `_source` real

### 2. Ruta LLM controlada para esta mision

Se implemento `POST /api/v1/admin/relations-gap/analyze`.

Propiedades:

- requiere `x-admin-token` en produccion
- usa por defecto `mistral-large-2411`
- acepta `dictamenIds`
- por defecto trabaja en `dry-run`
- solo si `apply=true`, materializa relaciones con provenance `llm_gap_v1`
- no ejecuta ingest, no vectoriza y no degrada estado del dictamen

### 3. Endurecimiento de `applyRetroUpdates`

Se corrigio para:

- permitir provenance explicita (`origenExtraccion`)
- prefijar huerfanas de esta ruta con `llm_gap_v1`
- sincronizar KV usando fallback de key

### 4. Soporte semantico para `aplicado`

El prompt y los tipos de `acciones_juridicas_emitidas` ahora permiten `aplicado`, que era justamente el mayor cohorte faltante.

## Validacion realizada

### Controles positivos

Con `mistral-large-2411` en `dry-run`:

- `025436N18` -> `041169/2017 confirmado`
- `008890N20` -> `7640/2007 complementado`
- `001302N03` -> `2861/1996 aplicado`

Esto valida que la ruta nueva funciona y que `2411` si puede emitir `aplicado`.

### Muestra del cohorte faltante

Muestra evaluada:

- `000006N19`
- `000031N88`
- `000044N85`
- `E119184N25`
- `OF33281N26`
- `OF10641N26`

Resultado:

- `5/6` devolvieron `acciones_juridicas_emitidas = []`
- `1/6` devolvio una propuesta (`000031N88` -> `7640/2007 reactivado`)

Revision rapida del texto de `000031N88`:

- no se encontro anclaje textual directo a `7640` o `2007` en `documento_completo`
- por lo tanto, este output debe tratarse como sospechoso de falso positivo hasta revision humana

## Conclusion operativa

La nueva ruta con `2411` es util, pero no esta lista para aplicar masivamente sin control.

Lo demostrado es esto:

- sirve como capa de analisis dirigida
- detecta bien casos positivos conocidos
- sobre el cohorte faltante real, la tasa de hallazgo no es alta en muestra pequena
- ademas puede producir falsos positivos cuando no existe anclaje textual evidente

## Benchmark comparativo de modelos

Muestra usada:

- positivos conocidos: `001302N03`, `025436N18`, `008890N20`
- negativos/faltantes: `000006N19`, `000044N85`, `OF10641N26`

Resultados observados por calidad:

### `mistral-large-2411`

- acierta `001302N03 -> 2861/1996 aplicado`
- acierta `025436N18 -> 41169/2017 confirmado`
- acierta `008890N20 -> 7640/2007 complementado`
- deja vacios los 3 negativos de la muestra

Lectura: mejor equilibrio observado entre precision y conservadurismo.

### `magistral-medium-2509`

- acierta `025436N18 -> 41169/2017 confirmado`
- acierta `008890N20 -> 7640/2007 complementado`
- falla `001302N03` al no detectar `aplicado`
- deja vacios los 3 negativos de la muestra

Lectura: mas conservador, pero pierde cobertura justo en `aplicado`, que es el hueco mas importante del cohorte faltante.

### `ministral-14b-2512`

- en esta tarea fue significativamente mas lento que los otros modelos
- no entrego resultado en una ventana operacional razonable para el benchmark

Lectura: aunque podria reevaluarse en otro contexto, no es el mejor candidato operacional para esta mision en este worker.

### Conclusión del benchmark

Hoy, `mistral-large-2411` sigue siendo la mejor opcion para esta mision.

El problema principal no parece ser simplemente “el modelo equivocado”. Hay dos limites distintos:

- calidad/prompt: todavia falta exigir mejor evidencia textual antes de aplicar propuestas dudosas
- naturaleza del cohorte: muchos faltantes realmente vienen con `accion` e `is_accion` vacios

Por eso, antes de aplicar en masa, conviene ajustar el prompt para que toda accion emitida venga con una justificacion o cita textual verificable.


## Siguiente paso recomendado

No aplicar en masa todavia.

Secuencia recomendada:

1. usar `relations-gap/analyze` en `dry-run` sobre una muestra estratificada de 50 dictamenes
2. revisar manualmente cada salida propuesta
3. medir precision real
4. si la precision es aceptable, habilitar `apply=true` solo sobre lotes pequenos revisados
5. si la precision no alcanza, ajustar prompt para exigir evidencia textual o citas literales antes de aplicar

## Nota operativa

Durante una prueba previa se uso `re-process`, que dejo `E119184N25` en `ingested`. Ese estado fue restaurado manualmente a `vectorized` para no contaminar produccion con una ruta de prueba no adecuada para esta fase.


## Actualizacion: endurecimiento de prompt y rebenchmark

Se endurecio el prompt para exigir:

- `evidencia_textual` por cada accion emitida
- prohibicion explicita de inferir solo por flags o contexto general
- retorno de `[]` cuando no exista anclaje textual claro

### Resultado del rebenchmark con prompt endurecido

Controles usados:

- positivos: `001302N03`, `025436N18`, `008890N20`
- caso sospechoso: `000031N88`

#### `mistral-large-2411`

- mantiene `001302N03 -> 2861/1996 aplicado`
- sigue produciendo un falso positivo en `000031N88 -> 7640/2007 reactivado`
- la `evidencia_textual` devuelta en ese caso no es una cita literal confiable, sino una formulacion plausible del modelo

Lectura: aun con prompt endurecido, `2411` conserva cobertura pero no ofrece la precision suficiente para aplicar esta fase sin revision humana fuerte.

#### `magistral-medium-2509`

- `001302N03 -> 2861/1996 aplicado`
- `025436N18 -> 41169/2017 confirmado`
- `008890N20 -> 7640/2007 complementado`
- `000031N88 -> []`

Lectura: con el prompt endurecido, este modelo supero a `2411` en el equilibrio entre precision y conservadurismo para `relations-gap`.

#### `ministral-14b-2512`

- expiro a `180s` sin respuesta util en el mismo endpoint

Lectura: no es viable operacionalmente para esta ruta en el worker actual.

### Hallazgo operacional de throughput

La ruta `POST /api/v1/admin/relations-gap/analyze` no respondio dentro de `240s` cuando se intento evaluar lotes de `10-20` dictamenes con LLM remoto.

Lectura:

- el endpoint actual sirve para evaluacion dirigida
- no sirve todavia como motor de lotes medianos/grandes
- para auditorias hay que trabajar con lotes pequenos (por ejemplo `<= 5`)

### Muestra reducida estratificada (5 + 5 + 5) con `magistral-medium-2509`

Cohortes observadas:

- `ingested`: `000031N88`, `000044N85`, `0000659N18`, `000068N92`, `000076N94`
- `vectorized`: `000066N20`, `000309N20`, `000342N21`, `000355N20`, `000437N11`
- `error_quota`: `000006N19`, `000452N19`, `000891N19`, `000892N19`, `000906N19`

Resultado:

- `ingested`: `0/5` con acciones emitidas
- `error_quota`: `0/5` con acciones emitidas
- `vectorized`: `1/5` con acciones emitidas

Caso detectado:

- `000066N20` devolvio dos aristas:
  - `2695/2017 aplicado`
  - `1819/2018 confirmado`

Revision manual del texto:

- el dictamen si contiene una cita textual real a ambos oficios
- pero la semantica sigue siendo discutible: la frase relevante es que "los argumentos sostenidos por el servicio no permiten modificar el criterio contenido... y reiterado..."
- eso sugiere que el modelo todavia puede sobreatribuir tipo de accion, aunque encuentre un pasaje verdadero

### Conclusión actualizada

La fase `relations-gap` todavia no esta lista para `apply=true` en produccion.

Lo que si quedo demostrado:

- el mejor candidato actual para esta ruta es `magistral-medium-2509`
- el mayor retorno inmediato esta en el subconjunto `vectorized`
- el historico `ingested` y el cohorte `error_quota` muestran bajo rendimiento inicial
- aun se necesita una compuerta adicional antes de materializar relaciones: no basta con exigir cita textual; tambien hay que controlar mejor la asignacion semantica del `tipo_accion`

## Siguiente paso recomendado actualizado

1. concentrar la siguiente auditoria en `vectorized` sin relacion materializada
2. agregar validacion determinista adicional antes de `apply=true`
3. exigir revision humana sobre cualquier lote con `acciones_juridicas_emitidas` no vacias
4. postergar el uso de LLM sobre `ingested`/`error_quota` hasta tener mejor evidencia de retorno
