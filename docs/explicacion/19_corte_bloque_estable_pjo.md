# Corte del bloque estable PJO

Fecha: 2026-04-11

## 1. Objetivo

Separar el avance PJO/jurisprudencial de los residuos del worktree antes de implementar el auditor offline.

Este documento no equivale a un commit. Es una lista operativa para decidir qué entra al bloque estable y qué debe quedar fuera o revisarse aparte.

## 2. Bloque estable recomendado

### Contexto y documentación

Incluir:

- `.gitignore`
- `context/current_priorities.md`
- `docs/explicacion/17_plan_avance_paradigma_jurisprudencial_pjo.md`
- `docs/explicacion/18_auditoria_worktree_pre_auditor_pjo.md`
- `docs/explicacion/19_corte_bloque_estable_pjo.md`

Motivo:

- fijan el plan rector;
- reducen ruido de artefactos generados;
- dejan trazabilidad del estado antes del auditor.

### Backend de búsqueda jurisprudencial

Incluir, sujeto a build:

- `cgr-platform/src/index.ts`
- `cgr-platform/src/lib/doctrineLines.ts`
- `cgr-platform/src/lib/doctrineMatterStatus.ts`
- `cgr-platform/src/lib/queryUnderstanding/queryMode.ts`
- `cgr-platform/src/lib/queryUnderstanding/queryIntent.ts`
- `cgr-platform/src/lib/queryUnderstanding/queryRewrite.ts`
- `cgr-platform/src/lib/doctrineClusters.ts`
- `cgr-platform/src/lib/doctrineGuided.ts`

Motivo:

- forman el núcleo de promoción PJO/regímenes en búsqueda;
- agregan reglas de foco directo, modo de consulta y control de líneas auxiliares;
- permiten distinguir entre dictamen directo, estado actual y línea jurisprudencial.

Riesgo:

- el diff es grande, especialmente `doctrineLines.ts`, `doctrineClusters.ts` y `queryIntent.ts`;
- antes de cerrar el bloque hay que compilar y validar consultas canónicas.

### Frontend PJO y experiencia jurisprudencial

Incluir, sujeto a build:

- `frontend/src/types.ts`
- `frontend/src/lib/doctrineInsights.ts`
- `frontend/src/lib/queryNormalization.ts`
- `frontend/src/components/dictamen/DictamenCard.tsx`
- `frontend/src/components/doctrine/PjoHeroSolution.tsx`
- `frontend/src/components/doctrine/PjoFeaturedSolution.tsx`
- `frontend/src/components/doctrine/PjoBentoGrid.tsx`
- `frontend/src/pages/Home.tsx`
- `frontend/src/pages/RegimenView.tsx`
- `frontend/src/pages/SearchResults.tsx`

Motivo:

- hacen visible el PJO/regimen cuando el backend lo devuelve;
- reducen lenguaje de “doctrina” cuando puede confundirse con doctrina académica;
- conectan tarjeta, home, búsqueda documental y vista de régimen.

Riesgo:

- `Home.tsx` y `RegimenView.tsx` tienen cambios extensos;
- hay que validar build frontend y al menos una navegación manual de home, búsqueda y régimen.

## 3. Archivos que requieren revisión antes de incluir

No incluir automáticamente:

