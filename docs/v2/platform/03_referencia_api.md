# 03 - Referencia Exhaustiva de API y Comandos CURL

Este documento provee un inventario completo de los puntos de entrada (endpoints) de la **CGR-Platform**. Se incluyen comandos `curl` listos para ser copiados y pegados, utilizando la URL real de producción y cubriendo todas las variaciones de parámetros.

> [!NOTE]
> **Base URL de Producción**: `https://cgr-platform.abogado.workers.dev`

---

## 🔐 Autenticación y Seguridad
Los endpoints administrativos (POST) requieren el header `x-admin-token` en el entorno de producción.
- **Header**: `x-admin-token: <tu_secret_token>`

---

## 1. Consultas y Búsqueda (`GET`)

### 1.1 Búsqueda Híbrida Inteligente
Busca dictámenes por lenguaje natural o palabras clave. Implementa un motor de fallback (Pinecone -> D1).

- **Endpoint**: `/api/v1/dictamenes`
- **Parámetros**:
  - `q` (string, **requerido**): Término de búsqueda.
  - `page` (number, opcional): Default `1`.

#### Escenario A: Búsqueda Simple (Lenguaje Natural)
```bash
curl -X GET "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes?q=responsabilidad+administrativa+municipios" \
  -H "Accept: application/json"
```

#### Escenario B: Búsqueda Paginada
```bash
curl -X GET "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes?q=educacion&page=2" \
  -H "Accept: application/json"
```

---

### 1.2 Detalle Completo de Dictamen
Retorna metadatos, enriquecimiento de IA (v2) y el objeto JSON original de la fuente.

- **Endpoint**: `/api/v1/dictamenes/:id`

#### Ejemplo de Recuperación
```bash
curl -X GET "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/012345N24" \
  -H "Accept: application/json"
```

---

### 1.3 Estadísticas de Salud (Stats)
Resumen del estado actual del almacén de datos, incluyendo conteos totales y distribución temporal.

- **Endpoint**: `/api/v1/stats`
- **Método**: `GET`
- **Respuesta JSON**:
  - `total` (number): Cantidad total de dictámenes en la base de datos `D1`.
  - `last_updated` (string, ISO8601): Fecha de la última modificación detectada en la tabla de dictámenes.
  - `by_year` (array): Lista de objetos `{ anio: number, count: number }`.
    - > [!NOTE]
    - > El array `by_year` se entrega ordenado por **año descendente** (`anio DESC`) por defecto desde el backend para priorizar la visualización de datos recientes en tablas, aunque componentes visuales (gráficos) pueden invertirlo para flujo cronológico.

#### Ejemplo de Consulta
```bash
curl -X GET "https://cgr-platform.abogado.workers.dev/api/v1/stats" \
  -H "Accept: application/json"
```

---

### 1.4 Heatmap Normativo (Analítica Fase 1)
Entrega agregaciones por tipo de norma y número, agrupadas por año de dictamen.

- **Endpoint**: `/api/v1/analytics/statutes/heatmap`
- **Parámetros Query**:
  - `yearFrom` (number, opcional): Año mínimo (ej: `2020`).
  - `yearTo` (number, opcional): Año máximo.
  - `limit` (number, opcional): Default `50`, máximo `500`.
  - `live` (boolean-like, opcional): `1|true|yes` para forzar consulta en vivo (sin snapshot).

#### Escenario A: Consulta por snapshot (default)
```bash
curl -X GET "https://cgr-platform.abogado.workers.dev/api/v1/analytics/statutes/heatmap?yearFrom=2022&yearTo=2025&limit=20" \
  -H "Accept: application/json"
```

#### Escenario B: Consulta en vivo
```bash
curl -X GET "https://cgr-platform.abogado.workers.dev/api/v1/analytics/statutes/heatmap?live=1&limit=30" \
  -H "Accept: application/json"
```

---

### 1.5 Tendencias por Materia (Analítica Fase 1)
Entrega volumen por materia y conteo de dictámenes marcados como relevantes.

