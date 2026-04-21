# Auditoría Técnica Detallada (32b): Read Path de Derivativas

Este documento expande el diagnóstico previo con rigor de código, identificando puntos exactos de consumo legacy y categorizando el riesgo de transición a la arquitectura canónica (tablas relacionales normalizadas).

## 1. Inventario Exhaustivo de Consumers

### A. Endpoints Productivos (Usuario Final)

#### `GET /api/v1/dictamenes/:id` (Vista Detalle)
- **Archivo**: `cgr-platform/src/index.ts` (Líneas 1311-1411)
- **Consumo Legacy**:
  - `getLatestEnrichment(db, id)` (Línea 1319): Lee de la tabla `enriquecimiento`. Extrae `etiquetas_json` y lo parsea recursivamente a array de strings (Línea 1404).
  - Query SQL Directa (Líneas 1353-1372): `SELECT tipo_norma, numero, articulo, extra, year, sector, COUNT(*) AS mentions FROM dictamen_fuentes_legales WHERE dictamen_id = ? GROUP BY ...`.
- **Shape de Salida Actual**:
  ```typescript
  {
    meta: {
      fuentes_legales: Array<{ tipo_norma, numero, articulo, mentions, sector... }> // Normalizado por helper
    },
    extrae_jurisprudencia: {
      etiquetas: string[]
    }
  }
  ```
- **Riesgo**: Alto si se rompe el tipado de React. El backend debe actuar como adaptador.

#### `GET /api/dictamenes/search` (Buscador SQL Fallback)
- **Archivo**: `cgr-platform/src/index.ts` (Líneas 1100-1243)
- **Consumo Legacy**:
  - Subqueries SQL (Líneas 1127, 1131, 1143, 1147, 1160): `SELECT dictamen_id FROM enriquecimiento WHERE LOWER(etiquetas_json) LIKE LOWER(?)`.
- **Shape de Entrada**: Parámetros `materia` o `tags` disparan estas subconsultas.

#### `GET /api/v1/analytics/suggest/tags` (Autocompletado UI)
- **Archivo**: `cgr-platform/src/index.ts` (Líneas 1269-1308)
- **Consumo Legacy**:
  - Query SQL (Línea 1275): `SELECT etiquetas_json FROM enriquecimiento WHERE etiquetas_json LIKE ?`.
  - Lógica JS (Líneas 1283-1297): Itera resultados, `JSON.parse` manual y filtro con `query` para llenar un `Set<string>`.
- **Riesgo**: Performance. Escaneo secuencial de strings JSON.

#### `GET /api/v1/analytics/statutes/heatmap`
- **Archivo**: `cgr-platform/src/index.ts` (Líneas 632-691) + Helper `queryHeatmapLive` (Líneas 155-180).
- **Consumo Legacy**: `SELECT d.anio, f.tipo_norma, f.numero, COUNT(*) AS total_refs ... FROM dictamen_fuentes_legales f INNER JOIN dictamenes d ON d.id = f.dictamen_id`.
- **Shape**: Devuelve series temporales para las gráficas del home.

### B. Core Analítico e Interno (Core Doctrinal)

#### `src/lib/doctrinalMetadata.ts` - `productivo interno`
- **Función**: `inferCanonicalTopics` (Línea 308) -> Lee `base.etiquetas_json` (string field de query global) para extraer el primer tag (Línea 311).
- **Función**: `fetchPrimaryLegalSource` (Línea 716) -> Query legacy a `dictamen_fuentes_legales` (Línea 722).
- **Uso**: Alimentar el pipeline de metadatos doctrinales.

#### `src/lib/doctrineClusters.ts` - `analytics core`
- **Función**: `aggregateClusterSignals` (Línea 477) -> Query a `dictamen_fuentes_legales` (Línea 507) para agrupar fuentes legibles por humanos en los clusters de Pinecone.

#### `src/lib/regimenDiscovery.ts` - `analytics core`
- **Función**: `findSharedNorms` (Línea 365) -> Query directa a `dictamen_fuentes_legales` (Línea 372).

#### `src/storage/d1.ts` - `helpers`
- **Función**: `getEnrichment` (Línea 559) -> `JSON.parse` de `etiquetas_json` y `fuentes_legales_json` (Líneas 570, 574).
- **Función**: `insertDictamenEtiquetaLLM` y `insertDictamenFuenteLegal` (Líneas 670-780) -> Realizan el **dual-write** actual.

