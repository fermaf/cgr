# Modelo Canónico de Relaciones entre Dictámenes

## 1. Propósito

Este documento propone una arquitectura de más alto nivel para resolver correctamente las relaciones entre dictámenes de la CGR. Su objetivo no es solo "detectar links", sino modelar una **doctrina viva**, con causalidad, temporalidad, evidencia, confianza y trazabilidad.

La meta es superar el enfoque actual centrado en:

- flags escalares en `atributos_juridicos`
- aristas mínimas en `dictamen_relaciones_juridicas`
- heurísticas regex o extracción puntual LLM

Ese enfoque sirve para un primer backfill, pero no constituye todavía un sistema que "entienda" la lógica del backend de la CGR ni la evolución jurisprudencial completa.

## 2. Diagnóstico del Estado Actual

Hoy el proyecto ya tiene piezas valiosas:

- crawl y almacenamiento crudo en KV
- extracción LLM de `acciones_juridicas_emitidas`
- tablas de atributos jurídicos
- referencias oficiales a otros dictámenes
- referencias a normas externas
- un workflow histórico por regex

Sin embargo, hay cuatro problemas estructurales:

1. **Se mezcla estado con evidencia**. Un flag como `alterado=1` resume un efecto, pero no explica quién lo produjo, con qué fuente, con qué confianza y desde cuándo.
2. **No existe un modelo temporal explícito**. La doctrina cambia en el tiempo, pero el modelo actual representa casi todo como una foto estática.
3. **Las fuentes de verdad están desalineadas**. Documentación, TypeScript y esquema D1 no están completamente sincronizados.
4. **Falta una jerarquía de inferencia**. No todas las relaciones deben nacer del mismo mecanismo. Hay evidencia fuerte, evidencia media e inferencia débil, y hoy eso no queda modelado.

## 3. Principio Rector

La unidad canónica no debe ser el flag ni el regex. Debe ser la **afirmación relacional jurídica**.

Una afirmación relacional jurídica responde, como mínimo, a estas preguntas:

- qué dictamen origina la acción
- qué dictamen o norma recibe el efecto
- qué tipo de acción jurídica se afirma
- cuál es la evidencia que sustenta la afirmación
- qué motor la produjo
- con qué confianza
- desde qué fecha rige
- si está confirmada, observada o en disputa

Los flags deben pasar a ser una **proyección derivada** del grafo, no la fuente primaria de verdad.

## 4. Modelo Conceptual Propuesto

### 4.1 Entidades Base

- **Dictamen**
  - nodo jurisprudencial principal
- **Norma Jurídica**
  - ley, decreto, reglamento, oficio u otra fuente externa estructurada localmente
- **Afirmación Relacional**
  - hecho jurídico computable: un origen produce un efecto sobre un destino
- **Evidencia**
  - fragmento o artefacto que justifica la afirmación
- **Evento Doctrinal**
  - cambio en el estado interpretativo de un dictamen a lo largo del tiempo

### 4.2 Tipos de relación

Separar al menos tres familias:

1. **Relaciones doctrinales entre dictámenes**
   - `aclara`
   - `altera`
   - `complementa`
   - `confirma`
   - `reconsidera`
   - `reconsidera_parcialmente`
   - `reactiva`
   - `aplica`

2. **Relaciones de referencia formal**
   - cita oficial a otro dictamen
   - referencia detectada en tabla/HTML oficial
   - referencia detectada en texto libre

3. **Relaciones con entorno jurídico externo**
   - cita norma legal
   - interpreta norma
   - aplica norma
   - armoniza con norma
   - potencial contradicción o desplazamiento interpretativo

No todas deben convivir en la misma tabla sin tipificación fuerte. Comparten un grafo, pero no la misma semántica operacional.

## 5. Arquitectura por Capas

### 5.1 Capa 1: Hechos de Ingesta

Insumos crudos sin interpretación final:

- `DICTAMENES_SOURCE` en KV
- metadata estructurada del crawl
- tabla oficial de acciones del backend CGR
- referencias oficiales a otros dictámenes
- texto completo, `is_accion`, `materia`, HTML y anchors
- referencias a normas externas

Esta capa no debe perderse ni mutarse destructivamente.

### 5.2 Capa 2: Evidencias Normalizadas

Cada posible relación detectada se guarda como evidencia, por ejemplo:

