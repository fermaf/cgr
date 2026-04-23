---
name: repo-context-scan
description: Escanea la estructura del repositorio para entender el estado actual del proyecto antes de proponer cambios
---

## Qué hago

Inspecciono el repositorio para detectar:
- Presencia de cgr-platform
- Skills heredadas del sistema anterior (catalog.json)
- Workflows disponibles en el backend
- Routers legacy (incidentRouter, skillRouter)
- Riesgos de convergencia o inconsistencia

## Cuándo usarme

Antes de proponer cualquier cambio structural o tocar código core:
1. Cuando entras a una nueva sesión
2. Antes de diseñar cambios de arquitectura
3. Cuando necesitas entender qué skills/wrappers existen

## Criterios de salida

```json
{
  "repoRoot": "<ruta al repo>",
  "cgrPlatformPresent": true,
  "legacySkills": ["skill_a", "skill_b"],
  "legacySkillFiles": ["skill_a.ts", "skill_b.ts"],
  "workflows": ["workflowA.ts", "workflowB.ts"],
  "legacyRouters": ["src/lib/incidentRouter.ts"],
  "risks": ["array de riesgos detectados"]
}
```

**Nota:** El custom tool retorna JSON directo (sin envoltorio status/metadata/telemetry como el legacy).

## Cómo ejecutarme

Usa el custom tool `repo-context-scan` con:
- `includeCatalogEntries` (opcional): boolean - si false, legacySkills viene vacío

```
tool("repo-context-scan", { includeCatalogEntries: true })
```

**Legacy (deprecated):** `npm run agents:scan`