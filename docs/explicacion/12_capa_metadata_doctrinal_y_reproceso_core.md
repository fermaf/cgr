# Capa de Metadata Doctrinal y Reproceso del Core

## 1. Motivo

Las iteraciones recientes dejaron una conclusión estable:

- el retrieval semántico ya encuentra buenos puntos de entrada;
- el sistema todavía falla al convertir esos puntos de entrada en lectura doctrinal robusta;
- el problema ya no es solo de ranking, sino de modelado del corpus.

En términos prácticos, hoy el core distingue razonablemente bien:

- dictámenes cercanos a la consulta;
- algunas familias doctrinales plausibles;
- parte de la vigencia visible derivada del grafo.

Pero todavía no distingue de forma suficientemente estable entre cosas distintas:

- dictamen históricamente relevante;
- dictamen operativo actual;
- dictamen que ajusta o desplaza criterio;
- dictamen que transforma la materia en litigiosa;
- dictamen en que la CGR se abstiene de intervenir;
- dictamen meramente aplicativo o contextual.

Mientras esa distinción no exista como capa estructural del corpus, seguiremos iterando sobre síntomas:

- un caso mejora;
- otro se degrada;
- una familia densa del corpus desplaza a una lectura jurídicamente más correcta;
- el flujo guiado obliga a navegar familias que todavía no están bien tipificadas.

La solución de fondo es introducir una capa nueva y explícita:

- `metadata doctrinal` por dictamen;
- derivada del corpus completo;
- trazable a evidencia;
- recalculable;
- diseñada para alimentar tanto `doctrine-search` como el flujo guiado.

## 2. Principio Rector

La búsqueda semántica sigue mandando.

La metadata doctrinal no debe reemplazar el retrieval ni convertirse en una taxonomía rígida del derecho administrativo.

Su función es otra:

- traducir el corpus en señales doctrinales operativas;
- separar función jurídica, vigencia y estado de intervención;
- permitir que la doctrina organice mejor lo que la búsqueda ya encontró.

Regla central:

- embeddings encuentran candidatos;
- relaciones y metadata doctrinal deciden cómo deben leerse.

## 3. Diagnóstico del Límite Actual

Hoy el sistema ya tiene piezas valiosas:

- `dictamenes`
- `enriquecimiento`
- `atributos_juridicos`
- `dictamen_relaciones_juridicas`
- `semantic_anchor_dictamen`
- `graph_doctrinal_status`
- `query_intent`
- `query_subtopic`
- flujo guiado por pasos

Sin embargo, esas piezas aún no resuelven la pregunta doctrinal de más alto nivel:

“qué función cumple este dictamen dentro de la evolución real de la materia”.

Los déficits estructurales son estos:

### 3.1 Se mezcla afinidad temática con función jurídica

Un dictamen puede ser cercano a la query pero cumplir roles muy distintos:

- núcleo doctrinal;
- ajuste;
- aplicación;
- desplazamiento;
- abstención;
- cierre práctico de intervención.

Hoy ese rol no está modelado como dato estable.

### 3.2 `atributos_juridicos` no bastan

Los booleanos actuales son útiles, pero insuficientes:

- resumen efectos escalares;
- no expresan prioridad doctrinal;
- no distinguen bien entre historia doctrinal y estado operativo actual;
- no permiten razonar bien sobre cierres, abstenciones o litigiosidad.

### 3.3 `dictamen_relaciones_juridicas` captura aristas, no lectura doctrinal consolidada

La tabla relacional ya es esencial, pero por sí sola no responde:

- qué dictamen debe ser la puerta principal de lectura;
- qué dictamen solo aporta contexto;
- qué dictamen alteró el régimen de intervención de la CGR;
- cuál es el estado actual de una materia y no solo su historia.

### 3.4 El flujo guiado todavía depende demasiado del clustering

La navegación por pasos mejora la interacción, pero todavía sufre si el backend no sabe distinguir:

- foco directo;
- familia corroborada;
- estado actual de la materia;
- intervención vigente o abstención.

## 4. Objetivo de la Nueva Capa

Crear una capa estructural y recalculable que permita responder, por cada dictamen relevante:

