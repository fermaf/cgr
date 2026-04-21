# Capa de Subtema Jurídico

## Motivo

Después de corregir el sesgo más grave de `doctrine-search` hacia líneas históricas densas, el problema residual ya no es de recencia global sino de especificidad doctrinal.

El síntoma visible es este:

- la búsqueda ya distingue mejor entre línea histórica y línea activa
- pero todavía puede priorizar una línea demasiado general dentro de la materia correcta
- eso ocurre cuando la consulta contiene un subtópico jurídico más preciso que la materia dominante

Ejemplos observados en la evaluación canónica:

- `confianza legitima contrata`
  - mejora fuerte ya conseguida
  - la línea activa reciente pasó a primer lugar
- `subrogacion corfo prenda acciones`
  - la corrección de `query_intent` ya evitó una deriva absurda hacia `confianza legítima`
- `invalidacion administrativa plazo razonable`
  - el sistema reconoce la materia, pero todavía mezcla “invalidación administrativa” general con el subtópico “plazo/caducidad”
- `responsabilidad servicio falta servicio incendio`
  - el sistema encuentra un territorio relacionado, pero no expresa bien el subtópico central

## Diagnóstico

Hoy el pipeline tiene estas capas:

1. query rewrite conservador
2. retrieval semántico con apoyo lexical
3. clustering doctrinal
4. ranking híbrido
5. ajustes por actualidad doctrinal y familia doctrinal
6. `query intent` de grano relativamente grueso

Eso alcanza para:

- corregir recall
- evitar errores gruesos de tema
- hacer emerger giros doctrinales recientes

Pero no alcanza para este problema:

“dentro de una misma materia, cuál es el subtópico jurídico efectivamente pedido por la consulta”.

## Qué sería un subtema jurídico

No es una materia amplia como:

- confianza legítima
- invalidación administrativa
- responsabilidad administrativa

Es una unidad más específica, cercana a cómo un abogado formula el problema:

- plazo de caducidad de la invalidación
- confianza legítima en contrata con litigiosidad judicial
- órgano incompetente y validez del acto
- subrogación CORFO con prenda sobre acciones

## Diseño propuesto

### 1. Capa ligera de detección de subtema

Agregar una capa posterior a `query_intent` y anterior al ranking final.

Entrada:

- `query`
- `rewrittenQuery`
- top matches semánticos
- clusters ya construidos

Salida:

- `subtopic_label`
- `confidence`
- `matched_terms`
- `subtopic_terms`

La idea no es clasificar todo el derecho administrativo.
La idea es detectar un eje doctrinal más fino cuando la consulta lo trae de forma suficientemente clara.

### 2. El subtema no reemplaza la materia

La materia sigue siendo el nivel superior.

El subtema opera sólo como:

- refinador de ranking entre líneas hermanas
- refinador de `query_match_reason`
- señal para elegir mejor el `semantic_anchor_dictamen`

No debe:

- abrir otra arquitectura paralela
- crear taxonomías gigantes
- reemplazar el clustering doctrinal actual

### 3. Fuente principal del subtema

La mejor fuente inicial no es un LLM.

La mejor fuente inicial es una combinación de:

- términos de la query
- descriptores AI ya presentes en metadata
- títulos y resúmenes doctrinales
- algunas expresiones jurídicas compuestas

Ejemplos de expresiones compuestas útiles:

- `plazo razonable`
- `dos anos`
- `articulo 53`
- `organo incompetente`
- `falta de servicio`
- `prenda acciones`
- `termino contrata`
- `no renovacion`
- `corte suprema`
- `materia litigiosa`

## Arquitectura mínima viable

### Opción A: Boost por términos compuestos

Agregar un catálogo pequeño de subtemas por intent canónico.

Ejemplo:

- `invalidación administrativa`
  - `plazo/caducidad`
  - `articulo 53`
  - `incompetencia`
- `confianza legítima`
  - `no renovación`
  - `término anticipado`
  - `litigiosidad judicial`
- `CORFO y garantías`
  - `subrogación`
  - `prenda sobre acciones`

Ventajas:

- barata
- explicable
- fácil de calibrar con el set canónico

Desventajas:

- cobertura limitada
- requiere mantención manual

### Opción B: Perfil léxico de cluster

Construir, para cada línea visible, un pequeño perfil de subtema con:

- `cluster_label`
- `top_descriptores_AI`
- términos frecuentes de títulos/resúmenes
- fuente legal dominante cuando sea distintiva

Luego medir similitud entre query y perfil.

Ventajas:

- usa datos reales del corpus
- escala mejor que un catálogo estático