- `frontend/src/pages/DictamenDetail.tsx`
- `frontend/src/components/doctrine/DoctrineReadingWorkspace.tsx`
- `frontend/src/lib/doctrineLanguage.ts`
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/index.css`
- `cgr-platform/src/clients/mistral.ts`

Motivo:

- pueden estar relacionados con la transición de lenguaje y experiencia, pero no son indispensables para el auditor offline;
- algunos tienen diffs grandes o tocan superficies que conviene revisar por separado;
- `mistral.ts` modifica reglas de metadata y puede afectar reprocesos futuros.

Recomendación:

- incluirlos solo si el build o la UX PJO los necesita realmente;
- si no, mantenerlos fuera del bloque estable PJO y tratarlos como cambio posterior.

## 4. Cambios laterales que deben quedar fuera del bloque PJO

No incluir en el bloque PJO:

- `agents/mcp/README.md`
- `cgr-platform/benchmark_results.json`
- `cgr-platform/migrations/0007_create_boletines_multimedia.sql`
- `cgr-platform/migrations/0008_expand_boletines_campaign_audit.sql`
- `cgr-platform/src/lib/boletinEngine.ts`
- `cgr-platform/src/workflows/boletinMultimediaWorkflow.ts`
- `frontend/src/components/admin/BoletinesManager.tsx`
- `frontend/src/hooks/useBoletines.ts`
- `frontend/src/pages/AdminDashboard.tsx`
- `frontend/prototype_terminal.html`
- `frontend/prototype_workspace.html`

Motivo:

- pertenecen a boletines, administración, prototipos o documentación de agentes;
- no deben mezclarse con la estabilización del paradigma jurisprudencial PJO.

## 5. Scripts y archivos de exploración

No incluir sin revisión:

- `.env.vars.example`
- `cgr-platform/list_models.js`
- `cgr-platform/scripts/*.js`
- `cgr-platform/scripts/*.ts`
- `cgr-platform/scripts/check_mistral_key_capabilities.mjs`
- `cgr-platform/test-*.ts`
- `cgr-platform/test_*.js`
- `cgr-platform/verify_*.js`
- `scripts/test_boletin_internal.ts`
- `scripts/test_mistral_keys.ts`
- `scripts/codex_with_env.sh`
- `rebuild_conversations.py`

Motivo:

- algunos pueden ser útiles, pero son herramientas locales o experimentales;
- no deben entrar al mismo commit que la estabilización PJO;
- podrían requerir revisión de secretos, rutas locales o supuestos de entorno.

## 6. Comando candidato para formar el bloque PJO

No ejecutar automáticamente sin revisión final:

```bash
git add \
  .gitignore \
  context/current_priorities.md \
  docs/explicacion/17_plan_avance_paradigma_jurisprudencial_pjo.md \
  docs/explicacion/18_auditoria_worktree_pre_auditor_pjo.md \
  docs/explicacion/19_corte_bloque_estable_pjo.md \
  cgr-platform/src/index.ts \
  cgr-platform/src/lib/doctrineLines.ts \
  cgr-platform/src/lib/doctrineMatterStatus.ts \
  cgr-platform/src/lib/queryUnderstanding/queryMode.ts \
  cgr-platform/src/lib/queryUnderstanding/queryIntent.ts \
  cgr-platform/src/lib/queryUnderstanding/queryRewrite.ts \
  cgr-platform/src/lib/doctrineClusters.ts \
  cgr-platform/src/lib/doctrineGuided.ts \
  frontend/src/types.ts \
  frontend/src/lib/doctrineInsights.ts \
  frontend/src/lib/queryNormalization.ts \
  frontend/src/components/dictamen/DictamenCard.tsx \
  frontend/src/components/doctrine/PjoHeroSolution.tsx \
  frontend/src/components/doctrine/PjoFeaturedSolution.tsx \
  frontend/src/components/doctrine/PjoBentoGrid.tsx \
  frontend/src/pages/Home.tsx \
  frontend/src/pages/RegimenView.tsx \
  frontend/src/pages/SearchResults.tsx
```

## 7. Validación requerida antes de cerrar el bloque

Backend:

```bash
cd cgr-platform
./node_modules/.bin/wrangler deploy --dry-run --outdir /tmp/cgr-worker-dryrun
./node_modules/.bin/tsc --noEmit
```

Frontend:

```bash
cd frontend
npm run build
```

Consultas mínimas en producción o local:

- `ley karin`
- `acoso laboral`
- `reconvención`
- `incendio caso fortuito recepción municipal`

Resultado observado el 2026-04-11:

- `frontend`: `npm run build` pasa correctamente.
- `backend`: `wrangler deploy --dry-run --outdir /tmp/cgr-worker-dryrun` empaqueta correctamente y sale con código 0; Wrangler muestra el error conocido de escritura de logs en `/home/bilbao3561/.config/.wrangler/logs/...` por filesystem read-only del sandbox.
- `backend`: `tsc --noEmit` falla por `test-pinecone.ts`, que importa `@pinecone-database/pinecone` y está fuera del bloque PJO recomendado.
- consultas productivas:
  - `ley karin`: devuelve `E516610N24` como `direct_hit`, con régimen `regimen-e516610n24` y PJO visible; mantiene dos líneas adicionales del mismo régimen.
  - `acoso laboral`: devuelve `OF29349N26` como `matter_status` y régimen `regimen-e516610n24`; marca materia litigiosa/tensionada. Requiere auditoría jurídica posterior para confirmar si esa promoción temporal es correcta.
  - `reconvención`: devuelve `021173N18` como `direct_hit` primero, pero todavía muestra líneas auxiliares ruidosas sobre `Aeródromo`, `Contratos de obras públicas`, `Control de legalidad` y `Carabineros`. Esto queda como deuda de control de ruido para consultas de término único.
  - `incendio caso fortuito recepción municipal`: devuelve solo `E563419N24` como `direct_hit`, sin familias amplias contaminantes.

## 8. Decisión recomendada

El auditor offline PJO debe implementarse después de formar este bloque.

Si se implementa antes, el siguiente diff mezclará:

- cambios de búsqueda ya desplegados;
- cambios visuales PJO;
- documentación nueva;
- artefactos del worktree;
- el auditor offline.

Ese escenario vuelve a producir el mismo problema de trazabilidad que se está intentando corregir.
