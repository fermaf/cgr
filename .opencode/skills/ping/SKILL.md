---
name: ping
description: Skill mínima de conectividad para verificar que el loop base del agente funciona
---

## Qué hago

Retorno un pong básico con el repoRoot y un mensaje de confirmación. Es la verificación más simple del sistema.

## Cuándo usarme

- Para verificar que el sistema de skills está funcionando
- Como primer test después de cambios en el runtime
- Para confirmar que el agente tiene acceso al repositorio

## Criterios de salida

```json
{
  "pong": true,
  "message": "<input.message o 'pong'>",
  "repoRoot": "<ruta al repo>"
}
```

## Cómo ejecutarme

Usa el custom tool `ping` con:
- `message` (opcional): mensaje a retornar

```
tool("ping", { message: "test" })
```

**Legacy (deprecated):** `npm run agents:test`