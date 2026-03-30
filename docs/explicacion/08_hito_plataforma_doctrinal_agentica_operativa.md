# 08 - Hito: Plataforma Doctrinal Agéntica Operativa

## Estado del hito

Este hito se considera **cerrado** cuando Indubia demuestra, con evidencia real, que puede:

1. detectar problemas estructurales del corpus doctrinal;
2. proponer acciones de mejora explicables;
3. ejecutar al menos una remediación estructural real y visible;
4. reflejar ese cambio en el producto publicado;
5. dejar trazabilidad suficiente para revisión posterior.

Ese umbral ya fue alcanzado.

## Capacidades ya operativas

### Producto doctrinal

- `doctrine-search` funcional.
- `doctrine-lines` funcional.
- `dictamen pivote` visible.
- `estado doctrinal` visible.
- `dinámica jurídica` visible: `consolida`, `desarrolla`, `ajusta`.
- `reading workspace` con lectura guiada.
- citas normativas presentadas con mayor contexto jurídico.

### Capa agéntica

- `skill_embedding_consistency_check`
- `skill_metadata_quality_audit`
- `skill_metadata_remediation_planner`
- `skill_metadata_auto_normalization_executor`
- `skill_metadata_blocker_regeneration_executor`
- `skill_doctrine_coherence_audit`
- `skill_doctrine_structure_remediation_executor`

Estas skills cubren el loop mínimo:

`detectar -> priorizar -> preparar -> aplicar`

## Cambio estructural real ejecutado

### Caso aplicado

Se ejecutó una remediación estructural real sobre la doctrina visible de **Competencia administrativa**.

Antes:

- la materia aparecía artificialmente fragmentada en **7 líneas equivalentes** dentro de la muestra visible;
- eso degradaba navegación, lectura doctrinal y percepción de cohesión.

Después:

- se persistió una remediación derivada `merge_clusters`;
- `doctrine-lines` y `doctrine-search` consumen ese override sin tocar embeddings ni textos fuente;
- la línea canónica muestra la nota:
  - `Esta línea consolida 7 clusters equivalentes previamente fragmentados.`

### Alcance técnico del cambio

La remediación:

- **no** modifica `dictamenes_source`;
- **no** modifica `dictamenes_paso`;
- **no** modifica textos doctrinales originales;
- **no** recalcula Pinecone;
- **sí** modifica estructura doctrinal derivada consumida por el producto.

## Evidencia de validación

### Preview del merge

La skill `skill_doctrine_structure_remediation_executor` seleccionó un `suggest_merge_clusters` con:

- confianza: `0.86`
- overlap de fuentes: `0.79`
- overlap de descriptores: `0.57`
- representative IDs confirmados explícitamente

### Apply del merge

La remediación fue aplicada con un único override derivado.

### Validación visible en API/web

Tras deploy:

- `https://cgr-platform.abogado.workers.dev/api/v1/insights/doctrine-lines?limit=8`
- `https://cgr-jurisprudencia-frontend.pages.dev/api/v1/insights/doctrine-lines?limit=8`

ambos ya muestran:

- `overview.totalLines = 2`
- una línea canónica de `Competencia administrativa`
- `structure_adjustments.action = "merge_clusters"`
- `merged_cluster_count = 7`

## Qué no resuelve este hito

Este cierre **no** implica que el corpus esté “resuelto”.

Quedan fuera de este hito:

- separación automática de líneas ambiguas;
- reasignación puntual de outliers;
- reducción sistemática de huérfanos relacionales;
- remediación semántica masiva de materias narrativas;
- reestructuración completa del pipeline doctrinal.

## Resultado del hito

Indubia ya no es solo un explorador doctrinal enriquecido.

Ahora es una plataforma que puede:

- auditar su propia estructura;
- detectar incoherencias doctrinales;
- proponer acciones de mejora;
- aplicar una remediación estructural real con guardas;
- reflejar el cambio en el producto visible.

## Siguiente hito recomendado

### Nombre

`Evolución estructural del corpus doctrinal`

### Objetivo

Pasar de una primera remediación puntual a una capacidad sistemática de mejora estructural sobre:

- outliers doctrinales;
- líneas artificialmente fragmentadas;
- relaciones jurídicas huérfanas de alto valor visible.

### Criterio

El siguiente hito ya no necesita probar que la agentización funciona.

Debe probar que la estructura doctrinal puede seguir mejorando de forma incremental, segura y repetible.
