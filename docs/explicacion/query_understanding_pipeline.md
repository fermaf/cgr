# Query Understanding Pipeline

Indubia agrega una capa conservadora de `query understanding` antes del retrieval doctrinal para mejorar recall en consultas con errores moderados, lenguaje telegráfico o redacción poco jurídica.

## Qué problema resuelve

Hay consultas donde la intención jurídica es correcta, pero la forma escrita degrada el retrieval semántico:

- errores ortográficos: `cofirnza legitima`
- lenguaje apurado: `contrata diciembre`
- mezcla de conceptos fácticos y jurídicos

En esos casos, el embedding de la consulta original puede perder precisión aunque el corpus sí tenga el dictamen relevante.

## Cómo funciona

Pipeline:

1. `query_original`
2. normalización ligera
3. rewrite conservador con `mistral-large-2411`
4. dual retrieval:
   - retrieval con la query original
   - retrieval con la query reescrita
5. merge seguro de resultados
6. ranking híbrido semántico-doctrinal existente
7. organización doctrinal final

## Modelo usado

La capa usa explícitamente:

- `mistral-large-2411`

No usa `MISTRAL_MODEL` por defecto y no toca el enrichment doctrinal con `mistral-large-2512`.

## Qué sí hace el rewrite

- corrige ortografía moderada
- ordena redacción
- expande levemente abreviaciones o términos implícitos
- preserva la intención jurídica original

## Qué no intenta hacer

- no analiza el caso
- no inventa normas
- no agrega hechos
- no reemplaza la búsqueda original
- no modifica embeddings ni Pinecone

## Guardas

El rewrite se descarta si:

- elimina términos clave
- cambia demasiado la longitud
- introduce demasiados conceptos nuevos
- falla el modelo o vence el timeout

Si eso ocurre, Indubia sigue con la consulta original.

## Trazabilidad

En modo debug se registra:

- `query_original`
- `query_rewritten`
- aceptación o descarte
- razón del descarte
- confianza heurística
- modelo usado
- tiempo de ejecución

## Extensión futura

Más adelante esta capa puede:

- especializar rewrites por tipo de consulta
- comparar desempeño por cohorte de queries
- incorporar reglas léxicas previas para errores frecuentes del dominio

Sin cambiar el principio central:

la doctrina organiza el resultado, pero la búsqueda semántica sigue siendo la señal primaria.
