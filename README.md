# CGR.ai — Plataforma de Jurisprudencia Administrativa Inteligente

**Estado:** Producción Activa · **Stack:** Cloudflare Workers + D1 + KV · Mistral AI · Pinecone · React 19 + Vite

Ecosistema de búsqueda semántica y enriquecimiento IA de dictámenes de la **Contraloría General de la República de Chile**.

---

## 📊 Datos de Producción

| Métrica | Valor |
|---|---|
| Dictámenes totales | **11.235** |
| Vectorizados (búsqueda semántica) | **11.138** (99.1%) |
| Modelo LLM | Mistral Large 2411 |
| Embedding | Pinecone Integrated Inference (llama-text-embed-v2) |
| Actualización | Automática cada 6 horas |

---

## 📚 Documentación

Toda la documentación está centralizada en [`/docs`](./docs/README.md):

| # | Documento | Descripción |
|---|---|---|
| 1 | [Negocio y Estrategia](./docs/01_negocio_y_estrategia.md) | Visión, propuesta de valor, usuarios |
| 2 | [Arquitectura](./docs/02_arquitectura.md) | Componentes, esquema D1, Pinecone, AI Gateway |
| 3 | [Guía de Desarrollo](./docs/03_guia_desarrollo.md) | Onboarding, stack, variables, testing |
| 4 | [Operación y Mantenimiento](./docs/04_operacion_y_mantenimiento.md) | Endpoints, cron, workflows, troubleshooting |
| 5 | [Manual de Usuario](./docs/05_manual_usuario.md) | Interfaz, búsqueda, badges |
| 6 | [Feedback y Roadmap](./docs/06_feedback_y_roadmap.md) | Deudas técnicas, mejoras, roadmap |

---

## 🛠 Estructura del Repositorio

```
cgr/
├── cgr-platform/          # Backend — Cloudflare Worker (Hono + TypeScript)
├── frontend/              # Frontend — React 19 + Vite (Cloudflare Pages)
├── docs/                  # Documentación centralizada
├── migracion/             # (Histórico) Scripts de migración MongoDB → D1
└── borrame/               # (Histórico) Código legacy deprecated
```

## 🚀 Inicio Rápido

```bash
# Backend
cd cgr-platform && npm install && npm run dev

# Frontend (otra terminal)
cd frontend && npm install && npm run dev

# Deploy
cd cgr-platform && npx wrangler deploy
```

Ver [Guía de Desarrollo](./docs/03_guia_desarrollo.md) para instrucciones completas.
