# Ejemplo de loop cognitivo

## Objetivo

Este documento describe el ciclo mínimo esperado para un agente simple dentro del repositorio.

## Loop base

### 1. Observe

El agente recibe una señal:

- un incidente;
- una orden del operador;
- un evento del sistema;
- un lote de trabajo pendiente.

### 2. Decide

El agente normaliza la entrada y consulta el router:

- identifica intención o tipo de evento;
- selecciona un `skillName`;
- valida el contrato de entrada.

### 3. Act

El skill ejecuta una acción acotada:

- inspeccionar estado;
- validar estructura;
- consultar contexto;
- invocar una tool local;
- en el futuro, consumir una tool remota vía MCP.

### 4. Store memory

El agente registra en memoria:

- timestamp;
- tipo de evento;
- skill utilizada;
- resultado resumido;
- errores si existieron.

## Pseudoflujo

```ts
const event = observe();
const skillName = routeSkill(event);
const result = await runSkill(skillName, event);
storeEvent({
  type: 'skill_execution',
  skillName,
  result
});
```

## Relación con Cloudflare Workers

En integración futura, este loop puede vivir en tres modos:

- dentro de una ruta HTTP del Worker;
- dentro de un Workflow de Cloudflare;
- dentro de una herramienta local de desarrollo para Codex CLI o Antigravity IDE.

## Regla operativa

El loop cognitivo no debe reemplazar todavía los workflows productivos existentes. Debe rodearlos o invocarlos de forma incremental.
