# Query Intent Layer

## Qué problema resuelve

La búsqueda doctrinal ya recupera bien consultas correctas y ahora también tolera errores moderados con query rewriting. Faltaba una capa ligera para detectar el tipo de problema jurídico implícito en la consulta y usar esa señal como un ajuste pequeño del ranking.

## Cómo funciona

1. Se toma la consulta original.
2. Si existe una consulta interpretada segura, también se considera.
3. Se aprovechan los primeros resultados semánticos ya recuperados.
4. Se contrasta ese material con una lista corta de intents jurídicos canónicos.
5. Se elige el intent más probable con una confianza heurística.
6. Ese intent da un boost pequeño al orden de líneas doctrinales afines.

## Por qué no usa LLM

En esta fase no necesitamos otro paso generativo. El objetivo es detectar intención con baja latencia y sin riesgo de cambiar el problema jurídico formulado por el usuario.

## Qué sí hace

- refuerza líneas doctrinales claramente alineadas con el tema detectado
- ayuda en queries telegráficas o mezcladas
- conserva el recall base del retrieval semántico

## Qué no intenta hacer

- no interpreta hechos complejos
- no sustituye el query rewriting
- no clasifica todo el derecho administrativo
- no reestructura el corpus

## Cómo puede crecer después

- ampliar el catálogo de intents
- calibrar pesos con el set canónico de queries
- usar señales de interacción real para aprender qué intents ayudan más al retrieval
