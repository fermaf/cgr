# CGR Platform - Cloudflare Worker & Workflows

## Descripción
Plataforma de inteligencia jurídica para la Contraloría General de la República (CGR), construida sobre Cloudflare Workers y Workflows.
Orquesta la ingesta, enriquecimiento (Mistral AI) y vectorización (Pinecone) de dictámenes de forma modular y observable.

Ver [ARCHITECTURE.md](./ARCHITECTURE.md) para detalles de diseño y flujo de datos.

## Estructura del Proyecto
- `src/workflows/ingestWorkflow.ts`: Orquestador principal del flujo de ingesta.
- `src/clients/`: Clientes para servicios externos (CGR, Mistral, Pinecone).
- `src/storage/`: Capa de persistencia (D1, KV).
- `src/lib/`: Lógica de negocio reutilizable (ingesta, hashing).
- `src/index.ts`: API Hono para control y búsqueda.

## Configuración
Asegúrate de tener las siguientes variables de entorno y secretos configurados en Cloudflare:
- `MISTRAL_API_KEY`
- `PINECONE_API_KEY`
- `PINECONE_INDEX_HOST`
- `PINECONE_NAMESPACE`
- `DB` (D1 Database Binding)
- `RAW_KV` / `STATE_KV` (KV Bindings)

## Desarrollo Local
1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Ejecutar worker en modo desarrollo:
   ```bash
   npm run dev
   ```
3. Disparar ingesta manual (ejemplo):
   ```bash
   curl -X POST http://localhost:8787/ingest/trigger \
     -H "Content-Type: application/json" \
     -d '{"search": "probidad", "limit": 5}'
   ```
4. Búsqueda semántica:
   ```bash
   curl "http://localhost:8787/search?q=probidad&limit=3"
   ```

## Despliegue
```bash
npm run deploy
```
