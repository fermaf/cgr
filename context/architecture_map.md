# Mapa de Arquitectura

## Estructura canónica del repo

- [cgr-platform/](/home/bilbao3561/github/cgr/cgr-platform)
  Backend productivo, endpoints, retrieval, clustering doctrinal, grafo jurídico, ingestión y workflows.

- [frontend/](/home/bilbao3561/github/cgr/frontend)
  Producto visible para usuario final: búsqueda, líneas doctrinales, detalle de dictamen, lectura sugerida.

- [agents/](/home/bilbao3561/github/cgr/agents)
  Runtime agéntico del proyecto. Diagnóstico, remediación controlada y tooling operativo.

- [docs/](/home/bilbao3561/github/cgr/docs)
  Documentación canónica del proyecto.

- [context/](/home/bilbao3561/github/cgr/context)
  Capa de arranque rápido para nuevos agentes.

## Flujo doctrinal principal

1. ingestión de dictámenes
2. enrichment jurídico
3. metadata doctrinal automática post-enrichment
4. persistencia estructurada en D1/KV
5. embeddings en Pinecone
6. retrieval semántico
7. agrupación doctrinal
8. prioridad jurídica y vigencia
9. render visible en frontend

## Archivos clave del core

- [index.ts](/home/bilbao3561/github/cgr/cgr-platform/src/index.ts)
- [doctrineClusters.ts](/home/bilbao3561/github/cgr/cgr-platform/src/lib/doctrineClusters.ts)
- [doctrineLines.ts](/home/bilbao3561/github/cgr/cgr-platform/src/lib/doctrineLines.ts)
- [doctrinalMetadata.ts](/home/bilbao3561/github/cgr/cgr-platform/src/lib/doctrinalMetadata.ts)
- [doctrinalGraph.ts](/home/bilbao3561/github/cgr/cgr-platform/src/lib/doctrinalGraph.ts)
- [legalSourcesCanonical.ts](/home/bilbao3561/github/cgr/cgr-platform/src/lib/legalSourcesCanonical.ts)
- [DoctrineReadingWorkspace.tsx](/home/bilbao3561/github/cgr/frontend/src/components/doctrine/DoctrineReadingWorkspace.tsx)
- [DictamenDetail.tsx](/home/bilbao3561/github/cgr/frontend/src/pages/DictamenDetail.tsx)
- [Home.tsx](/home/bilbao3561/github/cgr/frontend/src/pages/Home.tsx)

## Skills relevantes hoy

- embedding consistency check
- metadata quality audit
- metadata remediation planner
- metadata auto normalization executor
- metadata blocker regeneration executor
- doctrine coherence audit
- doctrine structure remediation executor

La regla es simple:

- las skills ayudan a inspeccionar, priorizar y remediar;
- el core sigue viviendo en `cgr-platform/` y `frontend/`.
