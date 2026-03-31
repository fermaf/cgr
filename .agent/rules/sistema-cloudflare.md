---
trigger: always_on
glob:
description:
---

# Regla de Sistema: Cloudflare

Este repositorio corre sobre Cloudflare Workers y Cloudflare Pages.

## Infraestructura canónica

- Worker productivo: `cgr-platform`
- Frontend productivo: `cgr-jurisprudencia-frontend`
- Backend principal: `https://cgr-platform.abogado.workers.dev`
- Frontend principal: `https://cgr-jurisprudencia-frontend.pages.dev`

## Stack real

- Cloudflare Workers para API y lógica doctrinal
- D1 para persistencia relacional
- KV para almacenamiento auxiliar
- Pinecone para embeddings doctrinales
- Enrichment doctrinal con `mistral-large-2512`
- Query understanding con `mistral-large-2411`

## Reglas operativas

- No asumir staging como flujo normal de trabajo.
- No tratar previews o subdominios auxiliares como canónicos.
- Si el cambio está listo, validado y seguro, se despliega.
- La configuración real vive en `cgr-platform/wrangler.jsonc`.
- Si hay discrepancia entre documentación y código/configuración, prevalece el código y `wrangler.jsonc`.

## Lectura mínima complementaria

- `AGENTS.md`
- `context/project_context.md`
- `context/architecture_map.md`
- `docs/guias_tareas/04_entornos_y_despliegue.md`