- qué rol doctrinal cumple;
- qué señal de vigencia proyecta;
- qué efecto temporal tiene sobre la materia;
- qué tipo de intervención mantiene la CGR;
- cuánto peso debe tener como puerta de entrada;
- en qué familias doctrinales puede participar sin contaminar la lectura principal.

El objetivo no es adivinar doctrina perfecta.

El objetivo es reducir ambigüedad operacional y volver explícitas tres dimensiones distintas:

1. `foco semántico`
2. `rol doctrinal`
3. `estado actual de la materia`

## 5. Propuesta General

La solución recomendada no es solo una tabla aislada.

La pieza central sí debe ser una tabla nueva de metadata doctrinal, pero acompañada por una capa de evidencia y por un reproceso completo del corpus.

Arquitectura propuesta:

1. **Fuentes base existentes**
   - `dictamenes`
   - `enriquecimiento`
   - `atributos_juridicos`
   - `dictamen_relaciones_juridicas`
   - fuentes legales canónicas

2. **Capa nueva de evidencia doctrinal**
   - señales observadas por dictamen
   - trazables a texto, relaciones, fechas y atributos

3. **Tabla principal de metadata doctrinal**
   - un snapshot consolidado por dictamen
   - recalculable por versión del pipeline

4. **Proyecciones derivadas**
   - ranking doctrinal
   - selección de `estado_actual_materia`
   - puertas de lectura
   - familias guiadas
   - timeline y ramas

## 6. Modelo Conceptual

La unidad nueva no debe ser “el cluster” ni “el flag”.

Debe ser el **perfil doctrinal operativo del dictamen**.

Ese perfil debe capturar, al menos, estas dimensiones:

### 6.1 Rol doctrinal

Qué función cumple el dictamen en la evolución de la materia.

Valores iniciales sugeridos:

- `nucleo_doctrinal`
- `aplicacion`
- `aclaracion`
- `complemento`
- `ajuste`
- `limitacion`
- `desplazamiento`
- `reactivacion`
- `cierre_competencial`
- `materia_litigiosa`
- `abstencion`
- `criterio_operativo_actual`
- `hito_historico`
- `contexto_no_central`

No todos son mutuamente excluyentes.
Debe permitirse:

- un rol principal;
- roles secundarios;
- confianza por rol.

### 6.2 Estado de intervención de la CGR

Esta dimensión debe quedar separada del tema doctrinal.

Valores sugeridos:

- `intervencion_normal`
- `intervencion_condicionada`
- `intervencion_residual`
- `abstencion_visible`
- `materia_litigiosa`
- `sin_senal_clara`

Esto es crítico porque en varias materias el problema ya no es “qué criterio aplica”, sino:

- si la CGR sigue entrando;
- si la materia cambió de régimen de resolución o de intervención;
- si la doctrina histórica sigue siendo solo contexto.

### 6.3 Estado de vigencia doctrinal

Debe convivir con `graph_doctrinal_status`, pero en un nivel más interpretativo por dictamen.

Valores sugeridos:

- `vigente_visible`
- `vigente_tensionado`
- `vigente_en_revision`
- `desplazado_parcialmente`
- `desplazado`
- `valor_historico`
- `indeterminado`

### 6.4 Peso de lectura

El sistema necesita una señal operativa para responder:

- “este dictamen debe leerse primero”;
- “este dictamen explica el origen”;
- “este dictamen explica el estado actual”.

Por eso la metadata doctrinal debe incluir al menos:

- `reading_weight`
- `reading_role`

Valores sugeridos para `reading_role`:

- `entrada_semantica`
- `entrada_doctrinal`
- `estado_actual`
- `ancla_historica`
- `pivote_de_cambio`
- `soporte_contextual`

### 6.5 Cobertura temática

Para no crear una taxonomía rígida, la capa debe guardar solo lo necesario:

- `tema_canonico`
- `subtema_canonico`
- `tema_operativo_visible`
- `keywords_compuestas`

Esto debe ser lo suficientemente compacto para no reemplazar al retrieval, pero suficiente para evitar drift temático grueso.

## 7. Tabla Principal Propuesta

Nombre sugerido:

- `dictamen_metadata_doctrinal`

Una fila por dictamen y por versión del pipeline activo.

Campos sugeridos:

