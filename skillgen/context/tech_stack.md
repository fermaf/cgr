# Tech Stack: CGR.ai

## Núcleo y Runtime
- **Runtime:** Cloudflare Workers (compatibilidad `nodejs_compat`).
- **Lenguaje:** TypeScript / Node.js.
- **Framework Backend:** Hono.
- **Frontend:** React + Vite (desplegado en **Cloudflare Pages**).

## Servicios Cloudflare
- **D1 (SQL):** Almacenamiento relacional de dictámenes, historial de cambios, atributos jurídicos y estadísticas.
- **KV (Key-Value):** Repositorio de alta performance para el contenido "raw" (JSON/Texto) de los dictámenes.
- **Queues:** Procesamiento asíncrono de tareas de ingesta y señales.
- **Workflows:** Motor de orquestación para procesos de larga duración (backfill e ingesta).
- **AI Gateway:** Middleware para consumo de LLMs con caching y observabilidad.

## Inteligencia Artificial y Búsqueda
- **LLM:** Mistral Large 2411 (vía Cloudflare AI Gateway).
- **Vector Database:** Pinecone (Index: `cgr`, Namespace: `mistralLarge2411`).
- **Embeddings:** Pinecone Integrated Inference (model: `multilingual-e5-large`).

## Comandos Típicos
```bash
# Desarrollo local
npm run dev

# Desplegar backend (Worker)
npx wrangler deploy

# Desplegar frontend (Pages)
npx wrangler pages deploy ./dist

# Ejecutar consulta en D1 remoto
wrangler d1 execute cgr-dictamenes --remote --command "SELECT COUNT(*) FROM dictamenes"

# Visualizar logs en tiempo real
wrangler tail
```
