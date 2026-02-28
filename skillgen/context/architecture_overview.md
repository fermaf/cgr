# Architecture Overview: CGR.ai

## Propósito del Sistema
CGR.ai es una plataforma diseñada para la ingesta masiva, análisis mediante IA (LLMs) y recuperación semántica de dictámenes de la **Contraloría General de la República de Chile**. Su objetivo es transformar documentos administrativos planos en una base de conocimiento jurídica rica y consultable tanto por términos literales como por intención semántica.

## Flujos Críticos
1. **Ingesta (Crawl):** Extracción de metadatos y IDs desde la API pública de CGR. Almacenamiento inicial en **D1** (estado: `ingested`) y contenido completo en **KV**.
2. **Enriquecimiento (Enrich):** Los Workflows toman registros `ingested`, extraen el texto de KV, lo envían a **Mistral Large** vía AI Gateway para generar resúmenes, auditoría jurídica y etiquetas. Actualiza D1 (estado: `enriched`).
3. **Vectorización (Vectorize):** Conversión del texto enriquecido en vectores usando el endpoint de inferencia de **Pinecone**. Actualiza D1 (estado: `vectorized`).
4. **Búsqueda:** Búsqueda híbrida (SQL para filtros literales, Pinecone para semántica) expuesta vía API REST. Aplicación desplegada en **Cloudflare Pages**.

## Qué NO se puede romper
* **Deduplicación de IDs:** El sistema utiliza el ID corto de CGR como PK. Insertar duplicados corrompe la integridad del historial.
* **Consistencia KV-D1:** Si el registro existe en D1 pero no en KV, el flujo de enriquecimiento fallará permanentemente.
* **Formato de Enriquecimiento:** El prompt de Mistral debe retornar un JSON estricto. Cualquier cambio en el esquema del prompt romperá la inserción en las tablas relacionales de D1.
* **Bindings de Workflows:** La referencia a `this` en los pasos de Workflows es crítica para evitar errores de RPC.

## Estado de Datos
- `ingested`: Documento base registrado.
- `enriched`: IA generó análisis jurídico.
- `vectorized`: Disponible para búsqueda semántica.
- `error`: Fallo técnico en algún paso del workflow.
