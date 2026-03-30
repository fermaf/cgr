# Agentic Dev Tooling For Indubia

Este documento define qué tooling externo vale la pena para desarrollo, auditoría y mantenimiento de Indubia.

## Lo que sí vale la pena ya

### 1. Cloudflare MCP

Estado:

- recomendado inmediatamente;
- no como dependencia del producto;
- sí como herramienta de desarrollo.

Por qué:

- Indubia vive sobre Workers, D1, KV, Workflows y observabilidad;
- permite inspeccionar estado real sin seguir creando scripts ad hoc;
- es especialmente útil para validar doctrine-search, backfill, logs y bindings.

Uso concreto en Indubia:

- revisar D1 y Workers sin salir del flujo agentico;
- consultar observabilidad de staging/producción;
- revisar deployments, secrets y bindings;
- comparar comportamiento real antes y después de cambios del core.

Referencia oficial:

- https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/

Nota:

- en este entorno de Codex ya existe acceso operativo a tooling de Cloudflare, así que no hace falta “instalarlo” otra vez dentro del repo.

### 2. Chrome DevTools MCP

Estado:

- recomendado inmediatamente para frontend;
- no toca infraestructura productiva;
- aporta valor directo al producto visible.

Uso concreto en Indubia:

- validar flows reales del frontend después de cambios fuertes;
- revisar navegación doctrinal, loading states y errores de consola;
- capturar screenshots y traces;
- evitar regressions visuales cuando el producto dé saltos más visibles.

Configuración útil para Codex:

```bash
codex mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
```

Referencia oficial:

- https://github.com/ChromeDevTools/chrome-devtools-mcp

### 3. GitHub MCP

Estado:

- recomendado, pero no conviene dejarlo hardcodeado en el repo;
- depende de OAuth/PAT, políticas y permisos del usuario.

Uso concreto en Indubia:

- convertir hallazgos agenticos en issues reales;
- revisar PRs largos con más contexto;
- dejar backlog accionable sin copiar y pegar manualmente;
- conectar auditoría técnica con trabajo real del equipo.

Referencia oficial:

- https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/use-the-github-mcp-server

Decisión práctica:

- sí usarlo;
- no commitear configuración activa en este repo.

### 4. Pinecone MCP

Estado:

- útil, pero secundario frente a Cloudflare y DevTools;
- usarlo para diagnóstico y docs, no como canal principal de escritura.

Uso concreto en Indubia:

- revisar stats de índices y namespaces;
- consultar docs oficiales desde el agente;
- probar búsquedas y revisar configuración de índices con integrated embedding.

Límite importante:

- Pinecone documenta que su MCP soporta solo índices con integrated embedding.

Referencia oficial:

- https://docs.pinecone.io/guides/operations/mcp-server

Decisión práctica:

- sí conviene como apoyo para retrieval y Pinecone diagnostics;
- no es el siguiente tooling más importante.

## Orden recomendado

1. Cloudflare MCP
2. Chrome DevTools MCP
3. GitHub MCP
4. Pinecone MCP

## Regla operativa

- usar MCPs para investigar, validar y operar mejor;
- no convertirlos en dependencia del runtime productivo;
- no sustituir el core por tooling de agente;
- preferir pocas herramientas con uso claro sobre un stack inflado.
