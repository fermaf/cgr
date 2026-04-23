---
name: auditoria_trazabilidad
description: Skill para registrar trazabilidad de decisiones y cambios - genera actas breves de cierre
---

## Propósito

Documentar qué se hizo, por qué, y qué quedó pendiente. Cerrar el ciclo con una traza auditable de cada cambio.

## Cuándo usarla

Al final de cada ciclo de cambio, después de que `release_deploy` decidió. Es el paso de cierre del flujo:

```
diagnóstico → implementación → revisión → validación → release → CIERRE
```

## Entradas esperadas

```json
{
  "ciclo": {
    "inicio": "timestamp o fecha",
    "objetivo": "qué se quería lograr",
    "alcance": "qué se incluyó explícitamente",
    "excluido": "qué se excluyó explícitamente"
  },
  "ejecucion": {
    "implementacion": "quién la hizo + output",
    "revision_tecnica": "veredicto + hallazgos",
    "validacion_funcional": "veredicto + checks",
    "release": "decisiones de commit/deploy"
  },
  "resultado": {
    "commit": "sí | no | no aplica",
    "deploy": "sí | no | no aplica",
    "artifact": "referencia al commit/branch si aplicó"
  },
  "pendientes": ["array - cosas que quedaron abiertas"]
}
```

## Pasos operativos

1. **Reunir outputs** de cada etapa de la cadena
2. **Verificar completitud** - ¿todas las etapas tienen output?
3. **Identificar pendientes** - ¿qué quedó sin resolver?
4. **Generar acta** - documento breve de cierre
5. **Registrar en contexto** si corresponde actualizar `context/`

## Formato del acta de cierre

```markdown
## Acta de Cierre - [fecha]

### Objetivo
[qué se quería lograr]

### Alcance
- Incluido: [lista]
- Excluido: [lista]

### Ejecución
| Etapa | Responsable | Resultado |
|---|---|---|
| Implementación | code-executor/self | [APROBADO/FALLÓ] |
| Revisión técnica | technical-auditor | [APROBADO/REQUIERE_CAMBIOS/BLOQUEANTE] |
| Validación funcional | functional-verifier | [LISTO/NO_LISTO] |
| Release | release-manager | [APROBADO/RECHAZADO] |

### Resultado
- Commit: [sí/no] - [hash si aplicó]
- Deploy: [sí/no] - [URL si aplicó]

### Pendientes
- [lista de issues abiertos o técnicas a resolver]

### Lección aprendida (opcional)
[si hay algo notable para el próximo ciclo similar]
```

## Criterios de salida

- Acta de cierre generada en formato markdown
- Actualización de `context/current_priorities.md` si correspondió
- Proximos pasos claros para el orquestador

## Cuándo escalar al orquestador

- Hay pendientes que requieren decisión de arquitectura
- El ciclo reveló un problema sistémico
- Se requiere actualizar documentación canónica

## Restricciones del auditor

**PUEDE:**
- Leer archivos de output de las etapas
- Escribir archivos de documentación en `context/` o `docs/`
- Actualizar `current_priorities.md` si hay cambios de prioridades

**NO PUEDE:**
- Modificar código fuente
- Decidir el destino de los pendientes por sí mismo
- Cerrar el proceso si hay bloqueantes sin resolver