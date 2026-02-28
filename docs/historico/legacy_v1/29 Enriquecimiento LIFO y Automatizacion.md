# 29. Procesos de Enriquecimiento y Automatización

## 29.1 Origen de Datos y fidedignidad
El sistema opera bajo una arquitectura de "Capa de Bronce" (Raw) persistida en **Cloudflare KV (`DICTAMENES_SOURCE`)**. 

> [!IMPORTANT]
> El valor inicial para cualquier proceso de enriquecimiento o reproceso es el JSON crudo almacenado en KV. El sistema **no re-consulta** la web de la Contraloría en los flujos de enriquecimiento para garantizar la trazabilidad sobre la versión capturada originalmente.

## 29.2 Catálogo Detallado de Endpoints de Escritura

### A. Gestión de Ingesta (Crawl)
- **Endpoint**: `POST /api/v1/dictamenes/crawl/range`
- **Lógica**: `src/workflows/ingestWorkflow.ts`
- **Descripción**: Ingesta masiva basada en parámetros de fecha. Alimenta KV y marca en D1 como `ingested`.

### B. Enriquecimiento LIFO Masivo
- **Endpoint**: `POST /api/v1/dictamenes/batch-enrich`
- **Lógica**: `src/workflows/backfillWorkflow.ts`
- **Estrategia LIFO**: Ordena por `fecha_documento DESC`. Prioriza dictámenes de 2024/2025 sobre el fondo histórico.
- **Acción**: Mistral Large (Análisis) + Pinecone (Vectores) + D1 (Metadatos Jurídicos).

### C. Reproceso Individual (ID specific)
- **Endpoint**: `POST /api/v1/dictamenes/:id/re-process`
- **Lógica**: `src/index.ts` (Handler inline)
- **Flujo**: Extrae de KV → Llama a Mistral → Guarda en D1 → Sincroniza Pinecone.
- **Uso**: Corrección de errores puntuales o actualización de modelo para un dictamen específico.

### D. Sincronización Vectorial pura
- **Endpoint**: `POST /api/v1/dictamenes/:id/sync-vector`
- **Lógica**: `src/index.ts`
- **Descripción**: Envía el análisis ya existente en D1 hacia Pinecone. Útil si se desea re-indexar sin incurrir en costos de IA (Mistral).

---

## 29.3 Marco Teórico de Automatización (Hacia el Pipeline Unificado)

El objetivo es transitar de un modelo manual (trigger-based) a uno reactivo donde el enriquecimiento siga inmediatamente a la ingesta.

### Arquitecturas Evaluadas:

| Componente | Rol en Automatización | Factibilidad |
|---|---|---|
| **Workflow Chaining** | El `IngestWorkflow` dispara una instancia de `BackfillWorkflow` al finalizar. | **Alta**. Mantiene trazabilidad en Dashboard. |
| **Cloudflare Queues** | El `IngestWorkflow` publica IDs en una cola que consume un `Worker` de enriquecimiento. | **Media/Alta**. Mejor manejo de carga masiva, pero mayor complejidad de estados. |
| **Pipeline Síncrono** | El proceso de enriquecimiento ocurre en el mismo loop del crawl. | **Baja**. Riesgo de timeouts innecesarios en ingesta. |

> [!NOTE]
> La visión de largo plazo es integrar el enriquecimiento como un paso "post-ingest" automático, permitiendo que la plataforma se auto-mantenga al día con los dictámenes diarios de la Contraloría.

---

## 29.4 Glosario de Fuentes de Código
- **Orquestación**: `src/workflows/`
- **API (Hono)**: `src/index.ts`
- **Capa D1**: `src/storage/d1.ts`
- **Clientes (Mistral/Pinecone)**: `src/clients/`
