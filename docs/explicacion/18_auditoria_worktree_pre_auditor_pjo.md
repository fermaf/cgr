# Auditoría del worktree antes del auditor PJO

Fecha: 2026-04-11

## 1. Diagnóstico breve

El worktree estaba demasiado ruidoso para seguir agregando el auditor offline PJO sin riesgo de mezclar trabajo real con residuos de iteraciones anteriores.

Se detectaron cuatro grupos:

1. cambios funcionales ligados a PJO, regímenes jurisprudenciales y búsqueda;
2. cambios frontend de experiencia jurisprudencial;
3. archivos generados o salidas locales de pruebas;
4. trabajo lateral no claramente relacionado con el eje PJO.

No se borró ni se revirtió ningún archivo.

## 2. Corrección no destructiva aplicada

Se actualizó el `.gitignore` raíz para:

- dejar de ignorar los propios archivos `.gitignore`;
- ignorar artefactos generados por compilación accidental dentro de `cgr-platform/src/**/*.js`;
- ignorar salidas locales de exploración:
  - `cgr-platform/benchmark_report.md`;
  - `cgr-platform/kv_keys.json`;
  - `cgr-platform/mistral_outputs.json`;
  - `cgr-platform/model_outputs.json`;
  - `trajectorySummaries_backup.txt`.

Esto no elimina archivos: solo evita que contaminen el estado de Git.

## 3. Ruido confirmado

Había 58 archivos `.js` bajo `cgr-platform/src`.

Todos tenían contraparte `.ts`, por lo que se consideran artefactos de compilación in-place y no deberían versionarse dentro de `src`.

Ejemplos:

- `cgr-platform/src/index.js`;
- `cgr-platform/src/lib/doctrineLines.js`;
- `cgr-platform/src/lib/regimenDiscovery.js`;
- `cgr-platform/src/workflows/enrichmentWorkflow.js`.

## 4. Archivos que probablemente sí pertenecen al avance PJO

Backend:

- `cgr-platform/src/index.ts`;
- `cgr-platform/src/lib/doctrineLines.ts`;
- `cgr-platform/src/lib/doctrineMatterStatus.ts`;
- `cgr-platform/src/lib/queryUnderstanding/queryMode.ts`;
- `cgr-platform/src/lib/queryUnderstanding/queryIntent.ts`;
- `cgr-platform/src/lib/queryUnderstanding/queryRewrite.ts`;
- `cgr-platform/src/lib/doctrineClusters.ts`;
- `cgr-platform/src/lib/doctrineGuided.ts`.

Frontend:

- `frontend/src/types.ts`;
- `frontend/src/lib/doctrineInsights.ts`;
- `frontend/src/lib/queryNormalization.ts`;
- `frontend/src/components/dictamen/DictamenCard.tsx`;
- `frontend/src/components/doctrine/PjoHeroSolution.tsx`;
- `frontend/src/components/doctrine/PjoFeaturedSolution.tsx`;
- `frontend/src/components/doctrine/PjoBentoGrid.tsx`;
- `frontend/src/pages/Home.tsx`;
- `frontend/src/pages/RegimenView.tsx`;
- `frontend/src/pages/SearchResults.tsx`;
- `frontend/src/pages/DictamenDetail.tsx`.

Documentación/contexto:

- `context/current_priorities.md`;
- `docs/explicacion/17_plan_avance_paradigma_jurisprudencial_pjo.md`;
- `docs/explicacion/18_auditoria_worktree_pre_auditor_pjo.md`;
- `.gitignore`;
- `cgr-platform/.gitignore`;
- `frontend/.gitignore`.

## 5. Archivos que requieren decisión antes de versionar

Posible trabajo lateral o experimental:

- `agents/mcp/README.md`;
- `cgr-platform/src/clients/mistral.ts`;
- `frontend/src/components/layout/Sidebar.tsx`;
- `frontend/src/lib/doctrineLanguage.ts`;
- `frontend/src/components/doctrine/DoctrineReadingWorkspace.tsx`;
- `frontend/src/pages/AdminDashboard.tsx`;
- `frontend/src/index.css`;
- `frontend/src/components/admin/BoletinesManager.tsx`;
- `frontend/src/hooks/useBoletines.ts`;
- `cgr-platform/src/lib/boletinEngine.ts`;
- `cgr-platform/src/workflows/boletinMultimediaWorkflow.ts`;
- `cgr-platform/migrations/0007_create_boletines_multimedia.sql`;
- `cgr-platform/migrations/0008_expand_boletines_campaign_audit.sql`.

Scripts sueltos o herramientas de exploración:

- `cgr-platform/list_models.js`;
- `cgr-platform/scripts/benchmark_llms.ts`;
- `cgr-platform/scripts/test_mistral_keys.ts`;
- `cgr-platform/scripts/*.js`;
- `cgr-platform/test_*.js`;
- `cgr-platform/verify_*.js`;
- `scripts/test_mistral_keys.ts`;
- `scripts/test_boletin_internal.ts`;
- `rebuild_conversations.py`;
- `scripts/codex_with_env.sh`.

Estos archivos pueden ser útiles, pero no deberían mezclarse en el mismo bloque estable del PJO sin revisión.

## 6. Problemas técnicos corregidos

`git diff --check` reportaba trailing whitespace en archivos modificados, principalmente:

- `cgr-platform/src/index.ts`;
- `cgr-platform/src/lib/doctrineLines.ts`;
- `frontend/src/index.css`;
- `frontend/src/pages/AdminDashboard.tsx`;
- `frontend/src/pages/Home.tsx`;
- `frontend/src/pages/RegimenView.tsx`.

Se corrigió de forma mecánica el trailing whitespace en esos archivos, sin cambiar lógica.

## 7. Recomendación operativa

Antes de implementar el auditor offline PJO:

1. formar un bloque estable PJO con backend, frontend y documentación estrictamente necesarios;
2. excluir o revisar por separado boletines, benchmarks, scripts sueltos y prototipos;
3. corregir trailing whitespace en el bloque que se vaya a conservar;
4. ejecutar build frontend y dry-run backend;
5. recién después agregar el auditor offline PJO como un cambio nuevo y fácil de revisar.

La prioridad no es dejar el repositorio perfecto. La prioridad es recuperar trazabilidad para que el siguiente avance sea auditable.
