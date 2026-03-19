# Etapa 2 Madurada: Propuesta y Ejecución de Iteración 1

Este documento actualiza el plan de `docs/27 Skillgen Blueprint cgr.md` para iniciar Etapa 2 con alcance acotado y ejecutable.

## Objetivo de Etapa 2

Pasar de "registrar y sugerir" a "ejecutar skills seguras y medibles".

## Iteración 1 (alcance)

- Catálogo formal de skills (metadata + playbook)
- Ejecutor de skill en modo seguro (`diagnostic_only`)
- Auditoría de ejecución en D1 (`skill_runs`)
- 3 skills productivas iniciales
- Suite mínima de pruebas de contrato y regresión

## Entregables de Iteración 1

1. `src/skills/catalog.json`
2. `src/lib/skillExecutor.ts` con políticas de seguridad
3. Migración D1 para `skill_runs`
4. Runbook operativo de skills
5. Panel mínimo (consulta D1) para ver incidentes + runs

## Skills iniciales propuestas

- `cgr_network_baseurl_verify`
  - valida URL/base host DNS y respuesta CGR
- `d1_remote_schema_verify`
  - compara columnas esperadas vs reales
- `mistral_timeout_triage`
  - aplica diagnóstico de timeout y recomendación

## Restricciones de seguridad

- Sin mutaciones destructivas automáticas en `prod`
- Sin ejecución de shell/commands dinámicos desde skill
- Toda ejecución deja evidencia (`skill_runs`)
- Límite de tiempo y reintentos por skill

## Plan de trabajo (2 semanas)

## Semana 1

- diseño de contrato `SkillDefinition`
- implementación de executor + guardrails
- migración D1 `skill_runs`

## Semana 2

- implementación de 3 skills iniciales
- pruebas E2E en entorno local/staging
- documentación y release candidate

## KPIs de Iteración 1

- 80% de incidentes frecuentes con skill asociada
- reducción de `UNKNOWN` al <10%
- tiempo medio de diagnóstico (MTTD) -30%

## Riesgos y mitigación

- Riesgo: skill mal clasificada
  - Mitigación: `dry_run` y revisión manual
- Riesgo: ruido operativo por exceso de runs
  - Mitigación: rate limit por fingerprint
