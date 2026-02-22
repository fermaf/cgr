# CGR Platform — Backend Worker

Plataforma de jurisprudencia inteligente. Cloudflare Worker escrito en TypeScript con Hono.

## Inicio Rápido

```bash
npm install
npm run dev      # Desarrollo local en http://localhost:8787
npx wrangler deploy  # Deploy a producción
```

## Documentación

Toda la documentación está centralizada en [`/docs`](../docs/README.md):
- [Arquitectura](../docs/02_arquitectura.md) — Diagrama, esquema D1, Pinecone, AI Gateway
- [Guía de Desarrollo](../docs/03_guia_desarrollo.md) — Stack, variables, patrones, testing
- [Operación](../docs/04_operacion_y_mantenimiento.md) — Endpoints, cron, workflows, troubleshooting

## Estructura

```
src/
├── index.ts         # API REST (Hono)
├── types.ts         # Interfaces TypeScript
├── clients/         # Mistral AI, Pinecone, CGR scraper
├── storage/         # D1, KV
├── workflows/       # IngestWorkflow, BackfillWorkflow
└── lib/             # Utilidades
```