- `dictamen_id`
- `pipeline_version`
- `computed_at`
- `materia_base`
- `tema_canonico`
- `subtema_canonico`
- `rol_principal`
- `roles_secundarios_json`
- `estado_intervencion_cgr`
- `estado_vigencia`
- `reading_role`
- `reading_weight`
- `currentness_score`
- `historical_significance_score`
- `doctrinal_centrality_score`
- `shift_intensity_score`
- `family_eligibility_score`
- `drift_risk_score`
- `supports_state_current`
- `signals_litigious_matter`
- `signals_abstention`
- `signals_competence_closure`
- `signals_operational_rule`
- `anchor_norma_principal`
- `anchor_dictamen_referido`
- `evidence_summary_json`
- `confidence_global`
- `manual_review_status`
- `source_snapshot_version`
- `created_at`
- `updated_at`

### 7.1 Regla de diseño

Esta tabla no debe contener texto libre excesivo ni resúmenes largos.

Debe ser:

- estructurada;
- recalculable;
- fácil de consultar desde el core;
- adecuada para ranking y navegación.

## 8. Capa de Evidencia Recomendada

Aunque la tabla principal sea la pieza central, no conviene construirla sin trazabilidad.

Por eso se recomienda una tabla complementaria:

- `dictamen_metadata_doctrinal_evidence`

Campos sugeridos:

- `id`
- `dictamen_id`
- `pipeline_version`
- `evidence_type`
- `signal_type`
- `signal_value`
- `score`
- `confidence`
- `source_table`
- `source_locator`
- `snippet`
- `detected_by`
- `created_at`

Tipos de evidencia iniciales:

- `relation_graph`
- `atributo_juridico`
- `enrichment_text`
- `materia_text`
- `titulo_text`
- `resumen_text`
- `legal_source`
- `temporal_pattern`
- `manual_review`

Esto permite algo clave:

- la tabla principal responde rápido;
- la tabla de evidencia explica por qué ese rol fue asignado.

## 9. Cómo se Relaciona con las Tablas Existentes

### 9.1 `atributos_juridicos`

Debe seguir existiendo.

Rol futuro:

- señales de bajo nivel;
- insumo escalar;
- proyección parcial de efectos.

No debe seguir siendo la principal capa interpretativa.

### 9.2 `dictamen_relaciones_juridicas`

Sigue siendo el grafo jurídico principal.

Rol futuro:

- origen de causalidad doctrinal;
- evidencia temporal fuerte;
- base para detectar ajuste, desplazamiento, reactivación y continuidad.

No debe absorber por sí sola toda la interpretación doctrinal.

### 9.3 `enriquecimiento`

Debe seguir aportando:

- título
- resumen
- descriptores
- señales semánticas

Pero su función debe ser de apoyo, no de verdad doctrinal final.

### 9.4 `doctrine-search`

Debe consumir la nueva tabla para distinguir:

- foco semántico;
- estado actual de la materia;
- línea doctrinal plausible;
- dictámenes meramente contextuales.

### 9.5 Flujo guiado

Debe usar esta capa para decidir:

- cuándo hay familias reales;
- cuándo hay solo lectura directa;
- cuándo hay un estado actual que domina sobre la historia doctrinal;
- cómo presentar pasos de investigación sin inventar ramas.

## 10. Señales que Deben Alimentar la Metadata

La metadata doctrinal no puede depender de una sola fuente.

Debe combinar, con jerarquía explícita:

### 10.1 Señales temporales

- fecha del dictamen
- secuencia temporal dentro de la familia
- densidad de relaciones posteriores
- presencia de pivotes recientes

### 10.2 Señales relacionales

- tipo de acción jurídica
- cantidad y calidad de entrantes
- cantidad y calidad de salientes
- si un dictamen es fortalecido, desarrollado, limitado o desplazado

### 10.3 Señales textuales

- materia
- título
- resumen
- expresiones jurídicas compuestas
- vocabulario de abstención, litigiosidad, improcedencia o cierre

### 10.4 Señales normativas

- norma principal citada
- cambios de fuente legal dominante
- concentración normativa de la línea

### 10.5 Señales de centralidad

- recurrencia del dictamen dentro del grafo
- rol como representante, ancla o pivote
- estabilidad del dictamen en distintas consultas del set canónico

