# Prioridades Actuales

## Plan rector

El plan vigente de avance está en:

- `docs/explicacion/17_plan_avance_paradigma_jurisprudencial_pjo.md`

Ese documento ordena el cambio de paradigma completo: auditoría, matriz de pruebas, backfill PJO, integración backend, integración frontend y operación continua.

## Prioridad 1

Auditar lo existente antes de seguir optimizando.

Estado actual:
- Base de datos D1 ya contiene la tabla puente `regimen_dictamenes` (396 filas) y `problemas_juridicos_operativos` (extracción completada con Gemini).
- Workflow de metadata e ingestión operativos.
- Se hizo una integración inicial de PJO/regímenes en `doctrine-search`.
- La primera auditoría offline quedó en `docs/explicacion/20_reporte_auditoria_pjo_regimenes.md`: detecta 20 regímenes, 20 PJOs, 396 membresías de régimen, 0 membresías explícitas en `pjo_dictamenes`, 15 casos útiles incompletos y 5 sospechosos.
- La matriz inicial de pruebas quedó en `docs/evaluation/jurisprudential_matrix.json`.
- El plan de backfill quedó en `docs/explicacion/22_plan_backfill_pjo.md`.
- El dry-run de backfill quedó en `docs/explicacion/23_backfill_pjo_dictamenes_dry_run.md`: propone 396 inserciones en `pjo_dictamenes`, cubre 20 PJOs y asigna 20 rectores.

Próximo paso inmediato:
- Decidir si persistir las 396 filas propuestas en `pjo_dictamenes`.
- Si se persisten, re-ejecutar la auditoría offline después del backfill.
- No promocionar como plenamente publicables los 5 casos sospechosos sin revisión jurídica o degradación explícita.
- **Migración LLM Completada**: Se ha migrado el 100% del flujo de enriquecimiento a Mistral (2512 para 2020+ e importantes, 2411 para el resto). Gemini queda deprecado para estas tareas.

## Prioridad 2

Integrar la capa PJO/regímenes en la experiencia visible solo cuando el estado de publicabilidad sea suficiente.

Esto incluye:
- mostrar la respuesta jurisprudencial principal cuando haya PJO validado;
- destacar el dictamen rector y la vigencia;
- degradar lo histórico o desplazado como antecedente;
- evitar que una familia amplia compita con un dictamen directo fuerte;
- mantener el lenguaje como jurisprudencia administrativa, no doctrina académica.

## Qué evitar

- staging completo artificial;
- metalenguaje excesivo en UI;
- pseudo-precisión jurídica;
- abrir cinco frentes a la vez;
- introducir arquitectura paralela innecesaria.

## Frente recientemente cerrado

El backfill canónico de derivativas quedó cerrado el `2026-04-21` con:

- etiquetas completas hasta `420648`;
- fuentes completas hasta `287495`;
- duplicados técnicos finales en `0`.

Ese frente ya no requiere nuevas campañas. El siguiente trabajo relacionado, si se abre, debe enfocarse en **cutover de lectura legacy -> canónico**, no en migración histórica.

## Auto-consolidación OpenCode (2026-04-23)

Ver `context/opencode-consolidation-fase2a.md` para el detalle completo.

**Estado:** Fase 2a completada.
- Custom Tools creados: `ping`, `repo-context-scan`, `workflow-healthcheck`
- Runtime legacy mantenido como fallback
- SKILL.md actualizados para referenciar tools

**Pendiente:**
- Decisión sobre migración completa o deprecación del runtime legacy
- Migración de `metadata-quality-audit` (requiere acceso D1)
