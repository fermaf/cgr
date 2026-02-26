# Plan de Paso a Producción y Estrategia de Commit

Fecha base: 2026-02-26.

## 1) Criterios de salida de preproducción

- Tests TypeScript: `npx tsc --noEmit` en verde
- Prueba DNS controlada en local validada
- Prueba `SKILL_TEST_ERROR=1` validada
- Registro en `skill_events` con `code`, `decision_skill`, `fingerprint`
- Sanitización de contexto verificada (sin secretos)

## 2) Plan de despliegue a producción (sin downtime)

1. Congelar cambios funcionales en rama de release.
2. Ejecutar checklist de config:
   - `ENVIRONMENT=prod`
   - `CGR_API_TOKEN` presente en secrets
   - bindings D1/KV/workflows correctos
3. Ejecutar migraciones D1 pendientes (si aplica).
4. Deploy canario:
   - 10% tráfico o ventana de bajo impacto
   - monitoreo de logs y `skill_events`
5. Validar smoke tests:
   - `/api/v1/stats`
   - trigger de ingesta acotado
6. Escalar al 100% si no hay regresión en 30-60 minutos.
7. Mantener ventana de observación de 24 horas.

## 3) Plan de rollback

- Trigger de rollback inmediato si:
  - error rate +2x baseline
  - incidentes `UNKNOWN` en crecimiento sostenido
  - fallos de ingesta críticos
- Acción:
  - redeploy a versión estable previa
  - mantener evidencia de incidentes
  - abrir postmortem en menos de 24h

## 4) Estrategia de commit (GitHub)

## Rama recomendada

- `docs/skillgen-etapa1-etapa2-plan`

## Mensaje de commit recomendado (español)

`docs(skillgen): reorganiza docs vigentes/históricas y define plan de producción + etapa2 iteración1`

## Cuerpo recomendado

- separa insumos históricos de etapa 1 en `docs/historico/`
- agrega documentación de paradigmas A/B + 3 paradigmas adicionales
- documenta plan de paso a producción, rollback y gobernanza
- madura etapa 2 con primera iteración ejecutable

## Comandos sugeridos

```bash
git checkout -b docs/skillgen-etapa1-etapa2-plan
git add docs/
git commit -m "docs(skillgen): reorganiza docs vigentes/históricas y define plan de producción + etapa2 iteración1"
git push -u origin docs/skillgen-etapa1-etapa2-plan
```

## 5) Definición de "Done" para producción

- Deploy estable en `prod`
- Runbook actualizado en docs
- PR mergeado con aprobación técnica y operativa
