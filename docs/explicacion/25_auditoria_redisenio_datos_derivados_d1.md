# Auditoria de rediseno para datos derivados en D1

Fecha: 2026-04-18

Base observada: `cgr-dictamenes`

Objetivo: identificar optimizaciones profundas de diseno, no parches forzados de indices.

## Criterio de auditoria

Una mejora se considera estructural solo si cumple al menos dos condiciones:

1. El consumo D1 muestra lecturas repetidas o crecientes.
2. El codigo mezcla responsabilidades de dominio, catalogo, busqueda o agregacion.
3. La tabla usada en caliente crece con cada workflow o backfill.
4. La solucion con indices reduce el sintoma, pero no cambia la complejidad conceptual.
5. El redisenio permite idempotencia, auditoria y crecimiento.

## Levantamiento cuantitativo

Tamanos observados en produccion:

| Tabla | Filas |
| --- | ---: |
| `dictamenes` | 86.479 |
| `enriquecimiento` | 51.778 |
| `dictamen_etiquetas_llm` | 328.869 |
| `dictamen_fuentes_legales` | 246.356 |
| `dictamen_relaciones_juridicas` | 86.276 |
| `dictamen_events` | 745.270 |
| `dictamen_metadata_doctrinal` | 51.014 |

En fuentes legales:

- 246.356 menciones totales.
- 46.669 dictamenes con fuentes.
- 63.538 claves textuales distintas si se combinan tipo, numero, articulo, year y sector.
- 3.936 filas de relleno o baja calidad detectadas por reglas simples.

En etiquetas:

- 328.869 menciones totales.
- 40.104 etiquetas display distintas.
- 40.014 etiquetas normalizadas distintas.

## Hallazgo 1: etiquetas LLM no deben ser catalogo global

### Evidencia

El workflow de enriquecimiento itera etiquetas y llama a `insertDictamenEtiquetaLLM`.

Ruta:

- `cgr-platform/src/workflows/enrichmentWorkflow.ts`
- `cgr-platform/src/storage/d1.ts`
- `cgr-platform/src/lib/stringMatch.ts`

La tabla `dictamen_etiquetas_llm` se usa a la vez como:

- relacion dictamen-etiqueta;
- repositorio historico;
- catalogo de etiquetas;
- fuente para busqueda fuzzy/canonizacion.

Ese fue el origen del mayor consumo historico de filas leidas.

### Redisenio recomendado

Separar catalogo y relacion:

```sql
CREATE TABLE etiquetas_catalogo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etiqueta_display TEXT NOT NULL,
  etiqueta_norm TEXT NOT NULL UNIQUE,
  etiqueta_slug TEXT NOT NULL,
  origen TEXT NOT NULL DEFAULT 'llm',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE dictamen_etiquetas (
  dictamen_id TEXT NOT NULL,
  etiqueta_id INTEGER NOT NULL,
  raw_etiqueta TEXT,
  modelo_llm TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (dictamen_id, etiqueta_id)
);

CREATE TABLE etiquetas_alias (
  alias_norm TEXT PRIMARY KEY,
  etiqueta_id INTEGER NOT NULL,
  razon TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

Nuevo hot path:

```sql
INSERT OR IGNORE INTO etiquetas_catalogo (etiqueta_display, etiqueta_norm, etiqueta_slug)
VALUES (?, ?, ?);

INSERT OR IGNORE INTO dictamen_etiquetas (dictamen_id, etiqueta_id, raw_etiqueta, modelo_llm)
SELECT ?, id, ?, ?
FROM etiquetas_catalogo
WHERE etiqueta_norm = ?;
```

La deduplicacion fuzzy debe pasar a un job offline de candidatos de merge, no al workflow de enriquecimiento.

## Hallazgo 2: fuentes legales requieren catalogo canonico juridico

### Evidencia

`insertDictamenFuenteLegal` normaliza la fuente y la inserta como texto repetido en `dictamen_fuentes_legales`.

La tabla se usa como:

- relacion dictamen-fuente;
- fact table de analitica;
- fuente de senales doctrinales;
- base para regimenes;
- catalogo implicito de normas.

Esto ya genero consultas historicas caras:

- `SELECT tipo_norma, numero, COUNT(*) ... WHERE dictamen_id = ? GROUP BY ...`
- `DELETE FROM dictamen_fuentes_legales WHERE dictamen_id = ?`
- agregaciones globales por norma, anio y materia.

Los indices `0012` mitigaron el costo inmediato, pero el diseno sigue duplicando identidad juridica en cada mencion.

### Redisenio recomendado

Crear un catalogo canonico de normas y mantener menciones separadas:

```sql
CREATE TABLE fuentes_legales_catalogo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  norma_key TEXT NOT NULL UNIQUE,
  tipo_norma TEXT NOT NULL,
  numero TEXT,
  articulo TEXT,
  year TEXT,
  sector TEXT,
  display_label TEXT NOT NULL,
  confianza_normalizacion REAL NOT NULL DEFAULT 1.0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE dictamen_fuentes (
  dictamen_id TEXT NOT NULL,
  fuente_id INTEGER NOT NULL,
  raw_tipo_norma TEXT,
  raw_numero TEXT,
  raw_articulo TEXT,
  raw_extra TEXT,
  modelo_llm TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (dictamen_id, fuente_id, raw_articulo, raw_extra)
);