#### Pinecone Sync / Sync Vector - `tooling / compatibilidad`
- **Archivo**: `src/index.ts` (Líneas 1678-1732 / 1734-1854)
- **Consumo**: `JSON.parse(enrichment.etiquetas_json)` (Línea 1705 o 1759).
- **Impacto**: Los metadatos de los vectores dependen de la sincronización de estos strings JSON.

---

## 2. Clasificación de Consumers

| Consumer | Categoría | Impacto de Fallo |
|----------|-----------|------------------|
| Detalle Dictamen (`/id`) | `productivo usuario final` | Crítico (UI detail view) |
| Search (/search) | `productivo usuario final` | Crítico (User UX) |
| Suggest Tags | `productivo usuario final` | Perceptibilidad alta |
| Metadata Doc. Workflow | `productivo interno` | Medio (Integridad de datos) |
| Heatmap / Topic Trends | `analytics / admin` | Bajo (Visualización interna) |
| Clusters / Discovery | `core doctrinal` | Bajo/Medio (Tooling) |
| Pinecone Sync | `tooling / compatibilidad` | Alto (Eficacia del RAG) |

---

## 3. Riesgo de Frontend (Adaptación de Shape)

| Endpoint | Shape Actual (Legacy) | Shape Nueva (Canónica) | Adaptación |
|----------|-----------------------|------------------------|------------|
| `dictamenes/:id` | `etiquetas: string[]` | `rel: { display: string }[]` | **Backend-side map** required. |
| `dictamenes/:id` | `fuentes: { tipo, numero, articulo, mentions }` | `rel: { key, label, mentions }` | **Backend-side map** required en el mapper canonical. |
| `tags/suggest` | `suggestions: string[]` | `SELECT display ...` | **Direct match**. |

---

## 4. Análisis de `mention_key` y Agrupación

El sistema canónico registra cada mención por separado en `dictamen_fuentes` vinculada a un ID único en `fuentes_legales_catalogo`.

- **Cuándo agrupar por `fuente_id`**: Para estadísticas macro (Heatmap). Nos interesa cuántas veces se cita la norma "Ley 18834" sin importar el artículo.
- **Cuándo agrupar por `fuente_id + mention_key`**: Para la Vista Detalle (Sidebar). El abogado quiere ver "Ley 18834 Art 10 (3 menciones)" y "Ley 18834 Art 15 (1 mención)".
- **Métrica `mentions`**: En el nuevo modelo, esta métrica es el `COUNT(*)` de `dictamen_fuentes` agrupado por `mention_key` para un `dictamen_id` dado. La tabla legacy guardaba esto de forma cruda.

---

## 5. Propuesta de Fase 1 (Cutover)

### Opción A — Mínima y Segura
- **Alcance**: Solo lectura de etiquetas en flujos simples.
- **Endpoints**:
  - `GET /api/v1/analytics/suggest/tags`: Consulta directa a `etiquetas_catalogo`.
  - `GET /api/v1/dictamenes/:id`: Tags leídos desde `dictamen_etiquetas`.
- **Riesgos**: Mínimos. Se debe asegurar el casting de ID a nombre visual.
- **Validación**: Comparar output array string v1 vs v2 via curl.

### Opción B — Conservadora Ampliada (Recomendada)
- **Alcance**: Cutover total de lectura en `dictamenes/:id` (Tags + Fuentes).
- **Cambios**:
  - Refactorizar query de fuentes (Líneas 1353-1371) para usar JOIN con `dictamen_fuentes`.
  - Asegurar que `normalizeLegalSourceForPresentation` reciba los datos de las nuevas tablas.
- **Justificación**: Elimina la dependencia de la tabla `dictamen_fuentes_legales` en el endpoint más usado del sistema.
- **Validación**: Probar con dictámenes que tengan multi-menciones del mismo cuerpo legal.

---

## 6. Recomendación Final y Bloqueos

> [!IMPORTANT]
> **Fase 1 Recomendada: Opción B.**  
> Es el momento de cortar el cordón umbilical en el display lateral. Las tablas canónicas ya están pobladas y el dual-write garantiza vigencia.

**Bloqueos/Supuestos**:
1. No tocar `/search` todavía. El query plan con `EXISTS` en relacional puede ser lento sin los índices exactos en D1 producción.
2. No tocar Pinecone Sync. La re-vectorización es un proceso pesado que debe correr sobre data estable.

**Qué NO tocar**:
- `src/lib/doctrinalMetadata.ts`: Sigue usando el JSON como buffer temporal de alta velocidad. Migrarlo requiere refactorizar el object hydrator de D1.
