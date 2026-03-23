# Arquitectura de Atributos y Relaciones Jurídicas de Dictámenes

## 1. Visión General del Sistema y la Necesidad Histórica

La Contraloría General de la República (CGR) categoriza las iteraciones jurisprudenciales mediante estados (flags) como `aclarado`, `alterado`, `complementado`, `reconsiderado`, entre otros. Históricamente, estos flags se heredaron pasivamente desde MongoDB durante las primeras fases del proyecto, resultando en que un dictamen tuviera marcado, por ejemplo, `complementado=1`, pero sin rastro computacional que indicara **qué otro dictamen originó esa complementación**.

Además, la herencia asimétrica provocó miles de "nodos huérfanos" (dictámenes marcados como alterados sin referencias entrantes detectables en la BD), o relaciones "M a 1" donde un solo dictamen era referenciado decenas de veces, imposibilitando dilucidar matemáticamente la causa basal mediante proximidad de referencias (Tasa de Fallo Heurístico Geométrico > 60%).

Por ello, se ha diseñado una arquitectura mixta (Extracción Léxica + LLM Inverso + Tablas de Cola) que garantiza integridad referencial y actualización masiva de estados entre `dictamenes_source` (KV), `dictamenes` (D1), `atributos_juridicos` (D1) y sus vectores (Pinecone).

## 2. Nueva Estructura Relacional (D1)

Para sostener el grafo de dependencias, el esquema `schema_prod.sql` introduce dos nuevas entidades:

### 2.1 Tabla: `dictamen_relaciones_juridicas`
Tabla canónica que mapea explícitamente la acción de un dictamen Creador de Jurisprudencia sobre uno Afectado.
* **`dictamen_origen_id`:** ID del nuevo dictamen (el que dicta la modificación).
* **`dictamen_destino_id`:** ID del dictamen histórico (el que sufre la modificación).
* **`tipo_accion`:** La conjugación de acción de los atributos_juridicos (`aclarado`, `alterado`, etc.).
Posee una restricción `UNIQUE(origen, destino, tipo_accion)` para evitar aristas duplicadas en el grafo, permitiendo que un dictamen destino sufra múltiples alteraciones a través de los años por diferentes emisores.

### 2.2 Tabla: `dictamen_relaciones_huerfanas`
Tabla estática de cuarentena donde residen temporalmente los dictámenes que acarrean una bandera temporal (`reconsiderado=1`) cuyo referenciador original es indetectable mediante análisis de metadatos o prefijos simplificados pre-LLM. Un proceso Batch programado los evalúa hasta hallar su vínculo exacto, trasladando la correspondencia a `dictamen_relaciones_juridicas`.

## 3. Patrón de Matching Heurístico vs Extracción LLM

Basado en la jurisprudencia real, un dictamen no referencia otro usando el ID interno del subsistema (e.g. `007640N07`), sino con el estándar literario de CGR: `"N° 7.640, de 2007"`.

Para corregir los Falsos Positivos de la antigua heurística "por cercanía", el pipeline ejecuta:
1. Extracción de **Número (`7640`)** y **Año (`2007`)** desde el texto enriquecido de la ingesta (a través de Mistral IA). Mistral ignora los acronismos artificiales (N) centrándose exclusivamente en la métrica CGR.
2. Composición sintética del ID de destino: `0 + NUMBER + N + YY` en la capa de Backend, o evaluación parcial vía SQL `LIKE '%007640%N%` solo sobre los datos estructurados.

## 4. Pipeline de Ingesta y Rollback (Retro-Update Full-Stack)

El ciclo de vida del *Retro-Update* se activa cuando un nuevo dictamen alterante (ej. del 2026) ingresa al orquestador `ingest.ts`.

1. **Evaluación Mistral (Prompt Inyectado):** Mistral detecta la modificación leyendo el documento crudo y genera el array `acciones_juridicas_emitidas` en la salida JSON.
2. **Propagación Relacional (Grafo):** Inserción inmediata de las aristas en `dictamen_relaciones_juridicas`.
3. **Propagación Escalar (D1 Atributos):** Forzado de un `UPDATE` en `atributos_juridicos` para encender la bandera inyectada al dictamen histórico destino.
4. **Propagación JSON (D1 Enriquecimiento):** Parseo y sobrescritura de la columna `booleanos_json` del dictamen destino, garantizando consistencia local de sub-tablas.
5. **Propagación Documento Raíz (KV):** Extracción del Snapshot de `DICTAMENES_SOURCE`, mutación in-memory de `raw_data.alterado = 1`, y `PUT` de regreso a Cloudflare KV.
6. **Propagación Externa (Pinecone & Crawl):** Programación de re-vectorización en Pinecone debido a la modificación semántica del estado legal (es un nuevo "bad precedent"), y eventual Re-Crawl forzado a los servidores origen para sincronicidad formal.
7. **Traza Semántica (Events):** Transcripción del proceso general como un log auditivo a la tabla `dictamen_events`.

Esta coreografía total elimina la asimetría temporal de los atributos jurídicos en la plataforma CGR, dando coherencia instantánea end-to-end.
