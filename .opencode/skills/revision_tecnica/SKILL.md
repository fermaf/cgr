---
name: revision_tecnica
description: Skill para revisión técnica de diffs - detecta regresiones, inconsistencias y deuda accidental
---

## Propósito

Inspeccionar cambios de código (diff) con ojos de auditor: detectar riesgos sin modificar nada. El revisor no implementa — solo identifica problemas y los reporta.

## Cuándo usarla

Después de que `codigo_acotado` completó una implementación y antes de pasar a validación funcional.

## Entradas esperadas

```json
{
  "cambios": "git diff o lista de archivos modificados",
  "contexto": "breve descripción del cambio intended",
  "area": "backend | frontend | agents | config"
}
```

## Pasos operativos

1. **Obtener diff** - `git diff` o leer archivos modificados
2. **Leer contexto** - ¿Qué se suponía que debía hacer este cambio?
3. **Auditar por capas:**
   - **Seguridad**: ¿se exponen secrets, APIs, credentials?
   - **Calidad**: ¿hay deuda técnica, duplicación, inconsistencias?
   - **Performance**: ¿hay queries N+1, operaciones costosas sin cache?
   - **Arquitectura**: ¿se respeta la estructura del proyecto?
   - **Integración**: ¿los cambios son consistentes con el resto del codebase?
4. **Reportar hallazgos** - Cada riesgo con evidencia (file:line)
5. **Veredicto**: APROBADO / REQUIERE CAMBIOS / BLOQUEANTE

## Criterios de salida

```json
{
  "veredicto": "APROBADO | REQUIERE_CAMBIOS | BLOQUEANTE",
  "hallazgos": [
    {
      "tipo": "seguridad | calidad | performance | arquitectura | integracion",
      "descripcion": "qué se encontró",
      "evidencia": "file:line o comando que lo detecta",
      "severidad": "alta | media | baja"
    }
  ],
  "resumen": "una línea de veredicto"
}
```

## Cuándo escalar al orquestador

- Hay un hallazgo BLOQUEANTE
- La consistencia arquitectónica está en duda
- Se detectaron posibles regresiones funcionales
- El cambio altera la estructura del proyecto

## Restricciones del revisor

**PUEDE:**
- Leer cualquier archivo del repo
- Ejecutar comandos de solo lectura (git diff, grep, glob)
- Ejecutar npm run agents:* para audits
- Proponer categorías de riesgo

**NO PUEDE:**
- Editar o modificar archivos
- Hacer cambios automáticos
- Decidir qué hacer con los hallazgos
- Cerrar la revisión por sí mismo