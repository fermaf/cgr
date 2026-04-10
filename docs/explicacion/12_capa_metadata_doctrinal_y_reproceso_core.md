# Capa de Metadata Doctrinal y Reproceso del Core

## 1. Qué es este documento

Este documento explica una pieza central de Indubia:

- qué problema resuelve la metadata doctrinal;
- dónde se ubica dentro del pipeline del producto;
- cómo se modela;
- cómo se calcula;
- cómo se opera;
- cómo se audita;
- y cómo reconstruirla si alguien nuevo necesita entenderla o rehacerla.

Debe servir para tres perfiles distintos:

1. alguien nuevo en el proyecto que necesita entender de qué se está hablando;
2. alguien técnico que necesita operar o depurar el sistema;
3. alguien experto que quiera revisar el modelo doctrinal o hacer ingeniería inversa del core.

No es una bitácora de experimentos. Es una descripción estructural del sistema tal como existe hoy.

## 2. Resumen ejecutivo

Indubia no es solo un buscador semántico. Es una plataforma que intenta organizar jurisprudencia administrativa en una lectura doctrinal útil.

La búsqueda semántica encuentra dictámenes cercanos a una consulta. Pero eso no basta para responder preguntas jurídicas de verdad. Entre dos dictámenes cercanos puede haber diferencias doctrinales decisivas:

- uno puede ser el criterio vigente;
- otro puede ser solo un antecedente histórico;
- otro puede solo aplicar un criterio ya conocido;
- otro puede mostrar que la Contraloría dejó de intervenir;
- otro puede indicar que la materia pasó a ser litigiosa;
- otro puede cerrar la competencia del órgano.

La capa de metadata doctrinal existe para resolver exactamente ese problema.

Su función no es reemplazar embeddings, clustering o relaciones jurídicas. Su función es agregar una capa estable de lectura por dictamen, de modo que el sistema no solo encuentre documentos parecidos, sino que también sepa cómo leerlos dentro de la evolución doctrinal de una materia.

## 3. Problema que aborda

### 3.1 El límite del retrieval semántico

El retrieval semántico responde bien a esta pregunta:

> ¿Qué dictámenes son cercanos a esta consulta?

Pero no responde por sí solo a estas otras preguntas:

- ¿Cuál debe leerse primero?
- ¿Cuál expresa el estado actual de la materia?
- ¿Cuál solo sirve como contexto?
- ¿Cuál tiene valor histórico?
- ¿Cuál alteró el criterio previo?
- ¿Cuál muestra abstención o litigiosidad?

### 3.2 El límite del grafo jurídico

La tabla `dictamen_relaciones_juridicas` ya permite saber que existen vínculos entre dictámenes. Pero una arista no equivale a una lectura consolidada.

El grafo puede decir:

- este dictamen aclara a otro;
- este otro complementa;
- este otro reconsidera parcialmente.

Pero todavía hace falta convertir ese conjunto de relaciones, fechas, señales textuales y atributos en una lectura operativa:

- rol doctrinal;
- vigencia;
- tipo de intervención de la CGR;
- peso de lectura;
- utilidad para búsqueda doctrinal.

### 3.3 El problema real del producto

Sin esa capa, el sistema tiende a mezclar:

- afinidad semántica;
- importancia histórica;
- vigencia doctrinal;
- valor operativo actual;
- y estado de intervención del órgano.

Eso produce una experiencia inestable:

- una consulta mejora y otra empeora;
- una familia densa del corpus desplaza una lectura más correcta;
- el sistema encuentra antecedentes, pero no siempre organiza bien el estado actual de la materia.

## 4. Dónde encaja en la arquitectura

La metadata doctrinal está en el backend productivo [`cgr-platform/`](/home/bilbao3561/github/cgr/cgr-platform).

Se apoya en estas capas previas:

- `dictamenes`
- `enriquecimiento`
- `atributos_juridicos`
- `dictamen_relaciones_juridicas`
- `dictamen_fuentes_legales`

Y alimenta principalmente estas salidas:

- `doctrine-search`
- `doctrine-lines`
- `doctrine-guided`
- selección de `estado_actual_materia`
- jerarquía de lectura visible en frontend

Secuencia lógica:

1. se ingesta un dictamen;
2. se enriquece con LLM;
3. se calcula metadata doctrinal;
4. luego puede vectorizarse en Pinecone;
5. la búsqueda semántica recupera candidatos;
6. la metadata doctrinal organiza cómo deben leerse.

Principio rector:

- la búsqueda semántica manda;
- la doctrina organiza.

## 5. Qué produce esta capa

La capa doctrinal produce dos artefactos persistidos:

### 5.1 Tabla principal

