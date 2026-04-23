---
name: validacion_funcional
description: Skill para validación operativa - smoke tests, checks de endpoints y validaciones end-to-end acotadas
---

## Propósito

Verificar que el código no solo compila sino que funciona. Ejecutar pruebas funcionales acotadas para confirmar que el cambio hace lo que debe hacer.

## Cuándo usarla

Después de que `revision_tecnica` dio APROBADO. La cadena es:

```
implementación → revisión técnica → validación funcional → decisión de release
```

## Entradas esperadas

```json
{
  "tipo": "backend | frontend | agents | config",
  "cambios": "breve descripción de qué se cambió",
  "criterios_funcionales": ["array - qué debe funcionar"],
  "entorno": "local | staging | production"
}
```

## Pasos operativos

### Para backend (cgr-platform)

1. **Build check** - `cd cgr-platform && npm run build`
2. **Type check** - `cd cgr-platform && npm run typecheck` (si existe)
3. **Lint check** - `cd cgr-platform && npm run lint` (si existe)
4. **D1 sanity** - `cd cgr-platform && npm run d1:sanity`
5. **Smoke test** - `cd cgr-platform && npm run dev` (iniciar y verificar que responde)

### Para frontend

1. **Build check** - `cd frontend && npm run build`
2. **Dev server** - verificar que inicia sin errores

### Para agents

1. **Structure check** - `npm run agents:check`
2. **Ping test** - `npm run agents:test`

## Criterios de salida

```json
{
  "pasados": ["array - checks que pasaron"],
  "fallidos": [
    {
      "check": "nombre del check",
      "error": "mensaje de error literal",
      "bloqueante": true | false
    }
  ],
  "veredicto": "LISTO | NO_LISTO",
  "resumen": "una línea de estado"
}
```

## Cuándo escalar al orquestador

- Un check falla de forma inesperada
- El error no es claro o es ambiguo
- Se requiere decisión sobre si un fallo es bloqueante
- La validación funcional expone un problema de diseño

## Restricciones del validador

**PUEDE:**
- Ejecutar comandos de build, test, lint, typecheck
- Hacer queries a D1 local
- Iniciar servicios temporalmente para verificar
- Reportar output literal

**NO PUEDE:**
- Modificar código para "arreglar" un test que falla
- Redefinir el alcance del cambio
- Decidir que un fallo es aceptable sin consultar
- Cerrar la validación por sí mismo