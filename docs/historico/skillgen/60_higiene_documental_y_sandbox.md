# Higiene Documental y Aislamiento de Basurilla Local

## Objetivo

Separar documentación vigente de material histórico/scratch, sin pérdida de información.

## Acciones aplicadas en docs

- Se creó `docs/historico/etapa1_insumos_ai/`
- Se movieron insumos de brainstorming y prompts de Etapa 1:
  - `31 finalStepStage01Qwen.md`
  - `32 finalStepStage01DeepSeek.md`
  - `33 finalStepStage01Grok.md`
  - `41 promptQwen2Codex.md`
  - `42 promptDeepSeek2Codex.md`
  - `43 promptGrokCodex.md`
  - `99_briefing_agente_experto.md`
- Se creó `docs/skillgen/` para documentación vigente de producto.

## Política de clasificación de archivos

- Vigente: normas, arquitectura, runbooks, roadmap aprobado.
- Histórico: propuestas, prompts, borradores y auditorías puntuales.
- Sandbox local: archivos de prueba con TTL y dueño explícito.

## Lineamientos para "basurilla" de pruebas locales

- Nunca borrar sin trazabilidad: primero mover a carpeta histórica/sandbox.
- Nombrar con fecha y propósito: `sandbox/YYYY-MM-DD_descripcion.ext`.
- Definir TTL:
  - 14 días para dumps temporales
  - 30 días para artefactos de validación técnica
- Revisar y purgar en cada cierre de iteración.

## Checklist de limpieza por iteración

1. Identificar archivos no referenciados en docs oficiales.
2. Mover a `historico/` o `sandbox/` (no eliminar directo).
3. Registrar motivo de movimiento en el PR.
4. Validar que ninguna ruta activa quedó rota.
