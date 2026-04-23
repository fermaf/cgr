---
name: codigo_acotado
description: Skill para implementacióndelegada de cambios acotados y bien definidos
---

## Propósito

Guiar al ejecutor de código en cambios mecánicos, acotados y con disciplina de repo. No es para diseño ni arquitectura — eso lo decide el orquestador.

## Cuándo usarla

Cuando el orquestador (`build`) haya:
1. Diagnosticado el problema
2. Decidido el alcance del cambio
3. Delineado los archivos a tocar
4. Establecido criterios de aceptación

El ejecutor recibe una tarea delimitada y la implementa sin desviarse.

## Entradas esperadas

```json
{
  "tarea": "string - descripción corta de qué hacer",
  "archivos": ["array - paths específicos a modificar"],
  "criterios": ["array - condiciones que deben cumplirse"],
  "constraints": ["array - qué NO hacer o qué evitar"]
}
```

## Pasos operativos

1. **Recibir tarea** - Leer exactamente qué pide el orquestador
2. **Verificar alcance** - Confirmar que la tarea es acotada (max 3-5 archivos)
3. **Leer contexto** - Inspeccionar los archivos involucrados antes de tocar
4. **Implementar** - Hacer los cambios exactamente como se pidió
5. **Verificar compilacion** - `npm run build` o equivalent
6. **Reportar** - Output literal del resultado, sin interpretar

## Criterios de salida

- Código compila sin errores
- Cambios dentro del alcance delimitado
- Sin efectos secundarios en archivos no mencionados
- Output literal del build/test

## Cuándo escalar al orquestador

- La tarea no está acotada (requiere diseño)
- Hay dependencias no anticipadas
- El cambio требует arquitectura decisions
- Algo falla y no es por implementación

## Restricciones del ejecutor

**PUEDE:**
- Editar archivos dentro del alcance dado
- Ejecutar comandos de build/test
- Hacer queries de solo lectura a D1
- Reportar output literal

**NO PUEDE:**
- Proponer refactors no solicitados
- Modificar archivos fuera del alcance
- Decidir si el cambio es buena idea
- Cerrar la tarea por sí mismo