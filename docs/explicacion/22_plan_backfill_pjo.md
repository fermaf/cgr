# Plan de backfill PJO

Fecha: 2026-04-11

## 1. Punto de partida real

La auditoria offline PJO/regimenes detecto:

- 20 `regimenes_jurisprudenciales`;
- 20 `problemas_juridicos_operativos`;
- 396 relaciones en `regimen_dictamenes`;
- 0 relaciones en `pjo_dictamenes`;
- 60 normas en `norma_regimen`;
- 83 eventos en `regimen_timeline`;
- 15 casos utiles pero incompletos;
- 5 casos sospechosos.

Conclusion:

> El paradigma PJO existe como capa conceptual y de presentacion, pero aun no esta suficientemente alimentado como capa operacional de membresia PJO.

Esto explica por que el sistema puede mostrar un PJO por regimen, pero todavia necesita heuristicas en `doctrine-search` para encontrarlo cuando el dictamen representativo no es el rector.

## 2. Objetivo del backfill

Poblar y robustecer la capa PJO sin inventar certeza juridica.

El primer backfill no debe crear cientos de PJOs nuevos. Debe:

- completar membresia en `pjo_dictamenes`;
- asignar roles de lectura;
- marcar casos sospechosos para revision;
- distinguir PJO publicable de PJO tensionado o historico;
- dejar evidencia suficiente para que la UI no trate todos los PJOs igual.

## 3. Fase A — Backfill de membresia PJO desde regimen_dictamenes

Entrada:

- `problemas_juridicos_operativos`;
- `regimen_dictamenes`;
- `regimenes_jurisprudenciales`;
- `dictamen_metadata_doctrinal`;
- `regimen_timeline`.

Regla base:

- si un PJO pertenece a un regimen, los miembros del regimen son candidatos a `pjo_dictamenes`;
- no todos deben tener el mismo rol;
- la tabla debe expresar funcion de lectura.

Asignacion inicial de roles:

- `rector`: dictamen igual a `p.dictamen_rector_id` o `r.dictamen_rector_id`;
- `fundante`: dictamen igual a `r.dictamen_fundante_id` o evento `fundacion`;
- `historico`: miembro con `estado_vigencia` desplazado, valor historico o anterior a un evento de desplazamiento;
- `contextual`: miembro con baja centralidad, sin norma compartida fuerte o con riesgo de deriva;
- `aplicativo`: miembro restante que aplica el criterio.

Criterio de salida:

- `pjo_dictamenes` deja de estar vacia;
- cada PJO tiene al menos un `rector`;
- los casos sospechosos no se promocionan automaticamente como vigentes.

## 4. Fase B — Estado de publicabilidad

Hoy la tabla PJO tiene `estado`, pero no basta para producto.

Se recomienda agregar una capa de revision, ya sea como nueva tabla o campos controlados:

- `audit_status`: `publicable`, `util_incompleto`, `sospechoso`, `no_publicable`;
- `audit_reasons_json`;
- `review_status`: `auto_pending`, `human_reviewed`, `needs_legal_review`;
- `reviewed_at`;
- `reviewed_by`;
- `source_audit_version`.

No es obligatorio crear esta migracion antes de poblar membresia, pero si es recomendable antes de que la UI promueva PJOs como criterio fuerte.

## 5. Fase C — Revision de casos sospechosos

Casos detectados por auditoria como sospechosos:

- `regimen-e156769n21`: confianza legitima en contratas, regimen en transicion, relaciones desestabilizantes internas;
- `regimen-024531n17`: licitacion publica, regimen desplazado, PJO superado;
- `regimen-062697n15`: titularidad docente y honorarios Ley 20.248, relacion desestabilizante interna;
- `regimen-012084n17`: PRC/normas urbanisticas basadas en vias, sin normas nucleares y relacion desestabilizante;
- `regimen-017500n16`: reapertura de sumario y pago de remuneraciones, zona litigiosa y alta desestabilizacion interna.

Regla:

- estos casos no deben aparecer como `publicable` sin revision juridica o sin degradacion visible en UI.

## 6. Fase D — Nuevos PJOs

Solo despues de completar membresia y publicabilidad de los 20 actuales se deben crear nuevos PJOs.

Fuentes de semillas:

- consultas frecuentes de la matriz de pruebas que no tienen PJO;
- direct hits fuertes y repetidos sin regimen;
- dictamenes con `criterio_operativo_actual`;
- dictamenes recientes con señales de desplazamiento, abstencion o litigiosidad;
- regímenes con normas nucleares y miembros suficientes pero sin PJO.

Regla de prudencia:

- no crear un PJO por cada fact pattern;
- agrupar bajo un mismo regimen si el problema juridico es el mismo;
- si el caso es solo un dictamen directo, mantenerlo como direct hit hasta que haya suficiente estructura.

## 7. Orden de implementacion recomendado

1. Crear script `backfill_pjo_dictamenes` en modo dry-run.
2. Ejecutarlo sobre los 20 PJOs actuales.
3. Revisar salida por conteos y muestras:
   - total insertable;
   - rectores por PJO;
   - historicos;
   - contextuales;
   - sospechosos excluidos o degradados.
4. Persistir solo membresia, no respuestas nuevas.
5. Re-ejecutar auditoria PJO/regimenes.
6. Ajustar UI para consumir `audit_status` cuando exista.
7. Recien despues crear nuevos PJOs offline con LLM asistido.

## 8. Criterio de exito

El backfill es exitoso si:

- `pjo_dictamenes` tiene cobertura para los 20 PJOs actuales;
- cada PJO tiene rector trazable;
- los 5 sospechosos quedan marcados o degradados;
- la matriz de pruebas no empeora;
- el frontend puede distinguir PJO vigente, tensionado, desplazado o incompleto.

No se considera exitoso si solo aumenta la cantidad de PJOs sin resolver membresia, temporalidad y publicabilidad.

## 9. Dry-run ejecutado

El primer dry-run quedó en:

- `docs/explicacion/23_backfill_pjo_dictamenes_dry_run.md`
- `docs/explicacion/23_backfill_pjo_dictamenes_dry_run.json`

Resultado:

- 396 filas candidatas leídas desde `regimen_dictamenes`;
- 396 inserciones propuestas para `pjo_dictamenes`;
- 20 PJOs cubiertos;
- 20 rectores propuestos, uno por PJO;
- roles propuestos:
  - `rector`: 20;
  - `fundante`: 39;
  - `aplicativo`: 193;
  - `historico`: 15;
  - `contextual`: 129;
- 274 filas asociadas a regímenes `util_incompleto`;
- 122 filas asociadas a regímenes `sospechoso`.

El SQL generado queda como artefacto local en:

- `cgr-platform/scripts/backfill_pjo_dictamenes.generated.sql`

Ese archivo está ignorado por Git porque debe regenerarse antes de ejecutar contra D1 remoto.

Próximo paso:

- revisar si se acepta persistir las 396 filas;
- si se persisten, ejecutar inmediatamente la auditoría PJO/regímenes de nuevo;
- mantener degradación o revisión para los 5 regímenes sospechosos.
