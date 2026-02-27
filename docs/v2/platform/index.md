# Documentación Técnica CGR-Platform (Worker)

Bienvenido a la base de conocimiento centralizada de **CGR-Platform**, el componente de backend (Cloudflare Worker) encargado de la ingesta, procesamiento, enriquecimiento y búsqueda de dictámenes de la Contraloría General de la República.

Esta documentación ha sido organizada siguiendo el marco **Diátaxis** para facilitar el aprendizaje, la resolución de tareas, la comprensión profunda y la consulta rápida.

---

## 📚 Estructura de Documentación

### [0. Guía de Estándares para Agentes LLM](00_guia_estandares_agentes_llm.md)
**Mandatario para nuevos desarrollos.** Define el estilo, profundidad y normas de "El Librero" para mantener la calidad de la documentación.

### [1. Visión Ejecutiva](01_vision_ejecutiva.md)
Resumen de alto nivel sobre el valor de negocio, objetivos estratégicos y arquitectura simplificada para stakeholders.

### [2. Arquitectura C4](02_arquitectura_c4.md)
Diagramas técnicos detallados (Nivel Contexto y Contenedor) que explican cómo interactúa el Worker con D1, KV, Pinecone, Mistral AI y la infraestructura de CGR.

### [3. Referencia de API (OpenAPI)](03_referencia_api.md)
Especificación exhaustiva de los endpoints disponibles en `/api/v1/*`, incluyendo parámetros, esquemas de respuesta y ejemplos de `curl`.

### [4. Operación y Mantenimiento](04_operaciones_y_mantenimiento.md)
Guías prácticas para el despliegue, gestión de **Workflows** (Ingesta, Backfill, KVSync) y resolución de incidentes.

### [5. Skillgen (Gobernanza Determinista)](/home/fermaf/github/cgr/docs/skillgen/README.md)
Documentación detallada sobre el motor de **Skills**, paradigmas de diseño, runbooks de producción y configuración de variables para la gobernanza de errores.

### [6. Gestión de Entornos y Despliegue](06_entornos_y_despliegue.md)
**Documento Crítico de Auditoría.** Explica la relación entre los entornos Local, Staging y Producción, incluyendo la advertencia sobre recursos físicos compartidos.

### [7. Gobernanza y Estratigrafía de Datos](07_gobernanza_y_estratigrafia_datos.md)
**Nivel Experto.** Detalla el análisis reflexivo de la auditoría, la arquitectura de capas (Bronce/Paso), la alquimia de IDs y las heurísticas de normalización de datos.

### [8. Roadmap Estratégico y Monetización (2026-2027)](08_roadmap.md)
**Nivel Ejecutivo/Producto.** Plan de transformación de CGR-Platform desde un buscador hacia una infraestructura de análisis y compliance (Grafos Normativos y Consistencia Regulatoria).

### [9. Casos de Uso y Ejemplos](05_casos_de_uso.md)
Escenarios reales detallados:
- Ingesta periódica (Scraping).
- Enriquecimiento Semántico (Mistral AI).
- Búsqueda Híbrida (Vectorial + SQL Fallback).

---

## 🔄 Estado de Ejecución del Roadmap (Corte: 2026-02-27)
- **Fase 1 (Analítica normativa)**: ejecutada en código (`/api/v1/analytics/statutes/heatmap`, `/api/v1/analytics/topics/trends`, `POST /api/v1/analytics/refresh`) con snapshots D1 + cache KV.
- **Fase 2 (Linaje jurisprudencial - bootstrap)**: ejecutada parcialmente con `GET /api/v1/dictamenes/:id/lineage`.
- **Fase 3 (Compliance)**: pendiente de implementación.

---

## 🛠 Metodología de Mantenimiento ("El Librero")
Toda actualización de código en `cgr-platform` debe reflejarse en esta carpeta. Si eres un agente LLM o desarrollador:
1. Mantén la consistencia con `cloudflare-docs/workerPromtContext.txt`.
2. Actualiza los diagramas Mermaid si modificas el flujo de datos.
3. Asegúrate de que los ejemplos de código en los Casos de Uso sigan siendo válidos.