- `official_action_table`
- `official_reference_table`
- `html_anchor_to_dictamen`
- `textual_pattern`
- `llm_extraction`
- `manual_review`

Cada evidencia debe registrar:

- `source_type`
- `source_locator`
- `snippet`
- `extractor_version`
- `confidence`
- `observed_at`

### 5.3 Capa 3: Afirmaciones Relacionales Canónicas

Las evidencias se consolidan en una afirmación única.

Campos mínimos sugeridos:

- `relation_id`
- `source_entity_type`
- `source_entity_id`
- `target_entity_type`
- `target_entity_id`
- `relation_type`
- `assertion_status`
- `confidence_score`
- `effective_date`
- `detected_by`
- `canonical_evidence_id`
- `created_at`
- `updated_at`

Estados sugeridos:

- `asserted`
- `confirmed`
- `ambiguous`
- `rejected`
- `superseded`

### 5.4 Capa 4: Proyecciones Derivadas

Vistas o tablas derivadas para consumo operacional:

- flags en `atributos_juridicos`
- relaciones simplificadas para frontend
- snapshots para analytics
- proyecciones para Pinecone

Esta capa puede recalcularse. No debe ser el origen de la verdad.

## 6. Jerarquía de Evidencia

El sistema debe preferir la evidencia según el siguiente orden:

1. **Tabla oficial/estructura oficial CGR**
2. **Anchor o URL oficial a dictamen identificado**
3. **Metadato oficial `is_accion` estructurable**
4. **Referencia formal almacenada en D1**
5. **Extracción LLM sobre texto completo**
6. **Heurística regex**
7. **Inferencia secundaria por contexto**

Regla práctica:

- si una relación proviene de evidencia oficial fuerte, no necesita LLM para existir
- si solo proviene de texto libre ambiguo, debe quedar con menor confianza o en revisión
- regex nunca debe sobrescribir una relación confirmada por fuente superior

## 7. Temporalidad y Transiciones

El valor real de esta funcionalidad está en representar cambios doctrinales en el tiempo.

Para eso, una relación debe poder responder:

- fecha del dictamen emisor
- fecha en que la relación fue observada
- si desplaza una relación previa
- si revierte o reactiva doctrina anterior
- si el efecto es total o parcial

Propuesta operativa:

- mantener una tabla de afirmaciones relacionales activas
- mantener una tabla de eventos doctrinales para auditoría y reconstrucción temporal

Ejemplo:

1. Dictamen A establece criterio.
2. Dictamen B lo complementa en 2012.
3. Dictamen C lo reconsidera parcialmente en 2018.
4. Dictamen D reactiva parte de A en 2025.

El sistema no debe responder solo "A está alterado". Debe poder reconstruir esa secuencia.

## 8. Separación de Responsabilidades

La implementación debería moverse a un diseño por componentes, no a lógica repartida entre endpoint, workflow y helpers poco tipados.

Servicios sugeridos:

- `SourceAdapters`
  - leen KV, tablas oficiales, HTML y referencias ya cargadas
- `EvidenceExtractor`
  - transforma insumos en evidencias normalizadas
- `RelationResolver`
  - consolida evidencias y resuelve identidad origen/destino
- `DoctrineProjector`
  - deriva flags, timeline y vistas de consumo
- `RelationAuditService`
  - detecta huérfanos, conflictos y drift

Esto sigue SOLID, pero mejora sobre SOLID al introducir un dominio explícito con contratos estables y proyecciones derivadas.

## 9. Estrategia de Implementación en Fases

### Fase 0: Alinear realidad

Antes de agregar inteligencia:

- auditar el esquema D1 efectivo vs documentación vs TypeScript
- identificar tablas realmente existentes en producción
- congelar naming canónico
- corregir drift documental

Resultado esperado:

- una fuente de verdad consistente

### Fase 1: Introducir capa de evidencia

Crear tablas nuevas, por ejemplo:

- `relation_evidence`
- `relation_assertions`
- `doctrine_events`

Sin romper `atributos_juridicos` ni `dictamen_relaciones_juridicas` todavía.

Resultado esperado:

- poder registrar relaciones con trazabilidad antes de cambiar el modelo de consumo

### Fase 2: Resolver identidad y confianza

Implementar un `RelationResolver` que consolide:

