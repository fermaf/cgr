# Arquitectura del Sistema CGR Platform

Este documento describe la arquitectura, diseño y flujo de datos de la plataforma de inteligencia jurídica de la Contraloría General de la República (CGR).

## 1. Visión General

El sistema es una plataforma de ingesta, procesamiento y búsqueda semántica de dictámenes. Su objetivo es transformar la base de datos de dictámenes de la CGR en una base de conocimiento consultable mediante Inteligencia Artificial.

El núcleo del sistema es un **Cloudflare Worker** que expone una API REST y orquesta flujos de trabajo asíncronos para procesar los documentos.

## 2. Diagrama de Arquitectura

```mermaid
graph TD
    User[Usuario / Cron] -->|Trigger| API[API Gateway (Hono)]
    API -->|Start Workflow| WF[IngestWorkflow (Cloudflare Workflows)]
    
    subgraph "Cloudflare Ecosystem"
        WF -->|1. Fetch| CGR[CGR Website (Legacy Scraper)]
        WF -->|2. Store Raw| KV[Cloudflare KV (Raw Storage)]
        WF -->|2. Metadata| D1[Cloudflare D1 (SQL Database)]
    end
    
    subgraph "AI & External Services"
        WF -->|3. Enrich| AIGateway[Cloudflare AI Gateway / Mistral via OpenAI SDK]
        WF -->|4. Vectorize| Pinecone[Pinecone Vector DB]
    end
    
    AIGateway -->|JSON Analysis| WF
    Pinecone -->|Integrated Inference| PineconeEmb[Embedding (llama-text-embed-v2)]
```

## 3. Componentes Principales

### 3.1. Orquestador (Cloudflare Workflows)
Utilizamos **Cloudflare Workflows** para manejar el proceso de ingesta. A diferencia de las colas tradicionales, los Workflows permiten:
- **Ejecución Secuencial y Observable**: Cada paso (Fetch, Persist, Enrich, Index) es visible y monitoreable.
- **Manejo de Estados**: El estado se persiste automáticamente entre pasos.
- **Reintentos Inteligentes**: Si la API de Mistral falla, el workflow reintenta solo ese paso sin perder el progreso anterior.

### 3.2. Capa de Datos (Híbrida)
Mantenemos una estrategia de almacenamiento dual para eficiencia y costo:
- **Cloudflare D1 (SQL)**: Almacena metadatos estructurados (fechas, n_dictamen, estado de procesamiento) y resultados del enriquecimiento (título, resumen, etiquetas). Mantiene la compatibilidad con el esquema de 13 tablas heredado.
- **Cloudflare KV (Key-Value)**: Almacena el JSON crudo completo (`raw_data`) descargado de la CGR. Esto evita saturar la base de datos SQL con blobs gigantes de texto.

### 3.3. Motores de Inteligencia (AI)
- **Mistral AI (`mistral-large-2411`) vía Cloudflare AI Gateway**: Se utiliza para el "Enriquecimiento". Analiza el texto jurídico crudo y extrae metadatos y resúmenes estructurados en JSON. Todas las peticiones al LLM pasan a través del **AI Gateway** (Endpoint de Compatibilidad OpenAI) permitiendo cacheo, logging centralizado, y observabilidad.
- **Pinecone (Serverless)**: Base de datos vectorial.
    - **Integrated Inference vía API REST pura**: No generamos los embeddings localmente en el Worker (evitando problemas de dimensiones cruzadas de 256 vs 1024). Enviamos directamente el texto plano usando `fetch` crudo a los endpoints `/records` y `/search` de Pinecone. Pinecone recibe el texto y se encarga asíncronamente de la inferencia (*text-embedding*) y el guardado/búsqueda. El uso del SDK oficial de Pinecone de npm fue descartado a propósito por sus limitantes al forzar el empaquetado de vectores que interrumpe la feature de *Integrated Inference*.

## 4. Flujo de Datos (Pipeline de Ingesta)

El proceso de un dictamen sigue estos 5 pasos estrictos:

1.  **Fetch (CGR Client)**: Se conecta al buscador oficial de la CGR simulando un navegador. Descarga el JSON original del dictamen.
2.  **Ingest (Raw)**:
    *   Genera un hash único (SHA-256) del contenido para detectar duplicados.
    *   Guarda el JSON crudo en **KV**.
    *   Crea un registro inicial en **D1** con estado `ingested`.
3.  **Enrich (Mistral Client)**:
    *   Envía el texto del dictamen a Mistral con un prompt experto en Derecho Administrativo Chileno (heredado del proyecto original).
    *   Recibe un JSON estructurado con el análisis.
    *   Guarda el análisis en **D1** y actualiza el estado a `enriched`.
4.  **Index (Pinecone Client)**:
    *   Construye un payload de texto combinando: *Título + Resumen + Análisis*.
    *   Realiza un "Upsert" a Pinecone.
    *   Actualiza el estado en **D1** a `vectorized`.

## 5. API Interface (Hono)

El worker expone los siguientes endpoints para control y consumo:

- `POST /ingest/trigger`: Inicia manualmente el Workflow de ingesta.
    - Body: `{ "search": "termino", "limit": 10 }`
- `GET /search`: Realiza una búsqueda semántica sobre los dictámenes procesados.
    - Query: `?q=termino&limit=10`
    - Proxy directo a la API de búsqueda de Pinecone.

## 6. Consideraciones de Diseño

- **Compatibilidad**: Se ha portado el 100% de la lógica de negocio (prompts, normalización de datos, manejo de fechas) del proyecto `@borrame` para asegurar que la calidad de los datos sea idéntica.
- **Escalabilidad**: El uso de Workflows permite procesar miles de dictámenes sin tiempos de espera (timeouts) del Worker, ya que cada paso tiene su propio tiempo de ejecución.

## 7. Mantenimiento del Backend (Worker)
- **Modificación al LLM**: Para cambiar los *prompts* o cambiar de un modelo Mistral a otro, modifique el archivo `src/clients/mistral.ts`. Dicho archivo no emplea el SDK nativo de Mistral, sino el SDK genérico de `openai` apuntando a la URL del **Cloudflare AI Gateway**.
- **Gestión de variables y Secrets**: El Token real del proveedor se aloja en `MISTRAL_API_KEY` o `PINECONE_API_KEY`. Para usar la pasarela segura del Cloudflare AI Gateway, la plataforma inyecta obligatoriamente el header `cf-aig-authorization` a través de la variable `CF_AIG_AUTHORIZATION` en los headers por defecto del cliente.
- **Resolución de problemas de Pinecone Vector Dimension**: Si alguna vez la API devuelve un error `Vector dimension 256 does not match the dimension of the index 1024`, usualmente significa que el *Integrated Inference* falló y el AI Gateway de Cloudflare intentó usar de emergencia un fallback de OpenAI (text-embedding-ada-002) que es de 256. El sistema de `src/clients/pinecone.ts` está blindado contra esto al usar peticiones en crudo de `fetch()` a la API REST de Pinecone directamente, obligando a Pinecone a ingerir solo el string de texto antes de inferir por sí mismo. *No intente instalar `@pinecone-database/pinecone` nuevamente*.
