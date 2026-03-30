# Placeholder MCP Layer

## Propósito

Esta carpeta reserva el espacio para la integración progresiva de MCP servers dentro del repositorio.

## Cómo se conectarán MCP servers

La integración prevista es por capas:

1. un skill identifica la necesidad de usar una tool;
2. el skill invoca un adaptador local;
3. el adaptador resuelve si la tool es local o remota;
4. si es remota, se conecta a un MCP server;
5. la respuesta vuelve al skill en una forma estable y auditable.

## Cómo se mapearán a tools

La recomendación es mapear cada MCP server a un conjunto pequeño de tools explícitas.

Ejemplos de familias futuras:

- `repo.read`
- `repo.search`
- `docs.lookup`
- `cloudflare.observe`
- `cloudflare.deploy`
- `d1.query_readonly`

## Regla de diseño

No se debe conectar un MCP server directamente al router global. Primero debe existir:

- un contrato de tool;
- una política de permisos;
- al menos un skill consumidor;
- documentación de efectos esperados.

## Estrategia incremental

Orden recomendado:

1. MCPs de solo lectura;
2. MCPs de observabilidad;
3. MCPs con efectos controlados;
4. automatización más amplia solo después de trazabilidad suficiente.

## Estado actual

En esta fase no se instala ni configura ningún MCP server. Solo se define el punto de extensión.
