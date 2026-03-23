# 01 - Arquitectura C4 y Flujos de Datos (Profundidad Técnica)

Este documento detalla la estructura técnica de **CGR-Platform**. Se basa en el modelo C4 para proporcionar visibilidad desde el contexto sistémico hasta el detalle de los componentes y workflows.

---

## 🏗️ Nivel 2: Diagrama de Contenedores (Ecosistema)

Detalle de cómo interactúan los servicios vinculados al Worker principal en Cloudflare.

```mermaid
graph TD
    subgraph Cloudflare_Ecosystem[Ecosistema Cloudflare]
        direction TB
        subgraph Worker[Worker: cgr-platform / Hono]
            API_Handlers[REST API / Endpoints]
            W_Engine[Workflow Entrypoints]
            Incident_Router[Incident Router]
            Analytics_Module[Analytics Module]
        end

        DB[(D1: cgr-dictamenes)]
        KV_SOURCE[(KV: DICTAMENES_SOURCE)]
        KV_PASO[(KV: DICTAMENES_PASO)]
        QS[Queues: Background Jobs]
    end

    subgraph External_Analytics
        AE[Analytics Engine]
    end

    subgraph External_AI[AI Services]
        Mistral[Mistral AI via Gateway]
        Pinecone[(Pinecone Vector Search)]
    end

    %% Relaciones
    API_Handlers --> DB
    API_Handlers --> KV_SOURCE
    API_Handlers --> KV_PASO
    API_Handlers --> Mistral
    Analytics_Module --> DB
    Analytics_Module --> KV_PASO
    W_Engine --> Incident_Router
    Incident_Router --> DB
    W_Engine --> Mistral
    W_Engine --> Pinecone
    API_Handlers -- LogEvents --> AE
```

---

## 🔄 Nivel 3: Flujos Críticos (Workflows)

### 3.1 Ciclo de Vida de Ingesta (IngestWorkflow)
El corazón de la plataforma reside en sus procesos de larga duración gestionados por Cloudflare Workflows. Este flujo asegura la resiliencia y la inmutabilidad del dato original.

```mermaid
sequenceDiagram
    participant C as Cron/Manual
    participant W as IngestWorkflow
    participant R as CGR Portal (Elasticsearch)
    participant KV as KV Source
    participant D as D1 DB
    participant M as Mistral AI
    participant P as Pinecone

    C->>W: Trigger(lookback / range)
    W->>R: Fetch Pages (Elasticsearch API)
    R-->>W: List items (Raw JSON)
    loop Cada Dictamen
        W->>KV: Store Raw JSON (Inmutabilidad)
        W->>D: Upsert Metadata (Status: ingested)
        
        Note over W: Validación de Tokens (Mistral Context)
        
        alt Proceso de Enriquecimiento
            W->>M: Analyze(Consolidated Prompt)
            M-->>W: Enrichment JSON (Jurisprudencia, Atributos, Fuentes)
            W->>D: Insert Enriquecimiento + Booleanos + Fuentes Legales
            
            alt Sincronización Vectorial
                W->>P: Upsert Vector (Metadata v2)
                W->>D: Update Status (vectorized)
            else Fallo AI/Longitud/Quota
                W->>D: Update Status (error_longitud / error_ai / error_quota)
            end

            opt Retro-Update (Impacto Histórico)
                W->>D: Propagate Flags (Atributos Jurídicos Destino)
                W->>KV: Update Source Destino (JSON Sync)
                W->>D: Log Relation (dictamen_relaciones_juridicas)
            end
        end
        W->>KV: Store Processed JSON (PASO)
    end
```

---

## 🛠️ Nivel 4: Detalles de Implementación (Source of Truth)

### 4.1 Ingeniería Inversa: Scraping de CGR
El sistema no utiliza un scraper de DOM tradicional; interactúa directamente con la API de Elasticsearch del portal de la Contraloría:
- **Endpoint**: `https://www.contraloria.cl/apibusca/search/dictamenes`
- **Método**: `POST` con cuerpo JSON.
- **Filtros**: Permite segmentar por `fecha_documento`, `n_dictamen` y `year_doc_id` usando sintaxis **Lucene**.

### 4.2 Inferencia Consolidada (Mistral)
Para optimizar costos y latencia, el sistema utiliza un **Prompt Consolidado**. En lugar de múltiples llamadas, se envía el texto completo para extraer simultáneamente:
1.  **Título y Resumen Jurídico**.
2.  **Análisis de Jurisprudencia** (si genera o no jurisprudencia).
3.  **Atributos Booleanos** (ej: si afecta a funcionarios, si es de carácter general).
4.  **Fuentes Legales** (Leyes, Decretos, etc.).
5.  **Acciones Jurídicas Emitidas (Retro-Update)**: Identificación de dictámenes antiguos que son modificados por el nuevo documento.

### 4.3 Pinecone Integrated Inference
Se utiliza el modelo **Serverless** de Pinecone con inferencia integrada:
- El Worker no genera los embeddings localmente.
- Se envía el texto a Pinecone y sus servidores internos gestionan el modelo de embeddings definido en el índice (`mistralLarge2512`).

---

> [!IMPORTANT]
> **Resiliencia**: Todo llamado externo (`fetch`) está protegido por el `IncidentRouter`. Si una API falla, se genera un registro en D1 y se activa el protocolo de recuperación (Skill) correspondiente.

**Referencia de Código**: [src/index.ts](file:///home/bilbao3561/github/cgr/cgr-platform/src/index.ts), [src/workflows/ingestWorkflow.ts](file:///home/bilbao3561/github/cgr/cgr-platform/src/workflows/ingestWorkflow.ts).
