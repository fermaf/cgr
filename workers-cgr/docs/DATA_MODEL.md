# Modelo de datos

Este documento describe entidades en D1, claves en KV y la metadata enviada a Pinecone.

## 1) D1 (cgr-d1)

### 1.1 dictamen

- `id` (TEXT, PK): `doc_id` canonico.
- `estado` (TEXT): `ingested` | `enriched` | `vectorized` | `error` | `invalid_input`.
- `genera_jurisprudencia` (INTEGER/NULL): flag CGR (no LLM).
- `documento_completo_missing` (INTEGER/NULL): 1 si el RAW no trae `documento_completo`.
- `migrated_from_mongo` (INTEGER/NULL): 1 si proviene de dump Mongo.
- `crawled_from_cgr` (INTEGER/NULL): 1 si proviene de crawl CGR.
- `canonical_sha256` (TEXT/NULL): hash canonico.
- `canonical_bytes` (INTEGER/NULL): bytes del payload canonico.
- `created_at`, `updated_at` (TEXT).

Campos de metadata basica:
- `n_dictamen`, `numeric_doc_id`, `year_doc_id`
- `fecha_documento`, `fecha_indexacion`
- `materia`, `criterio`
- `origen`, `origenes`, `descriptores`, `abogados`, `destinatarios`

### 1.2 raw_ref

- `id` (TEXT, PK): UUID.
- `dictamen_id` (TEXT): FK logica a `dictamen.id`.
- `raw_key` (TEXT): key en `RAW_KV`.
- `sha256` (TEXT): hash del RAW completo.
- `bytes` (INTEGER): tamano aproximado.
- `created_at` (TEXT).

### 1.3 enrichment

- `id` (TEXT, PK): UUID.
- `dictamen_id` (TEXT): FK logica.
- `titulo`, `resumen`, `analisis` (TEXT).
- `etiquetas_json` (TEXT): JSON array.
- `genera_jurisprudencia_llm` (INTEGER/NULL).
- `fuentes_legales_missing` (INTEGER/NULL).
- `booleanos_json` (TEXT): JSON con flags normalizados.
- `fuentes_legales_json` (TEXT): JSON con fuentes estructuradas.
- `model` (TEXT): modelo usado por LLM.
- `migrated_from_mongo` (INTEGER/NULL).
- `created_at` (TEXT).

### 1.4 run_log

- `run_type` (TEXT): `crawl` | `enrich` | `fuentes` | `vectorize` | `backfill_*`.
- `status` (TEXT): `started` | `completed` | `error` | `invalid_input` | `invalid_enrichment`.
- `detail_json` (TEXT): diagnostico.
- `started_at`, `finished_at` (TEXT).

## 2) Canonico (hash de control)

### 2.1 Fuente del canonical

Se resuelve desde el RAW en este orden:
1) `raw._source`
2) `raw.source`
3) `raw.raw_data`
4) `raw`

### 2.2 Orden y campos exactos

El payload canonico usa un orden fijo (estable) con estas claves:

- `documento_completo`
- `fecha_documento`
- `fecha_indexacion`
- `nuevo`
- `aclarado`
- `alterado`
- `aplicado`
- `complementado`
- `confirmado`
- `reconsiderado`
- `reconsiderado_parcialmente`
- `reactivado`
- `relevante`
- `boletin`
- `recurso_proteccion`

### 2.3 Normalizaciones

- `documento_completo`, `fecha_documento`, `fecha_indexacion`: trim + espacios colapsados.
- Si el campo viene como array, se concatena y se normaliza.
- Flags se normalizan a `0/1/null` usando `normalizeFlag`.

## 3) KV

### 3.1 RAW_KV

- `raw/<YYYY-MM-DD>/<sha256>.json`: JSON raw completo.

### 3.2 STATE_KV

- `cgr:cursor`: cursor de paginacion.
- `crawl:cgr`: estado de auto-detencion.
- `crawl:stable`: contador de paginas estables.
- `quota:daily`: estado del governor.

## 4) Pinecone (index `cgr`, namespace `mistralLarge2411`)

El campo configurado para embedding es `analisis`.

Campos (23):
- `ID`, `Resumen`, `analisis`
- booleanos: `aplicado`, `boletin`, `confirmado`, `complementado`, `aclarado`, `alterado`,
  `reconsiderado`, `reconsideradoParcialmente`, `reactivado`, `recursoProteccion`, `relevante`, `nuevo`
- `titulo`, `materia`
- `descriptores_AI`, `descriptores_originales`
- `fecha` (ISO)
- `created_at` (America/Santiago, `YYYY-MM-DD HH:MM:SS:00`)
- `u_time` (Unix seconds de `fecha_documento`)
- `model` (namespace)
