# CGR.ai

Plataforma de ingesta, análisis jurídico y búsqueda semántica de dictámenes de la Contraloría General de la República (Chile), ejecutada sobre Cloudflare Workers.

## Qué resuelve

CGR.ai transforma documentos administrativos complejos en un repositorio consultable por:

- búsqueda literal (SQL)
- búsqueda semántica (vectorial)
- ficha enriquecida por IA (resumen, análisis, etiquetas, booleanos jurídicos)

## Arquitectura en una vista

- Ingesta: API pública de CGR -> Worker -> D1 (`dictamenes`) + KV (`DICTAMENES_SOURCE`)
- Enriquecimiento: `ingested` -> Mistral -> `enriquecimiento` + tablas relacionales
- Vectorización: texto enriquecido -> Pinecone -> estado `vectorized`
- Operación: cron + Workflows + endpoints administrativos

## Estructura del monorepo

```txt
cgr/
├── cgr-platform/   # Backend productivo (Cloudflare Worker + Hono)
├── frontend/       # Frontend (React + Vite + Pages)
├── docs/           # Documentación técnica y operativa
├── migracion/      # Scripts históricos de migración
└── borrame/        # Código legado no productivo
```

## Estado actual (24-feb-2026)

- Workflows estabilizados frente a errores RPC por captura de `this` en `step.do`
- Logging estructurado con `LOG_LEVEL` (`debug|info|warn|error`)
- Ingesta tolerante a diferencias de esquema D1 para catálogos de abogados/descriptores
- Operación recomendada: toda validación de D1 con `wrangler d1 execute ... --remote`

## Inicio rápido

### Backend

```bash
cd cgr-platform
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Deploy backend

```bash
cd cgr-platform
npx wrangler deploy
```

## Operación esencial

### Crawl manual por rango de fechas

```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/crawl/range" \
  -H "Content-Type: application/json" \
  -d '{
    "date_start": "2025-06-01",
    "date_end": "2025-10-27",
    "limit": 50000
  }'
```

### Lanzar batch de enriquecimiento

```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/batch-enrich" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 50, "delayMs": 1000}'
```

### Ver backlog real en producción

```bash
cd cgr-platform
wrangler d1 execute cgr-dictamenes --remote --command "SELECT estado, COUNT(*) c FROM dictamenes GROUP BY estado ORDER BY c DESC;"
```

## Documentación

Punto de entrada: [docs/README.md](./docs/README.md)

- Arquitectura: [docs/02_arquitectura.md](./docs/02_arquitectura.md)
- Desarrollo: [docs/03_guia_desarrollo.md](./docs/03_guia_desarrollo.md)
- Operación: [docs/04_operacion_y_mantenimiento.md](./docs/04_operacion_y_mantenimiento.md)
- Briefing agente experto: [docs/99_briefing_agente_experto.md](./docs/99_briefing_agente_experto.md)
