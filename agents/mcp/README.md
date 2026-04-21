# Capa MCP del proyecto

## Propósito

Esta carpeta documenta la integración de MCPs usados por Codex dentro del repo.

La configuración efectiva del cliente vive en:

- `.codex/config.toml` para el proyecto;
- `~/.codex/config.toml` como configuración global del operador.

## Stitch MCP

Stitch queda configurado como MCP global de Codex, no como secreto versionado del repo.

Configuración efectiva:

- archivo: `~/.codex/config.toml`
- endpoint: `https://stitch.googleapis.com/mcp`
- autenticación: header `X-Goog-Api-Key`

## Flujo de uso recomendado

1. abrir una sesión nueva de Codex;
2. verificar el MCP `stitch`;
3. usar Stitch para maquetas UX responsivas cuando el trabajo lo justifique.

## Regla de diseño

Los MCPs se agregan solo cuando:

- resuelven un cuello de botella real del core;
- no empujan lógica de negocio fuera del sistema;
- y su uso queda documentado en español.