`dictamen_metadata_doctrinal`

Es un snapshot consolidado por dictamen. Tiene una fila por dictamen y versión de pipeline.

Guarda, entre otros, estos campos:

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
- `confidence_global`
- `manual_review_status`
- `source_snapshot_version`

### 5.2 Tabla de evidencia

`dictamen_metadata_doctrinal_evidence`

Persiste la evidencia usada para justificar la fila principal.

Su objetivo es permitir:

- auditoría;
- depuración;
- revisión jurídica;
- recalculo conservando trazabilidad.

No basta con saber que un dictamen quedó como `abstencion` o `criterio_operativo_actual`. También hay que poder explicar por qué.

## 6. Unidad conceptual del modelo

La unidad conceptual de esta capa no es:

- el cluster;
- el embedding;
- ni la arista jurídica aislada.

La unidad conceptual es el **perfil doctrinal operativo del dictamen**.

Ese perfil intenta responder:

> ¿Qué función cumple este dictamen dentro de la evolución real de la materia y cómo debería ser leído por el sistema?

Eso obliga a separar dimensiones distintas.

## 7. Dimensiones principales del perfil doctrinal

### 7.1 Rol doctrinal

Describe la función principal del dictamen en la materia.

Valores hoy usados por el core:

- `nucleo_doctrinal`
- `aplicacion`
- `aclaracion`
- `complemento`
- `ajuste`
- `desplazamiento`
- `reactivacion`
- `cierre_competencial`
- `materia_litigiosa`
- `abstencion`
- `criterio_operativo_actual`
- `hito_historico`
- `contexto_no_central`

Reglas importantes:

- existe un `rol_principal`;
- pueden existir roles secundarios;
- el rol principal debe ser normalizado por el core;
- `limitacion` no debe quedar como rol principal persistido.

### 7.2 Estado de intervención de la CGR

Describe si la Contraloría sigue interviniendo normalmente en la materia o si el régimen cambió.

Valores:

- `intervencion_normal`
- `intervencion_condicionada`
- `intervencion_residual`
- `abstencion_visible`
- `materia_litigiosa`
- `sin_senal_clara`

Esta dimensión es distinta del rol doctrinal. Un dictamen puede ser doctrinalmente relevante y, al mismo tiempo, mostrar abstención o litigiosidad.

### 7.3 Estado de vigencia doctrinal

Describe cómo debe leerse el dictamen en términos temporales y de vigencia visible.

Valores:

- `vigente_visible`
- `vigente_tensionado`
- `vigente_en_revision`
- `desplazado_parcialmente`
- `desplazado`
- `valor_historico`
- `indeterminado`

### 7.4 Rol de lectura

No todo dictamen doctrinalmente correcto debe leerse igual.

Valores principales:

- `entrada_semantica`
- `entrada_doctrinal`
- `estado_actual`
- `ancla_historica`
- `pivote_de_cambio`
- `soporte_contextual`

Esto se complementa con `reading_weight`, que cuantifica cuánto debe pesar un dictamen al construir la respuesta visible.

### 7.5 Señales booleanas y scores

La fila doctrinal también guarda señales e intensidades que el sistema usa para ranking y selección:

- `supports_state_current`
- `signals_litigious_matter`
- `signals_abstention`
- `signals_competence_closure`
- `signals_operational_rule`
- `currentness_score`
- `doctrinal_centrality_score`
- `historical_significance_score`
- `shift_intensity_score`

Estas señales no reemplazan al rol principal. Sirven para decidir mejor cuándo una materia tiene un “estado actual” dominante y cuándo la doctrina previa debe degradarse a contexto histórico.

## 8. Cómo se calcula

El cálculo está centralizado en [`doctrinalMetadata.ts`](/home/bilbao3561/github/cgr/cgr-platform/src/lib/doctrinalMetadata.ts).

El proceso mezcla tres niveles:

### 8.1 Base estructural

Se extraen datos de:

- `dictamenes`
- `enriquecimiento`
- `atributos_juridicos`
- `dictamen_relaciones_juridicas`
- `dictamen_fuentes_legales`

Con eso se arma una fotografía base del dictamen:

- materia;
- criterio;
- resumen;
- atributos jurídicos;
- densidad relacional;
- relaciones entrantes y salientes;
- fuentes legales principales.

### 8.2 Heurística doctrinal

El core construye una primera hipótesis doctrinal determinista:

- rol;
- intervención;
- vigencia;
- reading role;
- scores;
- señales fuertes.

Esta etapa existe para que el sistema no dependa totalmente del LLM y mantenga un comportamiento conservador y reproducible.

### 8.3 Fusión con LLM

