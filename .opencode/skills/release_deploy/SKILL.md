---
name: release_deploy
description: Skill para decisión de commit y deploy - audita rama, verifica trazabilidad y aprueba liberación
---

## Propósito

Decidir si un cambio está listo para commit y deploy. Verifica que se cumplió la cadena completa y que hay trazabilidad suficiente.

## Cuándo usarla

Después de que `validacion_funcional` dio LISTO. Es el último gate antes de commit/push/deploy.

## Regla de push obligatorio

**TODO desarrollo con pruebas y validaciones exitosas DEBE hacer push a GitHub como paso automático.**

Esta es una regla del proyecto CGR3:
- Si `validacion_funcional` dio LISTO y no hay bloqueantes → SE AUTORIZA COMMIT + PUSH AUTOMÁTICO
- El deploy se hace después manualmente (`npm run deploy`)
- El mensaje de commit DEBE ser en español

## Entradas esperadas

```json
{
  "cambios": "git diff --stat o descripción de archivos",
  "cadena_completada": {
    "implementacion": "code-executor | self",
    "revision_tecnica": "technical-auditor - APROBADO/BLOQUEANTE",
    "validacion_funcional": "functional-verifier - LISTO/NO_LISTO"
  },
  "branch": "nombre de la rama",
  "tipo_cambio": "bugfix | feature | refactor | config | docs"
}
```

## Pasos operativos

### Verificación de cadena

1. Confirmar que existe output de cada etapa
2. Verificar que no hay hallazgos BLOQUEANTE sin resolver
3. Confirmar que la validación funcional pasó

### Verificación de repo

1. `git status` -干净的 working directory o cambios intencionados
2. `git log --oneline -5` - últimos commits para contexto
3. Rama tiene naming correcto (`feature/`, `bugfix/`, `config/`)

### Decisión de commit

- Si cadena completa + sin bloqueantes + repo limpio → DECIDIR COMMIT
- Si cadena incompleta → SOLICITAR COMPLETAR
- Si bloqueantes sin resolver → RECHAZAR

### Decisión de deploy

Evaluar:
1. ¿El cambio impacta producción (backend/workers)?
2. ¿Hay workflow que valide el deploy?
3. ¿Passó `npm run agents:workflow:check`?
4. ¿El repo está limpo para push?

## Criterios de salida

```json
{
  "veredicto_commit": "APROBAR | RECHAZAR | SOLICITAR_COMPLETAR",
  "veredicto_deploy": "APROBAR | RECHAZAR | NO_APLICA",
  "razones": ["array - explicación de cada decisión"],
  " proximo_paso": "qué hacer ahora",
  "traza": "referencia a los outputs de cada etapa"
}
```

## Cuándo escalar al orquestador

- Hay conflicto entre las decisiones de las etapas
- El tipo de cambio requiere decisión humana (ej. breaking changes)
- Se detectan riesgos de regresión en producción
- La decisión no es clara

## Restricciones del gestor de release

**PUEDE:**
- Ejecutar git status, log, diff --stat
- Ejecutar npm run agents:workflow:check
- Ejecutar npm run agents:check
- Decidir aprobar/rechazar commit/deploy
- Ejecutar `git push` automáticamente después de commit exitoso

**NO PUEDE:**
- Modificar archivos
- Forzar un deploy si hay bloqueantes
- Cerrar el proceso sin dar proximo paso claro

**NOTA:** Si el entorno del subagente no tiene permisos de red para `git push`, el orquestador DEBE hacer el push manualmente antes de cerrar el ciclo.