# Tres Paradigmas Adicionales y Lineamientos

## Paradigma C: Skillgen como Plataforma Interna de Confiabilidad

### Cuándo aplicar

Organizaciones con varios workers/pipelines que comparten problemas operativos.

### Lineamientos

- Estandarizar contrato `Incident` para todos los servicios
- Definir catálogo único de códigos de incidente
- Crear librería común de skills de diagnóstico
- Dashboard único para incidentes cross-servicio
- Gobernanza: owner por skill y SLA de mantenimiento

## Paradigma D: Skillgen como SaaS Multi-tenant

### Cuándo aplicar

Producto para terceros (municipios, estudios jurídicos, organismos públicos).

### Lineamientos

- Aislamiento estricto por tenant (datos y claves)
- Enrutamiento por `tenant_id` + política de seguridad
- Plantillas de skills por vertical
- Facturación por volumen de incidentes/ejecuciones
- Feature flags por plan comercial

## Paradigma E: Skillgen como Capa de Cumplimiento y Auditoría

### Cuándo aplicar

Contextos regulados donde la trazabilidad es crítica.

### Lineamientos

- Inmutabilidad lógica de `skill_events`
- Evidencia exportable (D1 -> R2, firma hash)
- Política de retención por normativa
- Controles de acceso y segregación de funciones
- Reportes periódicos de cumplimiento (mensual/trimestral)

## Regla de selección entre paradigmas

- Si prima reuso técnico: Paradigma A o C
- Si prima valor directo en dictámenes: Paradigma B
- Si prima escala comercial: Paradigma D
- Si prima regulación y auditoría: Paradigma E