Luego se llama a `mistral-large-2411` para obtener una lectura doctrinal más fina.

Pero el LLM no manda de forma absoluta.

El resultado final sale de un merge entre:

- heurística base;
- propuesta del LLM;
- overrides deterministas;
- normalización estricta de enums.

Eso permite:

- usar inteligencia contextual del modelo;
- evitar que salidas libres contaminen el esquema;
- corregir casos donde el LLM degrada demasiado una señal fuerte;
- mantener trazabilidad de qué vino del LLM y qué corrigió el core.

## 9. Decisiones de diseño importantes

### 9.1 La metadata doctrinal no reemplaza embeddings

Los embeddings siguen siendo la puerta de entrada a la consulta.

La metadata doctrinal aparece después, para organizar mejor los resultados recuperados.

### 9.2 El modelo no es una taxonomía cerrada del derecho administrativo

No intenta “entender todo el derecho”.

Intenta resolver un problema más acotado y operativo:

- cómo leer correctamente un dictamen dentro de una familia doctrinal.

### 9.3 La capa debe ser recalculable

Nada de esta metadata se trata como verdad irreversible.

Por eso existe:

- `pipeline_version`
- `source_snapshot_version`
- reproceso administrable
- capa de evidencia

### 9.4 La observabilidad no puede depender solo de logs Cloudflare

Los logs de Cloudflare Workflows pueden ser útiles, pero no son suficientes como base de operación.

La trazabilidad mínima de esta rama debe vivir también en D1, mediante `dictamen_events`.

Eventos doctrinales clave:

- `DOCTRINAL_METADATA_QUEUED`
- `DOCTRINAL_METADATA_SUCCESS`
- `DOCTRINAL_METADATA_ERROR`

Esto permite auditar el pipeline incluso si los logs de Workflows fallan, cambian o no son parseables por herramientas externas.

## 10. Cómo se opera hoy

### 10.1 Flujo automático

Desde `2026-04-08`, el cálculo doctrinal se integra automáticamente al pipeline principal.

Secuencia:

1. `EnrichmentWorkflow` procesa dictámenes;
2. cuando un dictamen queda en `enriched_pending_vectorization`, el workflow acumula sus IDs;
3. dispara uno o más sub-batches de `DoctrinalMetadataWorkflow`;
4. la metadata doctrinal se calcula sin bloquear el resto del pipeline.

Detalles importantes:

- el disparo es no bloqueante;
- si falla, enrichment no debe retroceder;
- la metadata doctrinal se calcula antes o en paralelo lógico a la vectorización;
- el snapshot automático queda marcado con `source_snapshot_version = auto_from_enrichment_v1|mistral-large-2411`.

### 10.2 Reproceso manual o dirigido

Además del flujo automático, existe reproceso administrable para:

- backfill;
- remediación;
- auditorías dirigidas;
- cambios de heurística o taxonomía.

El reproceso se orquesta mediante [`doctrinalMetadataWorkflow.ts`](/home/bilbao3561/github/cgr/cgr-platform/src/workflows/doctrinalMetadataWorkflow.ts).

### 10.3 Regla operativa del backlog

El workflow doctrinal no debe paginar con `OFFSET` sobre un universo mutable.

La estrategia correcta es:

- seleccionar siempre dictámenes elegibles sin metadata doctrinal (`md IS NULL`);
- procesar ese lote;
- volver a consultar el faltante;
- continuar mientras queden pendientes.

Esto evita saltos y huecos cuando entran nuevos dictámenes o cuando cambian estados en paralelo.

## 11. Cómo usa esto el producto

La metadata doctrinal influye directamente en:

### 11.1 `doctrine-search`

Usos principales:

- priorizar dictámenes con `reading_weight` alto;
- preferir `estado_actual` cuando existe señal fuerte;
- degradar doctrina previa a contexto histórico cuando una materia cambió de régimen;
- ordenar mejor líneas doctrinales.

### 11.2 `doctrine-guided`

Usos principales:

- detectar foco directo;
- construir “estado actual de la materia”;
- seleccionar hitos, pivotes y ramas;
- separar estado vigente de historia doctrinal.

### 11.3 Render visible

En frontend, la metadata doctrinal permite mostrar mejor:

- qué leer primero;
- qué es estado actual;
- qué es solo antecedente;
- qué dictamen opera como pivote o hito;
- cuándo la CGR ya no está interviniendo del mismo modo.

## 12. Observabilidad y auditoría

### 12.1 Qué mirar

Para auditar esta capa hay que mirar al menos cuatro cosas:

1. cobertura;
2. calidad estructural;
3. calidad doctrinal;
4. salud operativa del pipeline.