CREATE TABLE fuentes_legales_alias (
  alias_key TEXT PRIMARY KEY,
  fuente_id INTEGER NOT NULL,
  razon TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

La regla juridica no debe ser fuzzy general. Debe ser deterministica:

- Ley y DL: identidad principalmente por tipo + numero.
- DFL, decretos y resoluciones: tipo + numero + year + sector cuando exista.
- Constitucion, Codigo Civil, Codigo del Trabajo: entidad canonica sin numero, pero articulos como dimension separada.
- Normas transversales: no contar como senal fuerte si no hay articulo.
- Fila `valor de relleno`: no debe entrar al catalogo canonico.

Este redisenio habilita:

- `GROUP BY fuente_id` en vez de agrupar strings.
- analitica incremental por norma;
- merge auditado de variantes;
- correccion de una norma sin reescribir todas las menciones.

## Hallazgo 3: busqueda lexical doctrinal no debe escanear D1 con `LIKE`

### Evidencia

Existen rutas doctrinales que construyen condiciones como:

```sql
LOWER(COALESCE(d.materia, '')) LIKE ?
OR LOWER(COALESCE(e.titulo, '')) LIKE ?
OR LOWER(COALESCE(e.resumen, '')) LIKE ?
OR LOWER(COALESCE(e.analisis, '')) LIKE ?
```

Eso aparece en busqueda doctrinal y estado de materia. En Analytics fue visible una familia de consultas de este tipo con millones de filas leidas, aunque no fue el mayor consumidor.

### Redisenio recomendado

Crear un "retrieval gateway" con capas:

1. Pinecone / vector search como entrada principal para busqueda semantica.
2. Indice lexical auxiliar para fallback, no `LIKE` sobre tablas transaccionales.
3. D1 solo para hidratar resultados por `id`.

Opciones viables:

- D1 FTS5 para indice lexical local, porque D1 soporta FTS5.
- Tabla propia de tokens normalizados si se quiere control total.
- Mantener lexical solo como re-ranking de un conjunto pequeno devuelto por vector search.

Diseno sugerido:

```sql
CREATE VIRTUAL TABLE dictamen_search_fts USING fts5(
  dictamen_id UNINDEXED,
  materia,
  criterio,
  titulo,
  resumen,
  analisis
);
```

O, si se prefiere mas control:

```sql
CREATE TABLE dictamen_search_terms (
  term TEXT NOT NULL,
  dictamen_id TEXT NOT NULL,
  field TEXT NOT NULL,
  weight REAL NOT NULL,
  PRIMARY KEY (term, dictamen_id, field)
);
```

La busqueda no deberia construir consultas con 30 a 50 `LIKE` dinamicos sobre `dictamenes` + `enriquecimiento`.

## Hallazgo 4: dashboards y analitica no deben consultar bases vivas

### Evidencia

Hay consultas de dashboard/admin que calculan:

- conteos por estado;
- migracion por modelo;
- evolucion por fecha;
- heatmaps normativos;
- tendencias por materia.

Algunas ya tienen snapshots (`stats_snapshot_*`), lo que es una buena direccion. Pero todavia aparecen consultas live con `COUNT`, `GROUP BY`, `CASE` y joins sobre tablas base.

### Redisenio recomendado

Adoptar una capa unica de snapshots operacionales:

```sql
CREATE TABLE operational_metrics_snapshot (
  snapshot_at TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  dimension_1 TEXT,
  dimension_2 TEXT,
  value INTEGER NOT NULL,
  PRIMARY KEY (snapshot_at, metric_key, dimension_1, dimension_2)
);
```

Y una tabla de estado actual:

```sql
CREATE TABLE operational_metrics_current (
  metric_key TEXT NOT NULL,
  dimension_1 TEXT,
  dimension_2 TEXT,
  value INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (metric_key, dimension_1, dimension_2)
);
```

Los dashboards deben leer snapshots. Las consultas live deben quedar solo para admin DBA manual.

## Hallazgo 5: checkout de workflows necesita modelo de lease/idempotencia

### Evidencia

El checkout selecciona candidatos por estado, luego itera filas para actualizar estado y registrar eventos.

Esto ya fue mitigado con un indice parcial, pero el patron operativo sigue teniendo riesgos:

- carreras si hay mas de un workflow;
- muchos eventos por lote;
- dificultad para distinguir claim, procesamiento y timeout;
- `dictamenes.estado` cumple demasiadas funciones.

### Redisenio recomendado

Separar estado de dominio y estado de trabajo:

```sql
CREATE TABLE workflow_jobs (
  job_id TEXT PRIMARY KEY,
  workflow_type TEXT NOT NULL,
  dictamen_id TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_until TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(workflow_type, dictamen_id)
);
```

El workflow reclamaria trabajos por `workflow_type`, `status`, `priority` y `lease_until`, no por combinaciones crecientes de `dictamenes.estado`.

Esto no es urgente si el volumen baja, pero es el redisenio correcto antes de nuevos backfills masivos.

## Hallazgo 6: `dictamen_events` debe tener retencion y rollups

### Evidencia

`dictamen_events` tiene 745.270 filas. Es util como auditoria, pero tambien se usa para vistas recientes y diagnostico.

### Redisenio recomendado

Mantener tres niveles:

1. `dictamen_events`: ultimos eventos necesarios para UI y auditoria cercana.
2. `dictamen_event_rollups`: conteos por dia, tipo, estado, workflow.
3. Archivo frio en R2 o export externo para eventos antiguos.

Esto evita que cada nueva funcionalidad admin termine ordenando o agrupando una tabla de eventos indefinidamente creciente.

## Priorizacion

| Prioridad | Area | Razon |
| --- | --- | --- |
| P0 | Catalogo de etiquetas | Fue el mayor incidente de costo y el diseno sigue siendo fragil |
| P0 | Catalogo de fuentes legales | Es senal juridica central y ya tiene 246k menciones |
| P1 | Retrieval gateway / FTS lexical | Evita que busqueda doctrinal degrade hacia scans por texto |
| P1 | Snapshots operacionales | Reduce lecturas admin recurrentes y estabiliza dashboards |
| P2 | Workflow jobs con lease | Necesario antes de nuevos backfills masivos paralelos |
| P2 | Rollups y retencion de eventos | Evita crecimiento indefinido de auditoria caliente |

## Plan recomendado

### Fase 1: catalogos canonicos

1. Crear migraciones para `etiquetas_catalogo`, `dictamen_etiquetas`, `etiquetas_alias`.
2. Crear migraciones para `fuentes_legales_catalogo`, `dictamen_fuentes`, `fuentes_legales_alias`.
3. Cambiar escritura nueva para usar `INSERT OR IGNORE` por claves normalizadas.
4. Mantener tablas legacy como compatibilidad temporal.
5. Migrar historico por lotes.

### Fase 2: compatibilidad y lectura

1. Cambiar APIs internas para leer desde catalogos nuevos.
2. Crear vistas o adaptadores para respuestas antiguas.
3. Comparar resultados legacy vs nuevo modelo en muestras juridicas.
4. Bloquear entrada de filas `valor de relleno` al modelo canonico.

### Fase 3: busqueda y analitica

1. Mover fallback lexical a FTS5 o tabla de terminos.
2. Usar D1 solo para hidratar resultados por `id`.
3. Consolidar dashboards sobre snapshots.
4. Mantener consultas live solo para endpoints admin protegidos.

### Fase 4: workflows y eventos

1. Introducir `workflow_jobs`.
2. Reemplazar checkout por lease idempotente.
3. Crear rollups de eventos.
4. Definir retencion de eventos calientes.

## No recomendado

No recomiendo:

- agregar indices a todos los campos con `LIKE`;
- seguir mejorando fuzzy matching en el hot path;
- fusionar fuentes legales por Levenshtein;
- mover toda la busqueda lexical a D1 si Pinecone ya es el motor semantico principal;
- borrar tablas legacy sin etapa de compatibilidad;
- hacer poda de datos historicos sin snapshot verificable.

## Referencias Cloudflare

- D1 cuenta filas leidas por filas escaneadas, incluso si retorna pocas filas.
- D1 permite medir `rows_read` y `rows_written` por query y via Analytics.
- D1 soporta FTS5 como extension SQLite, util para indice lexical auxiliar.
- Los indices reducen filas leidas, pero agregan escritura adicional por indice.

Fuentes:

- https://developers.cloudflare.com/d1/observability/metrics-analytics/
- https://developers.cloudflare.com/d1/best-practices/use-indexes/
- https://developers.cloudflare.com/d1/sql-api/sql-statements/
- https://developers.cloudflare.com/workers/platform/pricing/
