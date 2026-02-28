# 7. Auditoría de Higiene y Sincronización KV (Febrero 2026)

## Contexto del Incidente y Corrección
Durante el proceso de consolidación de la arquitectura de datos, se detectó una inconsistencia en el formato de las llaves en el almacenamiento Cloudflare KV (`DICTAMENES_SOURCE`). Existían tres formatos conviviendo:
1. **El formato Puro (ID Limpio):** Ej. `000007N21` o `E135987N25`. Es el estándar oficial desde la migración histórica de los ~260,000 dictámenes de MongoDB.
2. **El formato Prefijo:** Ej. `dictamen:E135988N25`. Añadido erróneamente por el `IngestWorkflow` reciente durante la captura de nuevos documentos en febrero 2026.
3. **El formato Basura/Raw:** Ej. `raw/2026-02-19/hash...json`. Alrededor de 222 archivos experimentales sin referencias en la base de datos D1.

Esto provocó que el proceso asíncrono de enriquecimiento (`BackfillWorkflow`) reportara estado de `error` al intentar leer documentos recién capturados, debido a que el código buscaba la llave limpia y no el prefijo `dictamen:`.

## Acciones Mitigatorias y de Higiene Ejecutadas

### 1. Limpieza de Basura (Llaves `raw/`)
Se ejecutó un script directo contra Cloudflare KV que identificó y eliminó definitivamente las 222 llaves "huérfanas" bajo el prefijo `raw/`. Esto libera almacenamiento y asegura que no haya documentos JSON inalcanzables.

### 2. Implementación de Lógica "Fallback" (Retrocompatibilidad)
Para evitar corrupciones en los flujos principales, se modificó el código fuente (tanto `BackfillWorkflow` como los Endpoints de lectura en `index.ts`) implementando un sistema de Fallback:
- El sistema intenta leer por defecto la llave "Pura" (`E135988N25`).
- Si arroja nulo, el sistema detecta que es un documento "atrapado" en el modelo anterior y automáticamente intenta leer `dictamen:E135988N25`.
- Esto permitió desatascar instantáneamente las colas de enriquecimiento fallidas.

### 3. Implementación y Lanzamiento de `KVSyncWorkflow`
Para sanear de forma definitiva y permanente la base de datos, se desarrolló y activó el `KVSyncWorkflow`. Este Workflow industrial realiza en background la siguiente rutina por cada uno de los 84,973 registros indexados históricamente:
1. Lee el documento de KV.
2. Escribe una copia exacta del JSON bajo la llave "Pura" (sin prefijo).
3. **Inmediatamente ejecuta un comando `DELETE`** contra la llave legada (`dictamen:...`) en caso de que existiera, para no duplicar costos de almacenamiento.
4. Actualiza la nueva tabla relacional `kv_sync_status` en D1, estampando el flag `en_source = 1`, dejando un trazado de auditoría perfecto por cada fila.

**Estado Actual:** El Workflow KVSync está corriendo actualmente en producción, purificando silenciosamente todo el repositorio KV.

## Análisis de Registros Totales

- **Físicamente en KV (`DICTAMENES_SOURCE`):** ~258,515 archivos crudos (provenientes de MongoDB).
- **Indexados Maestros en D1:** 85,947 filas en base de datos.
  - Origen `mongoDb`: 84,973
  - Origen `worker_cron_crawl`: 974 (Capturados por el cron moderno).

> **Aviso de Arquitectura:** Existe un delta de ~173,000 dictámenes que están almacenados físicamente en KV pero que **aún no han sido insertados** en D1. El sistema actual está priorizando purificar y enriquecer la cohorte de los 84,973 que ya conoce D1. Cuando este proceso finalice, se podrá orquestar un volcado del resto.
