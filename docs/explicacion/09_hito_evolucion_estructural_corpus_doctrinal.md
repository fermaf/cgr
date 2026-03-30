# 09 - Hito: Evolución Estructural del Corpus Doctrinal

## Estado del hito

Este hito comienza cuando Indubia deja de limitarse a:

- detectar incoherencia doctrinal;
- sugerir acciones estructurales;
- explicar ruido o fragmentación;

y pasa a aplicar mejoras repetibles sobre el corpus doctrinal visible.

## Problema atacado en esta iteración

La consulta semántica `contrata confianza legitima` seguía mostrando fragmentación artificial visible:

- múltiples líneas doctrinales con el mismo título base `Confianza legítima`;
- una variante adicional `Confianza legitima` causada por diferencias superficiales de normalización;
- una experiencia de lectura que seguía duplicando doctrina donde el usuario esperaba una sola línea más coherente.

No era el momento de rehacer embeddings ni de abrir una taxonomía nueva. El problema era estructural y visible.

## Decisión tomada

Se priorizó el frente `fragmentación artificial residual` por sobre:

- `outliers doctrinales`
- `relaciones jurídicas huérfanas de alto valor visible`

La razón fue simple:

- impacto visible inmediato en el producto;
- bajo riesgo relativo;
- posibilidad de aplicar una remediación conservadora sobre estructura derivada, sin tocar corpus fuente.

## Cambio aplicado

Se extendió `skill_doctrine_structure_remediation_executor` para que pueda operar también sobre resultados de `doctrine-search`, no solo sobre `doctrine-lines`.

Con esa capacidad se aplicó un merge estructural derivado de bajo riesgo para:

- `020445N19`
- `E156769N21`

La remediación consolidó dos clusters equivalentes de `Confianza legítima` dentro de la búsqueda visible.

### Por qué este merge fue considerado seguro

- título doctrinal equivalente tras normalización;
- overlap relevante de descriptores normalizados;
- overlap suficiente de fuentes legales dominantes;
- efecto esperado acotado: reducir una duplicación visible, no reescribir la doctrina.

## Qué cambió para el usuario

Antes:

- la búsqueda `contrata confianza legitima` mostraba cuatro líneas;
- una de ellas era una variante superficial de la misma doctrina.

Después:

- la búsqueda reduce esa duplicación;
- la línea visible se muestra más coherente;
- el recorrido doctrinal mejora sin tocar textos originales ni embeddings.

## Qué no se tocó

- `dictamenes_source`
- `dictamenes_paso`
- embeddings en Pinecone
- textos doctrinales originales
- relaciones jurídicas canónicas

La remediación se aplicó únicamente sobre estructura derivada doctrinal.

## Trazabilidad

La iteración deja:

- candidate action auditable;
- before/after explícito;
- IDs afectados;
- racional del merge;
- registro en `doctrine_structure_remediations`;
- audit trail local del executor.

## Cómo revisar

1. Abrir la web publicada.
2. Buscar: `contrata confianza legitima`.
3. Comparar el resultado visible:
   - antes la búsqueda devolvía cuatro líneas fragmentadas;
   - ahora la variante superficial de `Confianza legitima` queda absorbida por una línea canónica más coherente.

## Qué sigue

El siguiente paso del hito no es otro merge ciego.

Lo correcto es atacar la siguiente categoría con más valor:

- relaciones jurídicas huérfanas de alto valor visible dentro de líneas activas.
