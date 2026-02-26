# Documentación CGR.ai

Este directorio separa documentación vigente, especializada de Skillgen y material histórico.

Fecha de actualización: 2026-02-26.

## Estructura

- `docs/` (raíz): documentos vigentes transversales
- `docs/skillgen/`: documentación vigente específica de Skillgen
- `docs/historico/`: insumos históricos y borradores conservados

## Ruta recomendada para nuevos integrantes

1. `docs/01_negocio_y_estrategia.md`
2. `docs/02_arquitectura.md`
3. `docs/03_guia_desarrollo.md`
4. `docs/04_operacion_y_mantenimiento.md`
5. `docs/27 Skillgen Blueprint cgr.md`
6. `docs/skillgen/README.md`

## Índice vigente (general)

- `docs/01_negocio_y_estrategia.md`
- `docs/02_arquitectura.md`
- `docs/03_guia_desarrollo.md`
- `docs/04_operacion_y_mantenimiento.md`
- `docs/05_manual_usuario.md`
- `docs/06_feedback_y_roadmap.md`
- `docs/07_auditoria_llaves_kv.md`
- `docs/08_ingenieria_inversa_api_cgr.md`
- `docs/09_guia_uso_avanzado_api_CGR.md`
- `docs/11_ToDo_servicio_frontend.md`
- `docs/27 Skillgen Blueprint cgr.md`

## Índice vigente (Skillgen)

- `docs/skillgen/README.md`
- `docs/skillgen/10_paradigma_a_proyecto_aislado.md`
- `docs/skillgen/20_paradigma_b_caso_uso_dictamenes_ai.md`
- `docs/skillgen/30_tres_paradigmas_adicionales.md`
- `docs/skillgen/40_plan_paso_produccion_y_commit.md`
- `docs/skillgen/50_etapa2_iteracion1.md`
- `docs/skillgen/60_higiene_documental_y_sandbox.md`

## Histórico (no operativo)

- `docs/historico/etapa1_insumos_ai/31 finalStepStage01Qwen.md`
- `docs/historico/etapa1_insumos_ai/32 finalStepStage01DeepSeek.md`
- `docs/historico/etapa1_insumos_ai/33 finalStepStage01Grok.md`
- `docs/historico/etapa1_insumos_ai/41 promptQwen2Codex.md`
- `docs/historico/etapa1_insumos_ai/42 promptDeepSeek2Codex.md`
- `docs/historico/etapa1_insumos_ai/43 promptGrokCodex.md`
- `docs/historico/etapa1_insumos_ai/99_briefing_agente_experto.md`

## Reglas de verdad

- Fuente primaria del comportamiento: `cgr-platform/src` y `frontend/src`.
- Si hay discrepancia entre docs y código, prevalece el código.
- Si hay discrepancia entre código y producción, prevalece producción.

## Regla de mantenimiento documental

- Todo cambio de arquitectura o runbook debe actualizar al menos:
  - `docs/03_guia_desarrollo.md`
  - `docs/04_operacion_y_mantenimiento.md`
  - `docs/27 Skillgen Blueprint cgr.md`
