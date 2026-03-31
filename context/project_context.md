# Contexto Actual del Proyecto

## Stack real

- Backend doctrinal: Cloudflare Workers + Hono en [cgr-platform/](/home/bilbao3561/github/cgr/cgr-platform)
- Frontend: React + Vite + Cloudflare Pages en [frontend/](/home/bilbao3561/github/cgr/frontend)
- Base de datos principal: D1
- Almacenamiento derivado: KV
- Búsqueda vectorial: Pinecone

## Modelos y capas AI

- Enrichment doctrinal: `mistral-large-2512`
- Query understanding y rewrite conservador: `mistral-large-2411`

## Capacidades productivas ya operativas

- `doctrine-search`
- `doctrine-lines`
- `semantic_anchor_dictamen`
- `representative_dictamen_id`
- `pivot_dictamen`
- `reading_priority_reason`
- `graph_doctrinal_status`
- ranking híbrido semántico-doctrinal
- priorización por vigencia doctrinal
- remediación estructural de líneas doctrinales

## Grafo jurídico

La red principal vive en:

- `dictamen_relaciones_juridicas`

Ya se usa para:

- buckets visibles de relación;
- estado del criterio;
- lectura sugerida;
- orden doctrinal;
- explicación de vigencia.

## Fuentes legales

Las fuentes legales viven en:

- `dictamen_fuentes_legales`

La plataforma ya tiene:

- diccionario canónico base de normas;
- saneamiento histórico seguro para alias y variantes triviales;
- render más confiable en detalle de dictamen.

## Despliegue principal

- Worker principal: `cgr-platform`
- URL principal backend: `https://cgr-platform.abogado.workers.dev`
- Pages principal: `cgr-jurisprudencia-frontend`
- URL principal frontend: `https://cgr-jurisprudencia-frontend.pages.dev`

No tratar previews o alias auxiliares como canonical URLs.
