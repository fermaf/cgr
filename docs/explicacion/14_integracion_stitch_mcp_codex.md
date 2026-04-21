# Integración de Stitch MCP en Codex

## Objetivo

Dejar preparado el proyecto para que Codex pueda usar Stitch como MCP remoto al trabajar maquetas UX responsivas para Indubia.

## Decisión de integración

La integración operativa se deja a nivel global de Codex en:

- `~/.codex/config.toml`

La razón es práctica:

- otros MCPs del operador ya viven ahí;
- Stitch requiere un secreto que no debe quedar versionado en el repo;
- y Codex resuelve mejor ese caso cuando el transporte nace desde la configuración global.

## Configuración aplicada

Se agregó un MCP remoto `stitch` con:

- URL: `https://stitch.googleapis.com/mcp`
- autenticación por header `X-Goog-Api-Key`

Validación técnica realizada:

- `GET /mcp` responde `405 Method Not Allowed`, lo que confirma que el endpoint existe pero no admite GET;
- una inicialización MCP real por `POST` con la API key respondió `200 OK`.

## Uso local

1. abrir una sesión nueva de Codex;
2. pedir una llamada simple a Stitch, por ejemplo `list_projects`.

## Limitación importante

La sesión actual de Codex no rehidrata automáticamente transportes MCP ya creados.

Por eso, después de cambiar `~/.codex/config.toml`, hay que abrir una sesión nueva de Codex para que Stitch quede disponible con la configuración correcta.

## Alcance

Esta integración habilita generación y exploración de maquetas UX con Stitch, pero no reemplaza el trabajo de producto:

- la UX final debe seguir respondiendo al modelo doctrinal del sistema;
- Stitch sirve para iterar interfaz y layout;
- el criterio jurídico y la navegación visible siguen viviendo en `frontend/` y `cgr-platform/`.
