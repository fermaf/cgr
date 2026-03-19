# Paradigma B: Skillgen como Caso de Uso (Análisis de Dictámenes AI Powered)

## Objetivo

Usar Skillgen como parte del producto CGR.ai, donde la plataforma y el caso de uso son una sola cadena operativa.

## Definición

Skillgen no solo "observa" fallos: protege la continuidad del pipeline de dictámenes.

- ingesta CGR
- persistencia D1/KV
- enriquecimiento AI (Mistral)
- vectorización/búsqueda
- remediación operativa guiada por skills

## Foco funcional

- SLO de ingesta (latencia, completitud, tasa de error)
- Integridad del dictamen (campos críticos presentes)
- Calidad AI (respuesta válida, schema estable)
- Recuperación rápida ante incidentes repetitivos

## Skills de dominio (ejemplos)

- `cgr_network_baseurl_verify`
- `d1_remote_schema_verify`
- `mistral_timeout_triage`
- `vector_sync_retry_safe`

## Métricas de negocio-operación

- `dictamenes_ingestados_por_dia`
- `% dictamenes con enriquecimiento válido`
- `MTTD` y `MTTR` por tipo de incidente
- `% incidentes auto-resueltos por skill`

## Decisiones de arquitectura

- Mantener router determinista en runtime
- Dejar aprendizaje/evolución fuera de runtime (PRs)
- Separar claramente datos de dominio vs telemetría

## Riesgo principal

Acoplar demasiado la lógica de skills al formato actual de CGR.

## Mitigación

- Tests de contrato para adaptador CGR
- Versionado de skills
- Fallback `__UNMATCHED__` con evidencia persistida