## 11. Jerarquía de Confianza

La capa nueva debe explicitar su jerarquía de evidencia.

Orden recomendado:

1. relaciones oficiales o estructuradas de alta confianza
2. atributos jurídicos consolidados
3. fecha y secuencia temporal corroborada
4. materia, título y resumen consistentes
5. enrichment semántico y descriptores
6. inferencia derivada de contexto

Regla práctica:

- una inferencia débil nunca debe desplazar una señal estructural fuerte;
- la metadata puede quedar incompleta;
- es preferible `indeterminado` antes que pseudo-precisión jurídica.

## 12. Preguntas que la Nueva Capa Debe Poder Responder

Antes de implementarla, conviene fijar sus preguntas objetivo.

Por dictamen:

- ¿es puerta principal de lectura o solo contexto?
- ¿expresa doctrina histórica o estado actual?
- ¿la CGR mantiene intervención o aparece abstención/litigiosidad?
- ¿fortalece, ajusta, limita o desplaza criterio?
- ¿es un hito central o un caso aplicativo?

Por materia o familia:

- ¿cuál es la lectura actual?
- ¿cuál es el ancla histórica?
- ¿qué dictamen pivote marca cambio?
- ¿qué parte de la familia conserva vigencia?
- ¿qué parte solo tiene valor histórico?

Por consulta:

- ¿el mejor primer paso es leer un dictamen directo?
- ¿hay una familia doctrinal consolidada?
- ¿hay un estado actual de la materia que debe mostrarse antes?

## 13. Reproceso del Core

Esta capa no puede poblarse con parches incrementales aislados.

Se requiere reproceso del corpus.

## 13.1 Alcance del reproceso

Debe recalcular, al menos:

- metadata doctrinal por dictamen;
- señales de vigencia y estado de intervención;
- elegibilidad de familia;
- puertas de lectura;
- proyecciones para guided flow y doctrine search.

## 13.2 Fuentes a releer

- `dictamenes`
- `enriquecimiento`
- `atributos_juridicos`
- `dictamen_relaciones_juridicas`
- fuentes legales canónicas
- overrides estructurales ya existentes

## 13.3 Orden recomendado del reproceso

1. congelar esquema canónico
2. construir extractor de evidencia doctrinal
3. poblar `dictamen_metadata_doctrinal_evidence`
4. consolidar `dictamen_metadata_doctrinal`
5. auditar cobertura y falsos positivos
6. activar consumo progresivo en endpoints

## 13.4 Estrategia de ejecución

No conviene reemplazar el comportamiento productivo en un solo salto.

Se recomienda:

- backfill completo offline;
- auditoría con set canónico y queries de borde;
- activación progresiva por lectura, no por escritura;
- cache versionada;
- rollback simple cambiando la versión consumida.

## 14. Fases de Implementación

## Fase 0: Alineación de realidad

Objetivo:

- alinear documentación, tipos y esquema efectivo.

Tareas:

- inventariar tablas reales en D1 vinculadas a doctrina;
- fijar naming canónico;
- decidir si la tabla nueva será 1 fila por dictamen o 1 fila por dictamen y versión.

Salida:

- esquema estable.

## Fase 1: Diseño de dominio

Objetivo:

- definir taxonomía mínima de rol doctrinal e intervención.

Tareas:

- cerrar enumeraciones iniciales;
- definir campos obligatorios;
- separar señales fuertes de inferencias débiles;
- definir umbrales de `indeterminado`.

Salida:

- contrato lógico del modelo.

## Fase 2: Capa de evidencia

Objetivo:

- no asignar metadata sin trazabilidad.

Tareas:

- implementar `dictamen_metadata_doctrinal_evidence`;
- extraer señales desde relaciones, atributos, enrichment y temporalidad;
- versionar extractores.

Salida:

- evidencia doctrinal auditable.

## Fase 3: Consolidación

Objetivo:

- construir el snapshot principal.

Tareas:

- resolver rol principal;
- calcular vigencia;
- detectar abstención, litigiosidad y cierre;
- calcular pesos de lectura y centralidad;
- marcar elegibilidad de familia.

Salida:

- `dictamen_metadata_doctrinal`.

## Fase 4: Auditoría

Objetivo:

- evitar una capa nueva opaca.

