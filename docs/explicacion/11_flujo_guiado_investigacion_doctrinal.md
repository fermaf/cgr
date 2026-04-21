# Flujo Guiado de Investigación Doctrinal

## Motivo

El modo `one-shot` sirve para entregar un buen punto de entrada, pero no para resolver de forma confiable toda la organización doctrinal cuando la consulta es ambigua o mezcla varias familias posibles.

El problema de fondo no era solo de ranking. Era de interacción:

- la query inicial suele ser insuficiente para fijar una familia doctrinal única;
- el sistema podía recuperar un dictamen correcto, pero construir una línea incorrecta;
- las familias laterales densas podían contaminar la respuesta visible;
- la evolución temporal del criterio quedaba implícita y no navegable.

Por eso se introduce un paradigma nuevo:

- la búsqueda semántica sigue mandando para encontrar el mejor punto de entrada;
- la doctrina deja de presentarse como verdad cerrada `one-shot`;
- el usuario pasa a construir la investigación recorriendo familias doctrinales y su línea temporal.

## Principio rector

La unidad inicial de respuesta ya no es solo la "línea doctrinal correcta".

Ahora la respuesta debe separar explícitamente:

1. `foco_directo`
2. `familias_candidatas`
3. `ruta_temporal_inicial`
4. `pasos_sugeridos`

Esto evita que el sistema invente una línea consolidada cuando lo único que tiene realmente es un dictamen muy pertinente y varias familias plausibles.

## Importancia del grafo jurídico

Este flujo no puede descansar solo en embeddings ni en clusters semánticos.

Debe usar de forma visible:

- `dictamen_relaciones_juridicas`
- `atributos_juridicos`
- fecha documental
- secuencia entre dictámenes
- señales de ajuste, limitación o desplazamiento doctrinal

La línea temporal es crítica porque la doctrina administrativa no es estática.

Un dictamen puede:

- seguir operativo;
- haber sido desarrollado;
- estar tensionado;
- haber sido limitado;
- haber sido desplazado por decisiones posteriores.

Por eso la navegación guiada necesita mostrar no solo cercanía semántica, sino también vigencia doctrinal efectiva.

## Contrato inicial del backend

Se agrega `GET /api/v1/insights/doctrine-guided?q=...&limit=...`.

La respuesta inicial contiene:

- `overview`
  - `query`
  - `query_interpreted`
  - `query_intent`
  - `query_subtopic`
  - `searchMode`
  - `navigation_mode = guided`
  - `ambiguity_visible`
  - `total_families`

- `focus_directo`
  - dictamen prioritario para comenzar a leer
  - razón de selección
  - atributos jurídicos visibles
  - conteo de relaciones entrantes y salientes
  - señal doctrinal actual

- `familias_candidatas`
  - lista de rutas doctrinales plausibles
  - representante visible
  - estado doctrinal
  - resumen relacional
  - siguiente paso sugerido

Importante:

- estas familias ya no deben salir solo del clustering bruto;
- deben conservar anclajes suficientes con la query y, cuando exista, con el `query_subtopic`;
- si una familia es lateral o genérica, debe quedar fuera aunque pertenezca a un cluster denso del corpus.

- `ruta_temporal_inicial`
  - secuencia relacional básica del foco directo
  - antecedentes
  - posteriores
  - efecto doctrinal de cada relación
  - lectura de vigencia actual

- `suggested_steps`
  - instrucciones simples de navegación reversible

## Contrato de profundización

Se agrega también `GET /api/v1/insights/doctrine-guided/family?q=...&family_id=...&limit=...`.

Su objetivo es profundizar una familia elegida sin rehacer la investigación desde cero.

La respuesta contiene:

- `overview`
  - mismos datos de query e intención
  - `navigation_mode = guided_family`
  - `family_found`

- `breadcrumb`
  - secuencia mínima de navegación:
    - consulta
    - foco directo
    - familia elegida

- `family`
  - representante visible
  - estado doctrinal
  - motivo de aparición
  - pivote visible si existe

- `timeline.dictamenes`
  - dictámenes clave de la familia
  - rol en la línea
  - resumen
  - atributos jurídicos
  - conteos de relaciones entrantes y salientes
  - señal doctrinal actual por dictamen

- `timeline.relation_edges`
  - relaciones jurídicas que tocan la familia
  - efecto doctrinal proyectado
  - marca `inside_family` para distinguir relaciones internas de relaciones de contexto

- `sibling_families`
  - familias hermanas para bifurcar o retroceder

## Alcance actual

La implementación inicial no resuelve todavía toda la navegación multi-paso.

Sí resuelve:

- separar `foco_directo` de `familias_candidatas`;
- exponer ambigüedad doctrinal en vez de esconderla;
- entregar una primera ruta temporal basada en relaciones reales;
- apoyar el siguiente rediseño del frontend sin depender del modo `one-shot`.

Todavía no resuelve:

- expansión profunda de una familia con subramas sucesivas;
- depuración completa de familias laterales densas.

Ya resuelve parcialmente:

- persistencia básica de la investigación en URL mediante `q`, `step` y `family`;
- restauración del paso visible y de la familia seleccionada al recargar o retroceder;
- invalidación conservadora de una familia si deja de ser plausible bajo el filtro query-condicionado.

## Siguiente fase natural

1. persistir estado de investigación reversible:
   - pila de pasos
   - familia elegida
   - dictamen foco actual
2. reforzar relaciones finas:
   - consolidación
   - desarrollo
   - ajuste
   - limitación
   - desplazamiento
3. hacer que el frontend navegue:
   - consulta
   - foco directo
   - familia
   - línea temporal
   - volver

## Criterio de éxito

La nueva arquitectura será mejor que el `one-shot` solo si:

- reduce errores de familia principal visible;
- mejora lectura jurídica de vigencia y cambio doctrinal;
- hace explícitas las bifurcaciones en vez de ocultarlas en un ranking;
- permite retroceder y explorar otra familia sin rehacer toda la búsqueda.
