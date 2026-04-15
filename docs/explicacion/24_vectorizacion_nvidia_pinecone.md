# Vectorización con NVIDIA y Pinecone

## Contexto

El índice Pinecone `cgr` fue creado con inferencia integrada usando el modelo `llama-text-embed-v2`, dimensión `1024`, campo fuente `analisis` y parámetros diferenciados:

- lectura: `input_type = query`;
- escritura: `input_type = passage`;
- truncamiento: `END`;
- dimensión: `1024`.

El consumo de embeddings en Pinecone agotó la cuota disponible. Para evitar que la cuota de inferencia integrada bloquee el pipeline, el backend deja de usar los endpoints `/records/.../upsert` y `/records/.../search` para inferencia, y pasa a usar Pinecone solo como base vectorial.

## Flujo vigente

### Escritura

1. El workflow obtiene el enriquecimiento del dictamen.
2. El cliente Pinecone normaliza metadata y arma el texto semántico en `analisis`:
   - título;
   - resumen;
   - análisis jurídico.
3. NVIDIA genera el embedding con:
   - modelo: `nvidia/llama-3.2-nv-embedqa-1b-v2`;
   - `input_type = passage`;
   - `dimensions = 1024`;
   - `truncate = END`.
4. Pinecone recibe el vector ya calculado mediante `/vectors/upsert`.

### Lectura

1. El usuario envía una búsqueda semántica.
2. NVIDIA genera el embedding de la consulta con:
   - modelo: `nvidia/llama-3.2-nv-embedqa-1b-v2`;
   - `input_type = query`;
   - `dimensions = 1024`;
   - `truncate = END`.
3. Pinecone recibe el vector mediante `/query`.
4. Si el retrieval vectorial falla, los endpoints mantienen fallback SQL cuando corresponde.

## Límite operativo NVIDIA

NVIDIA acepta como máximo 20 peticiones por minuto para este uso. El sistema usa un margen conservador:

- `NVIDIA_EMBEDDING_RPM_LIMIT = 18`;
- delay mínimo de vectorización: `3500 ms`;
- batch máximo de vectorización: `18`.

El limitador vive en D1 sobre la tabla `rate_limits`, por lo que aplica transversalmente a búsquedas y vectorización. Si NVIDIA responde 429 o el limitador local corta la petición, el dictamen vuelve a `enriched_pending_vectorization` con evento `NVIDIA_EMBEDDING_RATE_LIMITED`.

## Configuración

Variables versionadas en `wrangler.jsonc`:

- `NVIDIA_EMBEDDING_API_URL`;
- `NVIDIA_EMBEDDING_MODEL`;
- `NVIDIA_EMBEDDING_DIMENSIONS`;
- `NVIDIA_EMBEDDING_RPM_LIMIT`.

Secreto no versionado:

- `NVIDIA_API_KEY`.

El secreto debe cargarse con:

```bash
cd cgr-platform
npx wrangler secret put NVIDIA_API_KEY --env production
```

Si la clave fue compartida en texto claro, debe rotarse antes de usarla en producción.

## Backfill de pendientes

Ejecutar lotes chicos para no competir agresivamente con búsquedas semánticas:

```bash
curl -X POST https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/batch-vectorize \
  -H "x-admin-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{"batchSize":18,"delayMs":3500,"recursive":true}'
```

A 18 RPM, el techo teórico es 1080 embeddings por hora. La capacidad real puede ser menor si hay búsquedas de usuarios en paralelo.

## Validaciones mínimas

- `upsertRecord` debe llamar `/vectors/upsert`, no `/records/.../upsert`.
- `queryRecords` debe llamar `/query`, no `/records/.../search`.
- Los embeddings deben tener exactamente 1024 dimensiones.
- Los documentos deben vectorizarse como `passage`.
- Las consultas deben vectorizarse como `query`.
- No debe registrarse `NVIDIA_API_KEY` en logs ni archivos versionados.