- metadata oficial
- referencias D1
- texto KV
- LLM
- regex como fallback

Resultado esperado:

- cada relación queda con tipo, evidencia principal y score de confianza

### Fase 3: Reproyectar estado jurídico

Recalcular:

- flags de `atributos_juridicos`
- relaciones causa/efecto para frontend
- timeline jurisprudencial

Resultado esperado:

- los flags dejan de ser manuales o dispersos y pasan a derivarse del grafo

### Fase 4: Integrar normas externas

Extender el mismo marco a:

- leyes
- decretos
- reglamentos
- jurisprudencia relacionada

Resultado esperado:

- un grafo jurídico ampliado, no solo intra-dictámenes

## 10. Qué Hacer con el Workflow Histórico Actual

`HistoricalRelationsWorkflow` puede seguir existiendo, pero debe ser reposicionado:

- no como verdad final
- sí como generador de evidencias de baja o media confianza

Su salida debería pasar de:

- insertar directamente relación final
- prender flags finales

a:

- registrar evidencia
- proponer afirmaciones
- dejar que el resolvedor consolide

Ese cambio reduce falsos positivos y evita que el backfill contamine el estado canónico.

## 11. Invariantes del Sistema

Estas reglas deben cumplirse siempre:

1. Un flag jurídico no puede existir sin trazabilidad hacia al menos una afirmación o una evidencia oficial.
2. Una relación de menor jerarquía probatoria no puede degradar una relación confirmada por una fuente superior.
3. Toda afirmación debe indicar su origen de inferencia.
4. El modelo debe distinguir entre referencia, aplicación y modificación doctrinal.
5. Toda proyección derivada debe poder recalcularse desde la capa canónica.

## 12. Primera Implementación Recomendada

El siguiente paso no debería ser "mejorar el regex".

La primera implementación conjunta debería ser:

1. definir esquema canónico mínimo de `relation_evidence` y `relation_assertions`
2. adaptar el flujo actual para escribir ahí sin romper endpoints existentes
3. migrar el workflow histórico a productor de evidencias
4. construir un endpoint de auditoría que muestre:
   - evidencia
   - afirmación consolidada
   - confianza
   - proyección a flags

Ese paso entrega valor real y deja una base limpia para crecer.

## 13. Mejoras Recomendadas para el Agente de Desarrollo

Para trabajar mejor sobre `cgr`, conviene endurecer el perfil operativo del agente:

- **Modo repositorio único**: tratar `cgr` como contexto primario y evitar mezclar supuestos de otros proyectos.
- **Política de no-drift**: antes de implementar, verificar esquema, tipos, docs y rutas HTTP afectadas.
- **Ciclo fijo de trabajo**:
  - leer
  - modelar
  - documentar
  - implementar
  - verificar
  - commit atómico
- **Preferencia por contratos**:
  - primero tipos y tablas
  - luego servicios
  - después workflows y endpoints

## 14. MCPs, APIs y Capacidades Convenientes

Para maximizar calidad y autonomía futura, sería útil incorporar o formalizar:

- **MCP de base de datos local/remota**
  - inspección de D1 real
  - diff de esquema
  - consultas de auditoría reproducibles
- **MCP de Cloudflare**
  - workflows
  - KV
  - D1
  - logs
  - colas
- **MCP de GitHub/Git remoto**
  - ramas
  - PRs
  - commits auditables
- **MCP de observabilidad**
  - errores por endpoint
  - métricas de workflows
  - rate limits LLM
- **API/model router**
  - modelo barato para extracción masiva
  - modelo fuerte para resolución ambigua

La regla debería ser simple:

- extracción masiva barata
- resolución jurídica fina cara pero focalizada

## 15. Decisión Recomendada

La decisión recomendada es adoptar un enfoque **evidence-first + assertion-first**, donde:

- el crawl conserva hechos
- los extractores generan evidencias
- el resolvedor consolida afirmaciones
- los flags y vistas se derivan del grafo canónico

Ese enfoque representa mejor la lógica real de la CGR, resiste mejor el backfill histórico y abre el camino para conectar dictámenes con normas externas en un solo sistema coherente.

---

**Estado del documento**: propuesta canónica inicial  
**Fecha**: 2026-03-25  
**Siguiente paso sugerido**: diseñar el esquema mínimo de persistencia para `relation_evidence` y `relation_assertions`
