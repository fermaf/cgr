# Skillgen Blueprint (cgr-platform)

Guía operativa y replicable para entender, auditar y ejecutar Skillgen en Cloudflare Workers.

Objetivo: que cualquier persona del equipo (o agente) pueda operar el sistema con criterios consistentes.

Fecha de actualización: 2026-02-26.

---

## 0) Definición en una frase

Skillgen transforma fallas técnicas del pipeline de dictámenes en incidentes estructurados, los rutea a skills y deja evidencia en D1 para aprendizaje y mejora continua.

---

## 1) Estado por etapas

## Etapa 1 (cerrada)

Flujo implementado y validado:

- normalización de incidentes (`normalizeIncident`)
- ruteo determinista por código (`routeIncident`)
- persistencia en `skill_events` (`recordSkillEvent`)
- fallback de ruteo (`__UNMATCHED__`)
- pruebas reproducibles local:
  - DNS inválido
  - `SKILL_TEST_ERROR=1`

## Etapa 2 (en maduración)

Objetivo: ejecutar skills seguras y medibles (no solo sugerencias).

- catálogo formal de skills
- ejecutor controlado con guardrails
- tabla de ejecuciones (`skill_runs`)
- runbooks de operación por skill

## Etapa 3 (posterior)

Motor evolutivo externo:

- analiza `skill_events` + métricas
- propone PRs de reglas/skills/tests
- nunca modifica runtime en producción sin revisión humana

---

## 2) Modelo de arquitectura (4 capas)

1. Telemetría estructurada
2. Router determinista
3. Skills ejecutables
4. Evolución externa por PR

---

## 3) Contratos que no se deben romper

## 3.1 Incident

Campos mínimos:

- `ts`, `env`, `service`, `kind`, `system`, `code`, `message`
- `context` sanitizado

Campos opcionales:

- `workflow`, `table`, `column`, `fingerprint`

Regla: `code` es el pivote de ruteo. Evitar dependencia de texto libre.

## 3.2 RouteDecision

- `matched: boolean`
- `skill: string`
- `reason: string`

Regla: todo incidente debe tener decisión explícita (incluido fallback).

## 3.3 skill_events (D1)

Persistencia de evidencia:

- incidente
- decisión
- fingerprint
- timestamp

Regla: preservar trazabilidad; no perder evidencia de ejecución.

---

## 4) Componentes clave

- `cgr-platform/src/lib/incident.ts`
- `cgr-platform/src/lib/incidentRouter.ts`
- `cgr-platform/src/storage/skillEvents.ts`
- `cgr-platform/src/workflows/ingestWorkflow.ts`
- `cgr-platform/migrations/0001_create_skill_events.sql`

---

## 5) Paradigmas documentados

Documentación complementaria en `docs/skillgen/`:

- Paradigma A (producto aislado): `docs/skillgen/10_paradigma_a_proyecto_aislado.md`
- Paradigma B (proyecto como caso de uso): `docs/skillgen/20_paradigma_b_caso_uso_dictamenes_ai.md`
- Paradigmas C/D/E: `docs/skillgen/30_tres_paradigmas_adicionales.md`

---

## 6) Plan de paso a producción

Plan operativo y de commit en:

- `docs/skillgen/40_plan_paso_produccion_y_commit.md`

Incluye:

- checklist preproducción
- despliegue canario
- rollback
- estrategia de commit/push en GitHub

---

## 7) Maduración de Etapa 2 + Iteración 1 propuesta

Detalle en:

- `docs/skillgen/50_etapa2_iteracion1.md`

Resumen de la Iteración 1:

1. catálogo de skills con metadata
2. ejecutor seguro (`diagnostic_only`)
3. evidencia de ejecución en `skill_runs`
4. 3 skills iniciales de alto impacto
5. pruebas de contrato y regresión

---

## 8) Higiene documental y aislamiento de material histórico

Guía en:

- `docs/skillgen/60_higiene_documental_y_sandbox.md`

Material histórico de Etapa 1 movido a:

- `docs/historico/etapa1_insumos_ai/`

---

## 9) Definición de éxito para el siguiente ciclo

Etapa 2 Iteración 1 se considera cerrada cuando:

- existe `catalog.json` de skills vigente
- `skillExecutor` ejecuta skills seguras y auditables
- `skill_runs` registra cada ejecución
- 3 skills iniciales están en producción controlada
- hay runbook y tablero mínimo de observabilidad
