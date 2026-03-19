# 01 - Referencia de API Completa (v2.0)

Esta guía detalla todos los endpoints disponibles en **CGR-Platform**. Para cada uno se proveen ejemplos `CURL` didácticos que cubren escenarios base y parámetros opcionales.

> [!IMPORTANT]
> **URL Base**: `https://cgr-platform.abogado.workers.dev` (Producción)  
> **Headers Requeridos**:  
> - `Content-Type: application/json`
> - `Accept: application/json`
> - `x-admin-token: <PAZ_MUNDIAL>` (Solo para endpoints administrativos)

---

## 📊 1. Estadísticas y Analítica

### `GET /api/v1/stats`
Obtiene un resumen del estado de la base de datos D1.

- **Respuesta (JSON)**:
  ```json
  {
    "total": 12543,
    "last_updated": "2026-03-18T22:00:00Z",
    "by_year": [ { "anio": 2026, "count": 150 }, ... ]
  }
  ```
- **Ejemplo CURL**:
  ```bash
  curl -X GET "https://cgr-platform.abogado.workers.dev/api/v1/stats"
  ```

### `GET /api/v1/analytics/statutes/heatmap`
Agregaciones por tipo de norma y año. Utiliza snapshots pre-calculados por defecto.

- **Parámetros Query**:
  - `limit` (opcional, default: 50): Cantidad de registros.
  - `yearFrom`, `yearTo` (opcionles): Rango de años.
  - `live=true` (opcional): Fuerza consulta real a D1 ignorando el snapshot.
- **Ejemplos CURL**:
  - **Escenario Base (Snapshot)**:
    ```bash
    curl "https://cgr-platform.abogado.workers.dev/api/v1/analytics/statutes/heatmap"
    ```
  - **Escenario Avanzado (Filtros y Live)**:
    ```bash
    curl "https://cgr-platform.abogado.workers.dev/api/v1/analytics/statutes/heatmap?yearFrom=2024&yearTo=2026&limit=100&live=true"
    ```

---

## 🔍 2. Búsqueda y Detalle de Dictámenes

### `GET /api/v1/dictamenes`
Búsqueda con fallback: Intenta búsqueda vectorial (Pinecone) y cae a SQL LIKE (D1) si no hay resultados semánticos.

- **Parámetros Query**:
  - `q` (requerido): Texto de búsqueda.
  - `page` (opcional, default: 1).
- **Ejemplos CURL**:
  - **Búsqueda Semántica**:
    ```bash
    curl "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes?q=responsabilidad+administrativa+en+municipios"
    ```
  - **Búsqueda Paginada**:
    ```bash
    curl "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes?q=alcaldes&page=2"
    ```

### `GET /api/v1/dictamenes/:id`
Detalle completo de un dictamen incluyendo enriquecimiento AI.

- **Ejemplo CURL**:
  ```bash
  curl "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/012345N26"
  ```

### `GET /api/v1/dictamenes/:id/lineage`
Genera un subgrafo de relaciones (referencias entrantes y salientes).

- **Ejemplo CURL**:
  ```bash
  curl "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/012345N26/lineage"
  ```

---

## ⚙️ 3. Administración y Jobs (Admin Token Requerido)

### `POST /api/v1/jobs/repair-nulls`
Escanea D1 en busca de registros con `division_id` nulo y los repara consultando el KV.

- **Parámetros Query**:
  - `limit` (opcional, default: 500).
  - `id` (opcional): Repara solo un ID específico.
- **Ejemplos CURL**:
  - **Reparación Masiva**:
    ```bash
    curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/jobs/repair-nulls?limit=100" \
         -H "x-admin-token: paz_mundial"
    ```
  - **Reparación de un ID**:
    ```bash
    curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/jobs/repair-nulls?id=012345N26" \
         -H "x-admin-token: paz_mundial"
    ```

### `POST /api/v1/dictamenes/batch-enrich`
Dispara el `BackfillWorkflow` para enriquecer registros pendientes.

- **Cuerpo (JSON)**:
  - `batchSize` (default: 50).
  - `delayMs` (default: 500).
  - `recursive` (default: true).
- **Ejemplos CURL**:
  - **Backfill Recursivo Estándar**:
    ```bash
    curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/batch-enrich" \
         -H "x-admin-token: paz_mundial" \
         -H "Content-Type: application/json" \
         -d '{"batchSize": 10}'
    ```
  - **Control de Recursión (No recursivo)**:
    ```bash
    curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/batch-enrich" \
         -H "x-admin-token: paz_mundial" \
         -d '{"batchSize": 20, "recursive": false}'
    ```

---

> [!TIP]
> **Endpoints Legacy**: El endpoint `/search` sigue activo por compatibilidad, pero se recomienda migrar a `/api/v1/dictamenes` para obtener los metadatos enriquecidos de la versión 2.
