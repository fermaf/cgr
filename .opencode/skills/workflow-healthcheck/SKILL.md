---
name: workflow-healthcheck
description: Valida el estado de los workflows del backend antes de un deploy
---

## Qué hago

Ejecuto un healthcheck sobre los workflows del sistema para verificar que todo está en orden antes de proceder con un deploy o cambio significativo. Valida:
- Coherencia entre wrangler.jsonc y archivos físicos en src/workflows/
- Exportaciones en src/index.ts
- Bindings declarados (workflows, D1, KV, queues)

## Cuándo usarme

- Antes de ejecutar `npm run deploy`
- Cuando hay sospecha de que los workflows están fallando
- Como paso de validación del pipeline de producción

## Criterios de salida

```json
{
  "configPath": "<ruta a wrangler.jsonc>",
  "wranglerConfigParsed": true,
  "parseError": null,
  "configuredWorkflows": [
    {
      "name": "nombre-del-workflow",
      "binding": "BINDING_NAME",
      "className": "ClassName",
      "filePresent": true,
      "exportedFromIndex": true
    }
  ],
  "detectedWorkflowFiles": ["archivo.ts"],
  "visibleBindings": {
    "workflowBindings": ["WORKFLOW", "ENRICHMENT_WORKFLOW"],
    "d1Bindings": ["DB"],
    "kvBindings": ["DICTAMENES_SOURCE"],
    "queueProducerBindings": ["REPAIR_QUEUE"]
  },
  "risks": ["array de riesgos"],
  "notes": ["array de notas"]
}
```

**Nota:** El custom tool retorna JSON directo. No incluye veredicto proceed/block; el agente debe interpretar `risks` y `notes` para decidir.

## Cómo ejecutarme

Usa el custom tool `workflow-healthcheck`:

```
tool("workflow-healthcheck", {})
```

**Legacy (deprecated):** `npm run agents:workflow:check`