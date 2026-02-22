# Documentación CGR.ai

Centro documental del ecosistema **CGR.ai** — plataforma de jurisprudencia administrativa inteligente para la Contraloría General de la República de Chile.

> [!NOTE]
> **El código de producción (`cgr-platform/src` y `frontend/src`) es la fuente de verdad primaria.** Si existe discrepancia entre esta documentación y el código, obedezca al código.

---

## Índice

| # | Documento | Descripción |
|---|---|---|
| 1 | [Negocio y Estrategia](./01_negocio_y_estrategia.md) | Visión del producto, propuesta de valor y usuarios target |
| 2 | [Arquitectura](./02_arquitectura.md) | Diagrama de componentes, esquema D1, Pinecone, AI Gateway, flujos de datos |
| 3 | [Guía de Desarrollo](./03_guia_desarrollo.md) | Onboarding, estructura de código, stack, desarrollo local y testing |
| 4 | [Operación y Mantenimiento](./04_operacion_y_mantenimiento.md) | Endpoints, cron, workflows, deploy, secrets, troubleshooting |
| 5 | [Manual de Usuario](./05_manual_usuario.md) | Interfaz frontend, búsqueda semántica, badges, vista de detalle |
| 6 | [Feedback y Roadmap](./06_feedback_y_roadmap.md) | Deudas técnicas, mejoras propuestas y roadmap |

---

## Topología del Repositorio

```
cgr/
├── cgr-platform/          # Backend — Cloudflare Worker (TypeScript/Hono)
│   ├── src/
│   │   ├── index.ts        # API REST (endpoints)
│   │   ├── types.ts        # Tipos e interfaces
│   │   ├── clients/        # Mistral AI, Pinecone, CGR scraper
│   │   ├── storage/        # D1, KV
│   │   ├── workflows/      # IngestWorkflow, BackfillWorkflow
│   │   └── lib/            # Utilidades (ingesta, hashing)
│   └── wrangler.jsonc      # Configuración Cloudflare
├── frontend/              # Frontend — React 19 + Vite (Cloudflare Pages)
│   ├── src/
│   │   ├── pages/          # Vistas principales
│   │   ├── components/     # Componentes reutilizables
│   │   └── types.ts        # Contratos de API
│   └── functions/          # Cloudflare Pages Functions (proxy API)
├── docs/                  # ← Estás aquí
├── migracion/             # (HISTÓRICO) Scripts de migración MongoDB → D1
└── borrame/               # (HISTÓRICO) Código legacy deprecated
```

## Datos de Producción (Febrero 2026)

| Métrica | Valor |
|---|---|
| Dictámenes totales | **11.235** |
| Vectorizados (búsqueda semántica) | **11.138** |
| Pendientes de enriquecimiento | **94** |
| Modelo LLM | Mistral Large 2411 |
| Base vectorial | Pinecone (llama-text-embed-v2) |
| Namespace | `mistralLarge2411` |
