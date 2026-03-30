# Base de agentes en CGR.ai

## Propósito

Esta carpeta documenta la convención mínima para incorporar agentes al repositorio sin acoplar prematuramente la lógica cognitiva al backend productivo.

## Qué es un skill

Un skill es una unidad pequeña de capacidad ejecutable.

Debe cumplir estas reglas:

- tener un nombre estable;
- describir claramente qué hace;
- declarar el contrato de entrada;
- declarar el contrato esperado de salida;
- encapsular una acción concreta y auditable.

En esta base, los skills viven en `agents/skills/`.

## Qué es un MCP

MCP significa Model Context Protocol.

En esta arquitectura, un MCP server será una capa para exponer tools y contexto a un agente de forma controlada. No se usa todavía en producción dentro del repositorio, pero se deja preparado el espacio para:

- tools locales del repositorio;
- tools remotas;
- lectura de contexto documental;
- operaciones seguras sobre infraestructura o datos.

La documentación inicial del placeholder vive en `agents/mcp/README.md`.

## Cómo interactúan skills y MCP

La interacción prevista es:

1. el agente observa una necesidad;
2. el router selecciona un skill;
3. el skill decide si necesita tools;
4. las tools podrán venir de implementaciones locales o de un MCP server;
5. el resultado vuelve al loop del agente;
6. la memoria registra el evento relevante.

En términos prácticos:

- `router` decide qué capacidad activar;
- `skills` contienen la lógica de alto nivel;
- `mcp` provee herramientas o contexto;
- `memory` conserva el historial reciente;
- `schemas` asegura contratos explícitos.

## Cómo agregar un nuevo skill

Pasos mínimos:

1. crear un archivo en `agents/skills/`;
2. exportar un objeto `skill`;
3. definir `name`, `description`, `inputSchema` y `execute(context, input)`;
4. mantener el retorno con `status`, `data` y `metadata`;
5. si el skill madura, agregar también `output_schema`.

## Runtime operativo mínimo

El runtime operativo actual agrega:

- `agents/types/skill.ts`: contrato formal de skill;
- `agents/skills/index.ts`: registry central con detección de colisiones;
- `agents/runner/skillRunner.ts`: loop ejecutable con routing, contexto, telemetría y memoria;
- `agents/skills/skill_repo_context_scan.ts`: skill arqueóloga para detectar convergencia con `cgr-platform`;
- `agents/skills/wrappers/`: convención para adaptar capacidades heredadas sin duplicarlas.

## Convergencia con cgr-platform

La regla operativa es:

- `agents/` puede leer e inspeccionar `cgr-platform/`;
- `agents/` no modifica internamente `cgr-platform/`;
- si una capacidad heredada ya existe, se envuelve desde `agents/skills/wrappers/`;
- si existe colisión de nombre, el registry falla temprano y obliga a renombrar o envolver con criterio explícito.

## Cómo agregar un nuevo MCP server más adelante

Pasos recomendados:

1. documentar su objetivo en `agents/mcp/`;
2. definir qué tools expondrá;
3. especificar si es de solo lectura o con efectos;
4. mapearlo a skills concretos antes de integrarlo al router;
5. introducirlo gradualmente, empezando por casos diagnósticos.

## Criterio de diseño

La regla principal es mantener separación explícita:

- `cognition`: decisión y selección de capacidad;
- `tools`: operaciones concretas;
- `infra`: Cloudflare Workers, D1, KV, despliegue;
- `workflows`: ejecución duradera y resiliente.

Esta carpeta es el bootstrap de esa separación.
