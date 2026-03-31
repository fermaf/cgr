# Normalización de fuentes legales

## Problema atacado

`dictamen_fuentes_legales` acumuló tres tipos de degradación:

- variantes editoriales triviales: `Ley` / `ley`, `RES` / `res`, `DTO` / `dto`;
- siglas oscuras o demasiado comprimidas: `ctr`, `cci`, `cag`, `csa`, `pol`;
- pseudo-precisión visible: subdivisiones como `inc/1` o `inciso primero` mostradas como si fueran plenamente confiables.

Eso afectaba tanto la lectura del detalle del dictamen como la calidad de las fuentes dominantes en las líneas doctrinales.

## Qué se hizo

### 1. Diccionario canónico

Se agregó una capa canónica en:

- `cgr-platform/src/lib/legalSourcesCanonical.ts`

Esta capa:

- normaliza `tipo_norma`;
- normaliza números y años en casos seguros;
- resuelve alias frecuentes de alta confianza;
- asocia nombres visibles canónicos a normas muy citadas.

Ejemplos:

- `ctr` → `Código del Trabajo`
- `cci` → `Código Civil`
- `cag` → `Código de Aguas`
- `csa` → `Código Sanitario`
- `pol` → `Constitución Política de la República`
- `Ley 18834` → `Estatuto Administrativo`

### 2. Prevención futura

La normalización ya se aplica en la ingestión:

- `clients/mistral.ts`
- `storage/d1.ts`

Eso evita que nuevas variantes triviales o alias conocidos vuelvan a entrar crudos al histórico.

### 3. Saneamiento histórico seguro

Se dejó un lote SQL reutilizable:

- `scripts/normalize_legal_sources_historical.sql`

Este lote corrige solo casos de bajo riesgo:

- casing y variantes obvias;
- alias de alta confianza;
- normalización segura de números;
- normalización de años tipo `2009.0` → `2009`.

### 4. Presentación jurídica más confiable

El detalle del dictamen ahora:

- usa nombre visible canónico cuando la confianza es alta;
- deduplica mejor por clave canónica;
- reduce subdivisiones dudosas al mostrar la normativa citada.

## Qué quedó automatizado

- normalización futura de alias frecuentes;
- consolidación visual por clave canónica;
- nombres visibles canónicos para normas frecuentes;
- señal simple de confianza:
  - `alta_confianza`
  - `media_confianza`
  - `revisar`

## Qué queda para revisión humana

- referencias demasiado genéricas (`Código`, `Desconocido`, `valor de relleno`);
- nombres sectoriales muy largos o especiales;
- subdivisiones finas cuando no hay respaldo suficiente para mostrarlas con seguridad;
- nuevas siglas no incluidas aún en el diccionario.

## Dataset de alias candidatos

Se dejó una base de revisión en:

- `docs/analysis/legal_source_alias_candidates.json`

Ese archivo documenta alias observados con evidencia contextual y nivel de confianza.
