# Paradigma A: Skillgen como Proyecto Aislado del Caso de Uso

## Objetivo

Diseñar Skillgen como un producto técnico reusable, sin acoplarlo a CGR ni a dictámenes.

## Definición

Skillgen se modela como "runtime de incidentes":

- entrada: errores/eventos técnicos normalizados
- decisión: ruteo determinista a skills
- salida: evidencia persistida + ejecución de skill controlada

## Contratos mínimos estables

- `Incident`: contrato universal y versionado
- `RouteDecision`: decisión explicable y auditable
- `SkillEvent`: evento persistido inmutable

## Criterios de diseño

- Portabilidad: sin dependencias de dominio dentro del core
- Determinismo: reglas por `incident.code`, no por texto libre
- Auditabilidad: toda decisión queda trazada
- Seguridad: sanitización obligatoria del contexto
- Evolución segura: cambios por versión de reglas/skills

## Estructura recomendada (producto)

- `core/incident`
- `core/router`
- `core/executor`
- `storage/events`
- `skills/` (playbooks y handlers)
- `adapters/` (CGR, ERP, CRM, etc.)

## Qué se gana

- Reuso en múltiples verticales
- Menor deuda técnica por acoplamiento
- Más fácil monetización como plataforma

## Riesgos a controlar

- Over-engineering temprano
- "Abstracción sin cliente real"

## Regla práctica

Desarrollar "core genérico" solo cuando al menos 2 adaptadores reales lo necesiten.
