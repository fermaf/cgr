# Auditoría Técnica del Read Path de Derivativas: Legacy vs Canónico

Este documento presenta una auditoría exhaustiva del path de lectura actual en `cgr-platform` respecto a entidades derivadas (etiquetas por IA y fuentes legales), delineando qué componentes siguen utilizando el enfoque legacy basado en JSON/Tablas crudas desnormalizadas, y un plan detallado para el cutover a los catálogos relacionales canónicos.

## Estado de la Base de Datos

* **Legacy Fields (Phase-out pending)**:
   * `enriquecimiento.etiquetas_json`
   * `enriquecimiento.fuentes_legales_json`
   * `dictamen_etiquetas_llm` (Tabla)
   * `dictamen_fuentes_legales` (Tabla)
* **Canonical Fields (Dual-write active, Read path pending)**:
   * `etiquetas_catalogo` / `dictamen_etiquetas`
   * `fuentes_legales_catalogo` / `dictamen_fuentes`

---

## A. Inventario de Consumers Legacy

La lectura legacy se concentra en endpoints del API, procesos documentales y pipelines analíticos.

### 1. `enriquecimiento.etiquetas_json`

| Archivo | Origen de uso | Qué se extrae / lee | Perfil de Ruta |
|----------|---------------|-----------------------|-----------------|
| `cgr-platform/src/index.ts`<br>`(Hono.get('/api/dictamenes/search'))` | Funciones centrales del Home Search Bar y Advanced Search. | Subqueries en la BD: `LOWER(etiquetas_json) LIKE LOWER(?)`. | **Productivo Principal** (Crítico) |
| `cgr-platform/src/index.ts`<br>`(Hono.get('/api/v1/analytics/suggest/tags'))` | Autosuggest Search Box UI en frontend. | Lectura de etiquetas y parseo del JSON string en un `Set`. | **Productivo Principal** |
| `cgr-platform/src/index.ts`<br>`(Hono.get('/api/v1/dictamenes/:id'))` | Generación de la vista de detalle de cada dictamen en UI (tags display). | Extrae de `enrichment.etiquetas_json`, hace `JSON.parse` y retorna como string array al frontend. | **Productivo Principal** (Crítico) |
| `cgr-platform/src/index.ts`<br>`(Pinecone Sync Vectors)` | Endpoint para exportación a BD Vectorial. | Usa `descriptores_AI: JSON.parse(enrichment.etiquetas_json)` para el documento de embedding. | **Tooling / Analytics Pipeline** |
| `cgr-platform/src/lib/doctrinalMetadata.ts` | Refresco de agrupaciones ML de backfill. | `JSON.parse` recursivo y query manuales sobre la columna en D1. | **Backfill / Analítico** |

### 2. `dictamen_fuentes_legales`

| Archivo | Origen de uso | Qué se extrae / lee | Perfil de Ruta |
|----------|---------------|-----------------------|-----------------|
| `cgr-platform/src/index.ts`<br>`(Hono.get('/api/v1/dictamenes/:id'))` | Sidebar de fuentes mencionadas en vista detalle en UI frontend. | `SELECT tipo_norma, numero, articulo... FROM dictamen_fuentes_legales WHERE dictamen_id=? GROUP BY... ORDER BY mentions DESC` | **Productivo Principal** (Crítico) |
| `cgr-platform/src/index.ts`<br>`(heatmap / topic trends)` | Gráfica macro temporal agregada en home analítica. | `SELECT anio, tipo_norma, COUNT(*) ... FROM dictamen_fuentes_legales` | **Productivo Secundario** |
| `cgr-platform/src/lib/doctrineClusters.ts`<br>`cgr-platform/src/lib/regimenDiscovery.ts` | Algoritmia para Regímenes y Clusters doctrinales por proximidad de citas. | Consultas masivas agrupadas. | **Analítico Core / Tooling** |

### 3. `dictamen_etiquetas_llm`
No posee _read path_ productivo; delega su funcionalidad como source of truth al update JSON de `enriquecimiento`. Existe en scripts para deduplicaciones y tooling administrativo en background.

### 4. `enriquecimiento.fuentes_legales_json`
Usado incidentalmente como helper al inicializar variables vía `getLatestEnrichment()` en `storage/d1.ts`. No comanda el endpoint primario de display (el sidebar de dictámenes obtiene datos de la tabla relacional legacy, no del JSON string de aquí).

---

## B. Inventario de Consumers Canónicos

Tablas Canónicas: `etiquetas_catalogo`, `dictamen_etiquetas`, `fuentes_legales_catalogo`, `dictamen_fuentes`

**Usos actuales**:
- Exclusivamente en **Write Path** o como queries manuales (Shadow Mode) validados por workflows (ej.: `run_backfill_campaign.ts`, scripts backfill).
- *No hay ninguna lectura conectada con el frontend productivo ni el API pública*. Todos los hits en código corresponden al update, deduplicación y consolidación de la data contra lo existente, en forma puramente pasiva y administrativa.

---

## C. Clasificación de Riesgo para el Cutover

