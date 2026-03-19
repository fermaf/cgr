# 05 - Roadmap Estratégico y Analítica Macroscópica (2026-2027)

> [!IMPORTANT]
> **Tipo Diátaxis**: Explicación. Define la evolución técnica y de negocio para la plataforma.

Este roadmap traza la conversión de la plataforma desde un "buscador jurídico inteligente" hacia una suite de **Inteligencia Regulatoria** explotable en múltiples líneas comerciales.

---

## 🗺️ 1. Roadmap 2026-2027 por Fases

### Fase 1 (Q2 2026): Analítica Normativa Operacional
- **Objetivo**: Exponer insights agregados sobre fuentes legales. Pasar de "buscar documentos" a "medir tendencias".
- **Backend API**: Endpoints como `/api/v1/analytics/statutes/heatmap` sirviendo vistas pre-calculadas desde un snapshot D1 en KV.
- **KPI**: Latencia de respuesta p95 < 800ms.

### Fase 2 (Q3-Q4 2026): Grafo Jurisprudencial Navegable
- **Objetivo**: Entregar linaje doctrinal: qué dictamen modifica, reconsidera, complementa o aclara a otro.
- **Backend API**: Endpoints de expansión de vecindario (`/api/v1/dictamenes/:id/lineage`).
- **Mitigación**: Implementar parsers deterministas para cruzar y validar las relaciones extraídas por Mistral AI, purgar "ID fantasmas".

### Fase 3 (Q1-Q2 2027): API de Compliance Predictivo
- **Objetivo**: Evaluar de forma preventiva borradores normativos, detectando choques legales.
- **Backend API**: Un *Compliance Worker* aislado asíncrono para ingestas de documentos de 50+ páginas sin ahogar las transaccionales.

---

## 🚀 2. Visión del Frontend: Buscador Analítico

A nivel de interfaz, el sistema integrará capacidades de macro-análisis:

1. **Ingesta en Caliente**: Si el usuario busca un término y este se halla en el sitio web oficial pero no ha sido procesado por nuestro Worker, un botón "Forzar Ingesta" llamará a `/ingest/trigger` transparentemente.
2. **Síntesis Macroscópica**: Al seleccionar múltiples resultados (ej: 20 dictámenes sobre "Horas Extras"), un nuevo Prompt Consolidado resumirá el *criterio dominante* e identificará si existen contradicciones.
3. **Línea de Tiempo del Abogado**: Visualización que traza el historial de redacción de una persona, marcando su tendencia (restrictiva vs permisiva) a lo largo del tiempo.
4. **Monitor de Puntos Calientes**: Un mapa visual que cruza *Institución* vs *Materia* para auditar qué organismos tienen más conflictividad o qué temas han forzado un mayor cambio jurisprudencial.

---

## 💰 3. Monetización Prevista

| Nivel | Propuesta de Valor | Capacidades Core |
| :--- | :--- | :--- |
| **Search Free** | Búsqueda base y detalle de dictamen | Endpoints actuales (`/api/v1/dictamenes*`) |
| **Analytics Pro** | Tendencias y mapas normativos | Fase 1 + Snapshots de volumen |
| **Lineage Pro** | Trazabilidad doctrinal | Fase 2 + Grafo de citaciones |
| **Enterprise** | Validación predictiva B2B | Fase 3 + API dedicada + SLA |
