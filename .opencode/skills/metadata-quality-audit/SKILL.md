---
name: metadata-quality-audit
description: Audita la calidad de la metadata doctrinal en D1
---

## Qué hago

Inspecciono la capa de metadata doctrinal del proyecto para verificar:
- Cobertura sobre el universo de dictámenes
- Backlog remanente
- Consistencia de estados
- Posibles blockers o anomalías

## Cuándo usarme

Como parte de la auditoría periódica de calidad del proyecto. Es el primer paso antes de planificar remediación.

## Criterios de salida

Retorno un reporte de auditoría con:
- Porcentaje de cobertura
- Cantidad de filas pendientes
- Estados anómalos detectados
- Recomendaciones de acción

## Cómo ejecutarme

```bash
npm run agents:metadata:audit
```

## Contexto del proyecto

La metadata doctrinal en este proyecto incluye:
- `dictamen_metadata_doctrinal`: snapshot operativo por dictamen
- `dictamen_metadata_doctrinal_evidence`: trazabilidad de señales
- Estados relevantes: `enriched_pending_vectorization`, `vectorized`, `md IS NULL`