- **Endpoint**: `/api/v1/analytics/topics/trends`
- **Parámetros Query**:
  - `yearFrom` (number, opcional): Año mínimo.
  - `yearTo` (number, opcional): Año máximo.
  - `limit` (number, opcional): Default `50`, máximo `500`.
  - `live` (boolean-like, opcional): fuerza consulta sobre tablas base.

#### Ejemplo
```bash
curl -X GET "https://cgr-platform.abogado.workers.dev/api/v1/analytics/topics/trends?yearFrom=2021&limit=25" \
  -H "Accept: application/json"
```

---

### 1.6 Linaje Jurisprudencial (Fase 2 Bootstrap)
Retorna un subgrafo local de relaciones entrantes/salientes basadas en `dictamen_referencias`.

- **Endpoint**: `/api/v1/dictamenes/:id/lineage`
- **Descripción**:
  - `rootId`: dictamen solicitado.
  - `nodes`: nodo raíz + nodos vecinos encontrados en D1.
  - `edges`: relaciones `incoming_reference` y `outgoing_reference`.

#### Ejemplo
```bash
curl -X GET "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/012345N24/lineage" \
  -H "Accept: application/json"
```
---

### 1.7 Monitor de Migración LLM
Retorna estadísticas, evolución y eventos recientes del proceso de migración de modelos (2411 -> 2512).

- **Endpoint**: `/api/v1/admin/migration/info`
- **Descripción**:
  - `stats`: conteo por estado y modelo.
  - `evolution`: serie temporal de enriquecimientos.
  - `events`: feed de `skill_events` e `historial_cambios`.
  - `modelTarget`: modelo configurado actualmente como objetivo.

#### Ejemplo
```bash
curl -X GET "https://cgr-platform.abogado.workers.dev/api/v1/admin/migration/info" \
  -H "Accept: application/json"
```

---

---

## 2. Operaciones Administrativas (`POST`)

### 2.1 Ingesta por Rango de Fechas (`IngestWorkflow`)
Inicia el scraping del portal de la Contraloría para un periodo determinado.

- **Endpoint**: `/api/v1/dictamenes/crawl/range`

#### Ejemplo: Ingesta de un Mes
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/crawl/range" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_TOKEN_HERE" \
  -d '{
    "date_start": "2024-01-01",
    "date_end": "2024-01-31",
    "limit": 1000
  }'
```

---

### 2.2 Enriquecimiento Masivo (`BackfillWorkflow`)
Procesa registros para generar análisis de IA y subirlos a Pinecone.

- **Endpoint**: `/api/v1/dictamenes/batch-enrich`

#### Ejemplo: Lote Estándar
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/batch-enrich" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_TOKEN_HERE" \
  -d '{
    "batchSize": 50,
    "delayMs": 500
  }'
```

---

### 2.3 Reproceso Integral (Atomic Repair)
Reinicia el ciclo completo para un dictamen específico (Re-parse -> Re-AI -> Re-Vector).

- **Endpoint**: `/api/v1/dictamenes/:id/re-process`

#### Ejemplo
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/012345N24/re-process" \
  -H "x-admin-token: YOUR_TOKEN_HERE"
```

---

### 2.4 Sincronización Vectorial de Emergencia
Actualiza solo el índice de Pinecone con la data actual de D1 (Gold Standard v2).

- **Endpoint**: `/api/v1/dictamenes/:id/sync-vector`

#### Ejemplo
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/012345N24/sync-vector" \
  -H "x-admin-token: YOUR_TOKEN_HERE"
```

---

### 2.5 Sincronización Masiva (v2 Standards)
Actualiza lotes de registros antiguos al formato v2.

- **Endpoint**: `/api/v1/dictamenes/sync-vector-mass`

#### Ejemplo
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/sync-vector-mass" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_TOKEN_HERE" \
  -d '{ "limit": 100 }'
