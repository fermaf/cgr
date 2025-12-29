# Pasos siguientes PRO (vision + plan de producto)

Este documento define la evolucion de la plataforma desde dashboard operativo hacia un producto de alto valor para usuarios finales (persona natural, juridica o funcionario). Incluye vision, UX, control de acceso, arquitectura, funcionalidades, roadmap y entregables.

## 1) Norte del producto

**Proposito**
Convertir la jurisprudencia administrativa en una herramienta confiable, explorable y accionable para decisiones legales, regulatorias y administrativas, con analisis asistido por IA y trazabilidad verificable.

**Principios**
- Confianza primero: toda afirmacion se liga al dictamen original (link, snippet, hash).
- Trazabilidad: cada resumen/analisis indica version de modelo y fecha.
- Exactitud legal: evitar alucinaciones, resaltar incertidumbre.
- Accesibilidad: UX simple para no expertos; potencia para expertos.
- Datos vivos: ingesta diaria y alertas oportunas.

## 2) Perfiles de usuario y casos de uso

**Persona natural**
- Buscar dictamenes por tema y entender implicancias.
- Guardar consultas y recibir alertas.
- Obtener resumen en lenguaje claro.

**Persona juridica**
- Monitoreo de criterios por area/regulacion.
- Reportes periodicos por materia.
- Comparar cambios de criterio en el tiempo.

**Funcionario**
- Validar fundamento de decisiones administrativas.
- Generar informes con citas exactas.
- Monitorear cambios recientes por area.

## 3) Experiencia UX (de operacion a producto)

### 3.1 Navegacion principal
- **Inicio**: busqueda global, tendencias, actualizaciones del dia.
- **Explorar**: filtros avanzados + mapas tematicos.
- **Dictamen**: vista detallada con analisis, fuentes y trazabilidad.
- **Colecciones**: carpetas personales, etiquetas y notas.
- **Alertas**: reglas guardadas y novedades.
- **Reportes**: exportables y comparativos.

### 3.2 Busqueda y filtros (UX potente, click-first)
- Busqueda global con autocompletado (dictamen, materia, criterio, organo).
- Filtros por rango de fecha, criterio, materia, origen, descriptores.
- Selector de "nivel de certeza" del analisis IA.
- Filtros de "impacto" (relevante, aplicado, reconsiderado).
- Busqueda semantica + keyword combinadas.
- Resultados con resalto de frases clave y vista previa.

### 3.3 Vista de dictamen
- Panel "Resumen ejecutivo" (2 niveles: claro y tecnico).
- Panel "Analisis IA" (con version del modelo y timestamp).
- "Mapa de fuentes" (leyes/codigos citados con links).
- "Evolucion" (dictamenes relacionados y cambios de criterio).
- "Confianza" (si el texto completo existe, si hay enrichment completo).

### 3.4 Flujos de valor
- Guardar una busqueda como alerta.
- Generar reporte con citas en un click.
- Comparar dos dictamenes y generar diferencias.
- Explicar en lenguaje ciudadano vs tecnico.

## 4) Control de acceso y cuentas

**Roles**
- Visitante: busqueda limitada, sin alertas ni reportes.
- Usuario: historial, colecciones, alertas basicas.
- Pro: analisis avanzado, exportables, comparadores, alertas completas.
- Institucional: equipos, permisos, analitica, SSO.
- Admin: control total y auditoria.

**Seguridad**
- Autenticacion: email + magic link, OAuth (Google/Microsoft), SSO (SAML/OIDC).
- 2FA para Pro/Institucional.
- Control de sesiones y dispositivos.

**Privacidad**
- Datos personales y consultas cifradas.
- Auditoria de acceso por empresa.

## 5) Funcionalidades IA de alto valor

**Analisis base (ya existente)**
- Resumen, etiquetas, booleanos, fuentes legales.

**Nuevos modulos IA**
- Comparador de dictamenes con diferencias semanticas.
- Timeline de criterios por tema/organismo.
- Detector de cambios de criterio (alerta).
- Generador de argumentos con citas.
- Clasificador de impacto (alto/medio/bajo).
- Explicador juridico (modo ciudadano vs tecnico).

**Calidad y control**
- Deteccion de inconsistencias (hallazgos sin fuente).
- "No responder" cuando falta evidencia.
- Score de confiabilidad por dictamen.

## 6) Datos y arquitectura (alto nivel)

- Ingesta diaria desde CGR (cron + crawl).
- D1: catalogo + run_log.
- KV: RAW + estado.
- Queue: pipeline `crawl -> enrich -> fuentes -> vectorize`.
- Pinecone: embeddings.
- Nueva capa de API publica (GraphQL/REST) para UX.
- Cache de consultas populares.
- Indexado incremental.

## 7) Observabilidad y gobierno

- Panel de calidad: % con texto completo, % con enrichment valido.
- Alertas de fallas de ingesta.
- Monitor de latencia por endpoint.
- Versionado de modelos (Mistral/Varios).

## 8) Roadmap propuesto

**Fase 0 (0-1 mes): Fundacion producto**
- Definir marca, IA policy, estilo editorial.
- UX v1: home + buscador + detalle dictamen.
- Login basico + historial.

**Fase 1 (1-3 meses): Busqueda potente**
- Filtros avanzados y autocompletado.
- Colecciones y etiquetas.
- Alertas simples.

**Fase 2 (3-6 meses): IA diferenciada**
- Comparador de dictamenes.
- Timeline y cambios de criterio.
- Reportes exportables (PDF/Docx).

**Fase 3 (6-12 meses): Institucional**
- Equipos, permisos, SSO.
- Analitica y dashboards por area.
- API publica para integraciones.

## 9) Entregables concretos

- UX wireframes (home, buscar, dictamen, alertas).
- Libreria de componentes UI.
- Especificacion de API publica.
- Manual de estilo editorial (resumen y analisis).
- Politica de confianza y fuentes.

## 10) Proximo paso inmediato

1) Prototipo UX con dataset real y 100 dictamenes.
2) Validacion con 3 perfiles (persona, juridica, funcionario).
3) Ajustes de lenguaje y trazabilidad.
