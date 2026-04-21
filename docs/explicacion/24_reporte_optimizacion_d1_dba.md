# Reporte DBA de optimizacion D1

Fecha: 2026-04-18

Base auditada: `cgr-dictamenes`

Ventana principal revisada: 2026-04-12 a 2026-04-18

## Resumen ejecutivo

El exceso de consumo no vino de una lectura normal del sitio publico. La causa dominante fue ejecucion repetida del pipeline de enriquecimiento, en particular el proceso que inserta etiquetas LLM y antes buscaba duplicados con consultas no sargables sobre `dictamen_etiquetas_llm`.

La consulta mas cara observada fue:

```sql
SELECT etiqueta
FROM dictamen_etiquetas_llm
WHERE LOWER(etiqueta) LIKE ?
```

En la ventana revisada acumulo aproximadamente:

- 100.402 ejecuciones.
- 28.302.138.299 filas leidas.
- 312.792.749 filas retornadas.
- 4.607.691 ms de duracion agregada.

Tambien habia costos relevantes en borrados y agregaciones por `dictamen_id`, checkout de workflows sobre `dictamenes`, historial operativo en `dictamen_events`, y consultas de dashboard/admin.

## Hallazgos

| Consulta / familia | Filas leidas historicas | Causa tecnica | Estado |
| --- | ---: | --- | --- |
| `LOWER(etiqueta) LIKE ?` en `dictamen_etiquetas_llm` | 28,30B | Funcion sobre columna + busqueda por prefijo sin indice compatible | Mitigada en `0012` y codigo ajustado a `LIKE ? COLLATE NOCASE` |
| `DELETE FROM dictamen_etiquetas_llm WHERE dictamen_id = ?` | 5,13B | Falta de indice por `dictamen_id` | Mitigada en `0012` |
| `dictamen_fuentes_legales WHERE dictamen_id = ?` | 3,70B | Falta de indice por `dictamen_id` | Mitigada en `0012` |
| `LOWER(REPLACE(etiqueta,'.','')) = ?` | 1,94B | Expresion normalizada sin indice de expresion | Mitigada en `0013` |
| Checkout de workflows sobre `dictamenes` con `ORDER BY fecha_documento DESC, numero DESC, id DESC` | 1,25B aprox. en familias observadas | Escaneo y ordenamiento temporal | Mitigada en `0013` |
| `dictamen_events ORDER BY created_at DESC` | Riesgo recurrente de dashboard/historial | Ordenamiento sobre tabla de eventos creciente | Mitigada en `0013` |
| `enriquecimiento` por fecha/modelo | Riesgo en dashboard de migracion | Filtro por fecha sin indice compuesto | Mitigada en `0013` |
| Consultas `SELECT *` desde Cloudflare Dashboard | Variable | Exploracion manual puede generar lecturas facturables | Riesgo operativo; evitar en produccion |

## Cambios aplicados

### Migracion `0012_optimize_d1_read_usage_indexes.sql`

Indices ya aplicados previamente para los mayores consumidores historicos:

```sql
CREATE INDEX IF NOT EXISTS idx_etiquetas_llm_dictamen
  ON dictamen_etiquetas_llm(dictamen_id);

CREATE INDEX IF NOT EXISTS idx_etiquetas_llm_etiqueta_nocase
  ON dictamen_etiquetas_llm(etiqueta COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_fuentes_legales_dictamen
  ON dictamen_fuentes_legales(dictamen_id);

CREATE INDEX IF NOT EXISTS idx_fuentes_legales_dictamen_tipo_numero
  ON dictamen_fuentes_legales(dictamen_id, tipo_norma, numero);

CREATE INDEX IF NOT EXISTS idx_relaciones_juridicas_destino
  ON dictamen_relaciones_juridicas(dictamen_destino_id);

CREATE INDEX IF NOT EXISTS idx_relaciones_juridicas_origen
  ON dictamen_relaciones_juridicas(dictamen_origen_id);
```

### Migracion `0013_dba_hot_path_indexes.sql`

Aplicada remotamente el 2026-04-18:

```sql
CREATE INDEX IF NOT EXISTS idx_etiquetas_llm_etiqueta_normalizada
  ON dictamen_etiquetas_llm(LOWER(REPLACE(etiqueta, '.', '')));

CREATE INDEX IF NOT EXISTS idx_dictamenes_workflow_checkout_order
  ON dictamenes(fecha_documento DESC, numero DESC, id DESC)
  WHERE old_url IS NOT NULL AND division_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dictamen_events_created_at
  ON dictamen_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enriquecimiento_fecha_modelo
  ON enriquecimiento(fecha_enriquecimiento, modelo_llm);

CREATE INDEX IF NOT EXISTS idx_boletines_created_at
  ON tabla_boletines(created_at DESC);
```

## Verificacion

Antes de `0013`, estos planes tenian `SCAN` completo y/o `USE TEMP B-TREE FOR ORDER BY`:

```sql
SELECT etiqueta
FROM dictamen_etiquetas_llm
WHERE LOWER(REPLACE(etiqueta, '.', '')) = ?
LIMIT 1;

SELECT d.id
FROM dictamenes d
WHERE d.estado IN (...)
  AND d.old_url IS NOT NULL
  AND d.division_id IS NOT NULL
ORDER BY d.fecha_documento DESC, d.numero DESC, d.id DESC
LIMIT 40;

SELECT *
FROM dictamen_events
ORDER BY created_at DESC
LIMIT 51;
```

Despues de `0013`, `EXPLAIN QUERY PLAN` confirma:

- `dictamen_etiquetas_llm`: `SEARCH ... USING INDEX idx_etiquetas_llm_etiqueta_normalizada (<expr>=?)`.
- `dictamenes`: `SCAN d USING INDEX idx_dictamenes_workflow_checkout_order`, sin `TEMP B-TREE` para el ordenamiento.
- `dictamen_events`: `SCAN dictamen_events USING INDEX idx_dictamen_events_created_at`, sin ordenamiento temporal.
- `tabla_boletines`: `SCAN tabla_boletines USING INDEX idx_boletines_created_at`.
- `enriquecimiento`: `SEARCH enriquecimiento USING COVERING INDEX idx_enriquecimiento_fecha_modelo (fecha_enriquecimiento>?)`.

La consulta real de checkout de workflow, limitada a 40 filas, quedo en 10.137 filas leidas. Antes el plan ordenaba la tabla candidata completa; ahora recorre el indice parcial en orden y corta al cumplir el `LIMIT`.

## Guardrails operativos

1. No ejecutar backfills ni endpoints admin sin token.
2. Mantener despliegues productivos con `wrangler deploy --env production`; una configuracion `ENVIRONMENT=local` en produccion deja una superficie de abuso.
3. Evitar exploracion con `SELECT * ORDER BY ...` desde Cloudflare Dashboard sobre tablas grandes.
4. Para auditorias, usar D1 Analytics / GraphQL y agrupar por `query`, `rowsRead`, `count`, `rowsWritten`.
5. Toda consulta nueva de backfill debe revisarse con `EXPLAIN QUERY PLAN` antes de ejecutarse masivamente.
6. Si una consulta usa `LOWER(columna)`, `REPLACE(columna, ...)`, `strftime(...)` o `LIKE` con patron variable, revisar si sigue siendo sargable o si requiere indice de expresion.

## Fuentes Cloudflare usadas

- D1 metrics and analytics: https://developers.cloudflare.com/d1/observability/metrics-analytics/
- D1 billing: https://developers.cloudflare.com/d1/observability/billing/
- Cloudflare GraphQL Analytics API: https://developers.cloudflare.com/analytics/graphql-api/