Tareas:

- construir consultas de validación;
- revisar materias de borde;
- medir falsos positivos de `estado_actual`;
- medir drift de familias.

Salida:

- umbrales corregidos antes de consumo productivo.

## Fase 5: Consumo en backend

Objetivo:

- mover los endpoints al nuevo modelo.

Orden recomendado:

1. guided flow
2. `doctrine-search`
3. `doctrine-lines`

Primero guided flow porque es donde más valor agrega separar:

- `focus_directo`
- `estado_actual_materia`
- `familias_candidatas`

## Fase 6: Reproyección visible

Objetivo:

- trasladar la mejora al frontend sin metalenguaje.

Tareas:

- cambiar textos de UI para hablar de:
  - lectura actual
  - hito histórico
  - materia litigiosa
  - abstención visible
  - pivote de cambio
- no mostrar categorías internas innecesarias.

## 15. Cambios Esperados en el Producto

Si esta capa se implementa bien, el sistema debería comportarse mejor en tres frentes:

### 15.1 Búsqueda doctrinal

Mejor separación entre:

- resultado semánticamente cercano;
- lectura doctrinal principal;
- estado actual de la materia.

### 15.2 Investigación guiada

Menos ramas falsas.

Mejor decisión sobre:

- cuándo abrir familias;
- cuándo seguir desde un dictamen directo;
- cuándo advertir que la materia cambió de régimen.

### 15.3 Vigencia visible

La plataforma debería explicar mejor:

- qué sigue vigente;
- qué está tensionado;
- qué fue desplazado;
- cuándo la CGR se abstiene o deja de intervenir.

## 16. Riesgos

### 16.1 Taxonomía demasiado ambiciosa

Riesgo:

- crear una ontología jurídica inmantenible.

Mitigación:

- empezar con un set mínimo y operativo;
- priorizar roles que afectan lectura visible.

### 16.2 Falsos positivos de cierre o abstención

Riesgo:

- sobrerreaccionar a texto ambiguo.

Mitigación:

- exigir evidencia compuesta;
- permitir `sin_senal_clara`;
- no promover una señal débil a lectura principal.

### 16.3 Reproceso costoso y difícil de auditar

Riesgo:

- poblar una tabla nueva sin saber por qué cada fila quedó así.

Mitigación:

- evidencia versionada;
- consultas de auditoría;
- consumo progresivo.

### 16.4 Nueva capa que duplique al core

Riesgo:

- crear una arquitectura paralela.

Mitigación:

- usar la tabla como proyección estructural del core existente;
- no reemplazar `dictamen_relaciones_juridicas`;
- no reemplazar embeddings;
- no mover lógica central al frontend.

## 17. Criterios de Éxito

La capa será correcta si logra esto:

- menos familias laterales visibles;
- mejor separación entre historia doctrinal y estado actual;
- mejor priorización de dictámenes que cierran, condicionan o desplazan intervención;
- menos pseudo-precisión;
- mejor capacidad para reconstruir la línea temporal real.

Señales observables de éxito:

- más consultas donde el sistema distingue correctamente entre foco directo y estado actual;
- menos necesidad de reglas ad hoc por materia;
- guided flow más estable frente a queries cortas o ambiguas;
- auditoría doctrinal más explicable para cada decisión visible.

## 18. Plan Operativo Recomendado

Orden realista para empezar:

1. cerrar diseño del esquema nuevo;
2. implementar tablas y tipos TypeScript;
3. construir extractor de evidencia doctrinal;
4. correr backfill completo sobre todo el corpus;
5. auditar una batería canónica de consultas y dictámenes;
6. conectar primero el flujo guiado;
7. conectar después `doctrine-search`;
8. documentar nuevas consultas de auditoría y rollback.

## 19. Decisión Recomendada

La siguiente etapa del proyecto no debe ser otro ajuste fino del ranking visible.

Debe ser:

- modelar `metadata doctrinal` como capa estructural del corpus;
- reprocesar el core para poblarla;
- usarla como intermediaria entre búsqueda semántica y organización doctrinal.

Eso mantiene el principio del proyecto:

- la búsqueda semántica manda;
- la doctrina organiza;
- y la organización doctrinal deja de depender solo de clustering y heurísticas locales.