| Componente Legacy Modificado | Adaptación requerida | Clasificación de Riesgo | Consideraciones |
|-------------------------------|------------------------|-----------------------|-----------------|
| Sugerencia autocomplete (`/api/v1/analytics/suggest/tags`) | Cambio de parser logico sobre `etiquetas_json` en JS/Set a BD `etiquetas_catalogo`. | **Migración Simple** | Alta recompensa de performance. Es un switch directo 1:1 de `LIKE` contra la columna norma de display. |
| Detalle Interfaz: Etiquetas (`/api/v1/dictamenes/:id`) | Join con la nueva dupla `dictamen_etiquetas` + catálogo en D1; simular output a array plain string. | **Con Adaptación de Shape** | Frontend espera layout `[ "string", "string" ]`. Riesgo mediano si se rompe la serialización. |
| Detalle Interfaz: Fuentes (`/api/v1/dictamenes/:id`) | Agrupación COUNT sobre `dictamen_fuentes` ligada al catálogo relacional en lugar del texto duplicado en tabla. | **Con Adaptación de Shape** | Riesgo de menciones rotas si `normalizeLegalSourceForPresentation` no recibe el exact match esperado (sector, extra, etc). |
| Analytics/Heatmap | Actualización estandar sobre JOIN con catálogos. | **Simple** | Operan batch snapshot (mensual/cache limitadas). Riesgo muy bajo. |
| Búsqueda Primaria (`/search` query texto y etiquetas) | Reemplazar JSON fall-out (`LOWER(etiquetas_json) LIKE ?`) a validación condicional `EXISTS` relacional. | **Riesgo Medio/Alto** | Componente más crítico del sistema. Requiere validación y análisis de query-plan en producción SQLite. |
| Core Interno & Pinecone (`doctrineClusters`, syncs vectoriales) | Migración a nuevas tablas. Recomendable posponer a su propia fase. | **Compatibilidad Temporal** | Pipeline robusto subyacente. No alterarlo hasta afianzar la UI. |

---

## D. Plan de Cutover por Fases Priorizadas

Proponemos una senda conservadora que toque progresivamente los flujos core, de read/display frontend primero, a búsqueda y algoritmos luego.

### **Fase 1: Capa UI Display y Autocomplete**
Cambio transparente para el usuario pero drástico en el codebase respecto al uso base de parse JSON intermedio.
1. `index.ts` -> `/api/v1/analytics/suggest/tags`: Borrar query sobre `enriquecimiento.etiquetas_json` e implementar sugerencias textuales nativas sobre `etiquetas_catalogo` (etiqueta_display, autocompletado en capa sqlite).
2. `index.ts` -> `/api/v1/dictamenes/:id` (Metadata etiquetas doctrinal): Reemplazar JSON source por un helper SQL list para crear el response type esperado de manera safe.
3. `index.ts` -> `/api/v1/dictamenes/:id` (Sidebar fuentes): Migrar el read para fuentes legales desde tabla legacy a join `dictamen_fuentes -> fuentes_legales_catalogo`.

### **Fase 2: Motor de Interfaz (Buscador Core)**
1. `index.ts` -> `/api/dictamenes/search`: Refactor de los patterns `etiquetas_json LIKE ?` a sub-queries de agregación real (IN + EXIST limits).

### **Fase 3: Analytics Agregados Secundarios**
1. Actualización de queries temporales/Heatmaps para uso con el catálogo tipificado de fuentes en lugar de text crudo.

### **Fase 4: Core Internos, Algoritmos Doctrinales y Limpieza Técnica**
1. Sustituir referencias de vectores en Pinecone mass syncs.
2. Trasladar agrupadores como `doctrineClusters.ts`.
3. Borrar tablas legacy y dependencias finales de JSON properties manuales generados por la IA en read/sync paths.

---

## E. Riesgos Específicos a Mitigar

1. **Pérdida de Configuración de Shape Frontend**: `meta.fuentes_legales` demanda properties explícitas (`sector`, `year`, `numero`, `mentions`). Al unir con `dictamen_fuentes`, el backend DEBE asegurar que el JSON parse siga respetando ese casteo de variables. Lo mismo ocurre con las etiquetas devueltas desde IA, que son un layout array nativo.
2. **Dependencia en `mention_key` e Implicaciones de Agrupación (Multi-menciones)**: Hasta hoy, la API consolida las fuentes repitidas mediante `COUNT(*)` sobre la tabla cruda. La nueva relación define la fuente atómica en el catálogo, y las multi-citaciones con el campo `mention_key` en iteración individual en `dictamen_fuentes`. Al migrar la query de detail API (Sidebar de UI), debe asegurarse de agrupar (`SUM()` o `COUNT`) desde `dictamen_fuentes` y acoplar el metadata de la normalización correctamente a mano, no sobre la tabla final.
3. **Dependencias Vectoriales Duras**: Pinecone sync en la API actual extrae la etiqueta stringificada directamente del JSON y el análisis de la fuente. Moverlos antes de tiempo a tabla relacional puede provocar un drift metadata model V2 si la data canónica no calza 1:1. Es indispensable dejar esto para fase 4.
4. **JSON como "Source of Truth" Oculto**: Algunas operaciones secundarias que extraen variables asumen implícitamente que todo está parseable as `enriquecimiento.latest`. Modificaciones a base D1 requieren simular ese JSON objeto en responses UI para no escalar el PR al Repositorio React que hoy está estable.
