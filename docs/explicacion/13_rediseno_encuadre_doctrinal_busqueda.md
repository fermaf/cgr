# Rediseño del Encuadre Doctrinal de Búsqueda

## Problema detectado

La búsqueda doctrinal estaba organizada de hecho por `cluster + representative_dictamen_id`.

Eso generaba una mezcla conceptual:

- la recuperación semántica encontraba dictámenes;
- el clustering los convertía en líneas;
- la metadata doctrinal modulaba ranking y lectura;
- pero el `estado actual de la materia` seguía entrando como una línea sintética añadida al final.

En consecuencia, la plataforma podía presentar en una misma superficie:

- un dictamen directamente coincidente;
- una línea histórica todavía semánticamente cercana;
- una señal de abstención, litigiosidad o cambio de régimen;

sin separar con nitidez qué debía gobernar la lectura y qué debía quedar como contexto.

## Cambio introducido

Se agregó una capa explícita de `encuadre doctrinal` por encima del ranking híbrido existente.

Esta capa no reemplaza el retrieval semántico ni el clustering. Los reordena para presentación jurídica.

### 1. Tipificación de consulta

La respuesta ahora clasifica la consulta en uno de estos modos:

- `estado_actual_materia`
- `linea_historica`
- `dictamen_puntual`
- `exploratoria`

La tipificación es conservadora y determinística. Su función no es resolver el fondo jurídico, sino ordenar la respuesta visible según la intención aparente de investigación.

### 2. Tipificación de entradas visibles

Cada entrada visible de `doctrine-search` ahora queda marcada como:

- `matter_status`
- `direct_hit`
- `doctrinal_line`

Esto evita seguir tratando como equivalentes:

- un estado actual que gobierna la materia;
- un dictamen documental muy cercano a la consulta;
- una línea doctrinal amplia.

### 3. Seccionamiento de la respuesta

La respuesta ya no es solo una lista plana de líneas. Ahora puede incluir secciones visibles:

- `estado_actual`
- `dictamen_directo`
- `doctrina_vigente`
- `cambio_y_revision`
- `contexto_historico`

La metadata doctrinal y las señales de actividad doctrinal pasan a gobernar este encuadre.

## Criterio jurídico-técnico

La regla nueva es general y no depende de materias particulares.

### Estado actual

Se usa cuando aparece una señal actual fuerte que debe gobernar la lectura:

- abstención competencial;
- materia litigiosa;
- cambio visible de régimen;
- o criterio operativo actual suficientemente corroborado.

### Dictamen directo

Se conserva cuando hay coincidencia semántica fuerte con la consulta, pero sin confundirlo con estado doctrinal dominante.

### Doctrina vigente

Agrupa líneas todavía aptas para organizar la lectura principal de la materia.

### Cambio y revisión

Agrupa líneas cuya función principal es mostrar:

- tensión doctrinal;
- pivotes de cambio;
- revisión;
- desplazamiento visible.

### Contexto histórico

Agrupa líneas que siguen siendo útiles como antecedente, pero que no deben leerse como estado actual.

## Qué no resuelve todavía

Este cambio no reemplaza todavía la unidad doctrinal subyacente `cluster + representative_dictamen`.

Por eso el rediseño debe entenderse como una corrección estructural de presentación y gobierno de lectura, no como la solución final del modelado doctrinal.

La deuda de fondo que sigue abierta es:

- pasar de una línea representada por un dictamen a una familia doctrinal con estados internos explícitos;
- separar mejor doctrina vigente, doctrina desplazada y antecedentes históricos;
- dejar que la metadata doctrinal gobierne antes la organización familiar y no solo la presentación final.

## Dirección siguiente recomendada

La siguiente iteración del core debería construir una entidad doctrinal explícita, distinta del cluster semántico:

- `familia doctrinal`
- `estado actual de la familia`
- `hitos de cambio`
- `antecedentes históricos`
- `dictámenes coincidentes con la consulta`

Con eso, el retrieval semántico seguiría mandando para recuperar evidencia, pero dejaría de gobernar la forma final de organización doctrinal.