Desventajas:

- más sensible a ruido de metadata
- puede amplificar descriptores malos si no hay saneamiento

### Opción C: Subtema híbrido

Usar:

- catálogo corto de expresiones compuestas
- más perfil léxico real del cluster

Y aplicar el subtema sólo cuando:

- la confianza supera un umbral claro
- existe competencia entre líneas de la misma materia o familia doctrinal

Esta es la opción recomendada.

## Recomendación

Implementar sólo la opción C, pero en un alcance pequeño.

## Implementación inicial

Se implementó una primera capa mínima en `doctrine-search` con este alcance:

- detección de `subtema jurídico` posterior a `query_intent`;
- catálogo corto de expresiones compuestas por intent canónico;
- uso de perfil léxico real del cluster con:
  - `cluster_label`,
  - `top_descriptores_AI`,
  - títulos y resúmenes visibles;
- impacto limitado a:
  - orden relativo entre líneas hermanas,
  - selección del `semantic_anchor_dictamen`,
  - `query_match_reason`.

Todavía no cambia:

- retrieval base;
- clustering doctrinal;
- materia dominante global.

### Fase 1

Cubrir sólo materias donde ya vimos retorno claro:

- confianza legítima
- invalidación administrativa
- competencia administrativa
- CORFO y garantías
- responsabilidad administrativa / falta de servicio

### Fase 2

El subtema sólo debe afectar:

- orden relativo entre líneas de la misma materia
- elección del `semantic_anchor_dictamen`
- explicación visible de por qué aparece una línea
- pertenencia visible al cluster cuando una línea no conserva cobertura suficiente de la query

No debe afectar:

- retrieval base
- generación general del corpus
- taxonomía jurídica global

## Implementación actual

La fase hoy ya no es sólo un boost liviano.

Se aplicaron cuatro correcciones estructurales dentro de `doctrine-search`:

- detección de `query_intent` y `query_subtopic` con mayor peso de la query real que del retrieval contaminado;
- clustering query-condicionado en `doctrineClusters.ts`, usando afinidad con la consulta para admitir o degradar miembros;
- penalización explícita a líneas con cobertura insuficiente de la query, aunque tengan vecinos semánticos cercanos;
- selección del `dictamen directo` por score combinado de retrieval, cobertura de query y ajuste al subtema, en vez de confiar ciegamente en el primer hit semántico.

### Qué resolvió

- para queries compuestas como `incendio pago subsidio serviu`, el foco visible ya abre el dictamen correcto (`E563419N24`);
- para queries más cortas como `incendio subsidio serviu`, también se prioriza `E563419N24` como lectura directa;
- la respuesta expone `query_subtopic`, lo que mejora trazabilidad y explicación.

### Qué sigue pendiente

- todavía pueden sobrevivir líneas doctrinales laterales en posiciones secundarias;
- la `materiaEvaluated` residual puede contaminarse cuando el retrieval inicial trae familias jurídicas ajenas pero densas;
- el siguiente nivel real de corrección está en volver más estricta la construcción query-céntrica de clusters y no sólo su presentación final.

## Criterio de éxito

La capa vale la pena sólo si produce mejoras visibles en el set canónico y en queries reales difíciles.

Señales esperadas:

1. Menos errores de línea “demasiado general”.
2. Mejor selección del dictamen ancla en queries compuestas.
3. Menos necesidad de boosts globales de actualidad.
4. Explicaciones de ranking más jurídicas y menos genéricas.

## Criterio de no implementación

No conviene implementarla si:

- obliga a crear una taxonomía jurídica demasiado grande
- depende de metadata que todavía no es confiable
- mejora sólo casos aislados
- empieza a competir con el retrieval semántico en vez de afinarlo

## Juicio actual

Sí existe una oportunidad real.

Pero no justifica todavía una implementación amplia.

La mejora dramática ya conseguida vino de:

- separar línea histórica y línea activa
- corregir representación visible
- corregir intent grueso

La capa de subtema jurídico puede ser la siguiente mejora grande sólo si se implementa como refinamiento acotado y medible, no como nueva ontología del sistema.

## Siguiente paso recomendado

Si se decide avanzar:

1. crear un módulo `querySubtopic.ts`
2. empezar con 4 a 6 familias doctrinales
3. usar sólo expresiones compuestas y descriptores existentes
4. medir contra `docs/evaluation/canonical_queries.json`
5. abortar si no mejora al menos 2 o 3 consultas difíciles de forma clara

Ese umbral es importante para no seguir agregando complejidad sin retorno visible.