```

---

### 2.6 Reparación Masiva de Atributos (old_url, division_id)
Endpoint asíncrono para rehidratar columnas clave en D1 (`old_url`, `division_id`) leyendo la fuente de verdad en KV. Utilizado por el script `scripts/repair_nulls.js`.

- **Endpoint**: `/api/v1/jobs/repair-nulls`
- **Método**: `POST`
- **Parámetros Query**:
  - `limit` (number, opcional): Número de registros a procesar por lote (recomendado: 10-50).
  - `id` (string, opcional): Si se indica, procesa un único dictamen.

#### Ejemplo: Lote pequeño
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/jobs/repair-nulls?limit=10"
```

---

### 2.7 Materialización de Snapshots Analíticos
Refresca tablas de snapshot en D1 para acelerar endpoints de analítica.

- **Endpoint**: `/api/v1/analytics/refresh`
- **Headers**:
  - `Content-Type: application/json`
  - `x-admin-token` requerido en producción.
- **Body JSON**:
  - `snapshotDate` (string `YYYY-MM-DD`, opcional): por defecto usa la fecha actual UTC.
  - `yearFrom` (number, opcional)
  - `yearTo` (number, opcional)
  - `limit` (number, opcional): default `1000`, máximo `10000`.

#### Ejemplo: Refresh completo
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/analytics/refresh" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_TOKEN_HERE" \
  -d '{ "limit": 1000 }'
```

#### Ejemplo: Refresh acotado por rango de años
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/analytics/refresh" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_TOKEN_HERE" \
  -d '{ "snapshotDate": "2026-02-27", "yearFrom": 2020, "yearTo": 2025, "limit": 1500 }'
```

---

## 3. Triggers Proactivos y Debugging

### 3.1 Trigger Manual de Ingesta
Dispara el workflow con parámetros de búsqueda libre.

- **Endpoint**: `/ingest/trigger`

#### Ejemplo: Búsqueda por Término en Portal CGR
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/ingest/trigger" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_TOKEN_HERE" \
  -d '{
    "search": "recurso de proteccion",
    "limit": 10
  }'
```

---

### 3.2 Sincronización D1-KV (`KVSyncWorkflow`)
Repara discrepancias de estado entre la base relacional y el almacén de claves.

- **Endpoint**: `/api/v1/trigger/kv-sync`

#### Ejemplo
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/trigger/kv-sync" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_TOKEN_HERE" \
  -d '{ "limit": 500, "delayMs": 100 }'
```

---

### 3.3 Verificación de Conectividad CGR
Prueba el scraper contra el portal real y retorna el primer resultado.

- **Endpoint**: `/api/v1/debug/cgr`

#### Ejemplo: Lookback de 10 días
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/debug/cgr" \
  -H "Content-Type: application/json" \
  -d '{ "lookback": 10 }'
```

---

---

## 4. Catálogo de Incidentes Skillgen (v2)
Inventario de códigos de incidentes normalizados y el ruteo de sus diagnósticos automáticos.

| Código | Familia | Sistema | Skill Sugerida | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `D1_NO_SUCH_TABLE` | `db` | `d1` | `d1_missing_table_triage` | Tabla faltante en base de datos local o remota. |
| `NETWORK_DNS_LOOKUP_FAILED` | `network` | `http` | `cgr_network_baseurl_verify` | Fallo en la resolución DNS del portal de la CGR. |
| `AI_GATEWAY_TIMEOUT` | `ai` | `mistral` | `mistral_timeout_triage` | Tiempo de espera agotado en el AI Gateway. |
| `AI_MISTRAL_FAILED` | `ai` | `mistral` | `mistral_timeout_triage` | Fallo general en el enriquecimiento de Mistral (Backfill). |
| `WORKFLOW_RPC_EXCEPTION` | `workflow` | `workflows` | `workflow_rpc_this_capture_guard` | Error de captura de `this` en pasos de workflow. |
| `UNKNOWN` | `unknown` | `worker` | `__UNMATCHED__` | Incidente no clasificado, requiere revisión humana. |

> [!TIP]
> Puedes consultar estos incidentes en tiempo real en `/api/v1/admin/migration/info`.

---

[Referencia: 00 - Guía de Estándares para Agentes LLM](file:///home/fermaf/github/cgr/docs/v2/platform/00_guia_estandares_agentes_llm.md)