### 12.2 Cobertura

Preguntas mínimas:

- cuántos dictámenes elegibles tienen metadata;
- cuántos faltan;
- qué cohorte los generó;
- si el backlog está drenando o se estancó.

### 12.3 Calidad estructural

Chequeos mínimos:

- enums válidos en `rol_principal`;
- enums válidos en `reading_role`;
- `evidence_summary_json` no vacío;
- `source_snapshot_version` consistente;
- ausencia de contaminación histórica.

### 12.4 Calidad doctrinal

Chequeos mínimos:

- exceso de `aplicacion`;
- subexpresión de `estado_actual`;
- confusión entre abstención y aplicación;
- poca separación entre doctrina vigente e historia doctrinal;
- coherencia entre `rol_principal`, `estado_intervencion_cgr` y `reading_role`.

### 12.5 Salud operativa

La fuente operativa más confiable es hoy:

- `dictamen_events`

Eventos relevantes:

- `AI_INFERENCE_SUCCESS`
- `DOCTRINAL_METADATA_QUEUED`
- `DOCTRINAL_METADATA_SUCCESS`
- `DOCTRINAL_METADATA_ERROR`

Eso permite reconstruir la secuencia:

1. enrichment terminó;
2. se encoló metadata doctrinal;
3. se calculó correctamente o falló.

## 13. Riesgos conocidos

Esta capa resuelve un problema real, pero no elimina todos los riesgos.

Riesgos todavía vigentes:

- exceso de `aplicacion` en parte del corpus;
- tendencia del sistema a modelar mejor lo vigente que lo histórico;
- residuos de `entrada_semantica` que siguen siendo poco doctrinales;
- materias donde señales fuertes todavía no dominan totalmente la lectura;
- dependencia parcial de heurísticas que pueden necesitar nuevas categorías.

En otras palabras:

- la capa ya es útil;
- pero sigue siendo una aproximación operativa, no una ontología jurídica perfecta.

## 14. Mapa para ingeniería inversa

Si alguien nuevo necesita reconstruir esta capa, debe partir por estos archivos:

### 14.1 Core de cálculo

- [`doctrinalMetadata.ts`](/home/bilbao3561/github/cgr/cgr-platform/src/lib/doctrinalMetadata.ts)
- [`mistral.ts`](/home/bilbao3561/github/cgr/cgr-platform/src/clients/mistral.ts)

### 14.2 Orquestación

- [`doctrinalMetadataWorkflow.ts`](/home/bilbao3561/github/cgr/cgr-platform/src/workflows/doctrinalMetadataWorkflow.ts)
- [`enrichmentWorkflow.ts`](/home/bilbao3561/github/cgr/cgr-platform/src/workflows/enrichmentWorkflow.ts)

### 14.3 Consumo en producto

- [`doctrineLines.ts`](/home/bilbao3561/github/cgr/cgr-platform/src/lib/doctrineLines.ts)
- [`doctrineGuided.ts`](/home/bilbao3561/github/cgr/cgr-platform/src/lib/doctrineGuided.ts)
- [`Home.tsx`](/home/bilbao3561/github/cgr/frontend/src/pages/Home.tsx)

### 14.4 Persistencia y trazabilidad

- `dictamen_metadata_doctrinal`
- `dictamen_metadata_doctrinal_evidence`
- `dictamen_events`

### 14.5 Preguntas correctas para reconstruirla

No partir preguntando “qué prompt usa”.

Partir preguntando:

- cuál es la unidad conceptual del modelo;
- qué variables quiere producir;
- qué parte es heurística y qué parte es LLM;
- cómo se normaliza;
- qué señales gobiernan la respuesta visible;
- cómo se opera y audita en producción.

## 15. Cómo leer este documento si eres nuevo

Orden recomendado:

1. leer las secciones 2, 3 y 4 para entender el problema;
2. leer las secciones 6, 7 y 8 para entender el modelo;
3. leer las secciones 10 y 12 para operar el sistema;
4. leer la sección 14 si quieres seguir el rastro en código.

## 16. Estado actual del diseño

La conclusión práctica hoy es esta:

- la metadata doctrinal ya es una pieza estructural del producto;
- ya no es un experimento lateral;
- su integración automática al pipeline está operativa;
- su trazabilidad en D1 también está operativa;
- el problema abierto ya no es si la capa debe existir, sino cómo seguir refinando su taxonomía y su capacidad para gobernar mejor la lectura doctrinal del corpus.

## 17. Idea fuerza final

Si hubiera que resumir toda esta capa en una sola frase:

> El retrieval semántico encuentra candidatos; la metadata doctrinal convierte esos candidatos en lectura jurídica usable.
