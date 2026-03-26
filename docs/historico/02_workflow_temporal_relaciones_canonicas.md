# Workflow Temporal de Relaciones Canonicas

## Objetivo

Este avance implementa un workflow temporal para reconstruir relaciones entre dictamenes desde evidencia real disponible en produccion, priorizando extraccion determinista antes de usar LLM.

El workflow no modifica `atributos_juridicos` ni intenta cerrar doctrina definitiva. Su objetivo en esta etapa es poblar `dictamen_relaciones_juridicas` y `dictamen_relaciones_huerfanas` con una estrategia auditable y de bajo riesgo.

## Componentes implementados

- `cgr-platform/src/lib/relationsCanonical.ts`
  - Extrae candidatos canonicos desde tres canales:
    - `source["accion"]` o `source["acción"]`
    - `source.is_accion`
    - `referencias` del payload enriquecido
  - Normaliza numero y anio del dictamen destino.
  - Tipos canonicos actuales:
    - `aplicado`
    - `confirmado`
    - `complementado`
    - `aclarado`
    - `reconsiderado`
    - `reactivado`
    - `alterado`

- `cgr-platform/src/workflows/canonicalRelationsWorkflow.ts`
  - Lee lotes desde D1.
  - Usa `DICTAMENES_SOURCE` como fuente de verdad.
  - Soporta las dos formas de key observadas para KV source:
    - `ID`
    - `dictamen:ID`
  - Inserta relaciones idempotentes con `INSERT OR IGNORE`.
- Soporta rerun dirigido por `dictamenIds` para regenerar desde cero las aristas canonicas de un subconjunto sin reejecutar todo el universo.
  - Marca huerfanas cuando encuentra evidencia pero no logra resolver `destino_id`.
  - Permite recursividad por lotes.

- `cgr-platform/src/index.ts`
  - Expone `POST /api/v1/trigger/canonical-relations`.

- `cgr-platform/wrangler.jsonc`
  - Declara binding `CANONICAL_RELATIONS_WORKFLOW` en local, staging y production.

## Por que es temporal

La auditoria en produccion mostro que:

- `dictamen_relaciones_juridicas` tiene cobertura muy baja frente al universo con flags doctrinales.
- `source["accion"]` y `source.is_accion` tienen mucha mas evidencia que la hoy promovida a relaciones materializadas.
- existen contradicciones reales entre verbo juridico y flags actuales.

Por eso este workflow no debe considerarse version final del modelo doctrinal. Es un paso operativo para medir cobertura real con datos productivos.

## Validacion realizada

### Produccion auditada via MCP

Se valido acceso real a:

- D1 `cgr-dictamenes`
- KV `dictamenes_source`
- KV `dictamenes_paso`

Hallazgos usados para justificar este workflow:

- `dictamenes`: 86299
- `dictamen_referencias`: 19120
- `dictamen_relaciones_juridicas`: 598
- dictamenes con al menos un flag doctrinal: 30193
- dictamenes con flags pero sin relacion materializada: 29491

Muestras relevantes observadas en produccion:

- alta presencia de `source["accion"]`
- alta presencia de `source.is_accion`
- baja materializacion actual en `dictamen_relaciones_juridicas`

### Validacion tecnica local

Se ejecuto:

```bash
npx tsc -p cgr-platform/tsconfig.json --noEmit
```

Resultado:

- no quedaron errores nuevos atribuibles al workflow canonico
- persisten errores previos del repo en:
  - `scripts/debug_sync.ts`
  - `test_pinecone_type.ts`
  - `unit_test_pinecone.ts`

Tambien se ejecuto:

```bash
cd cgr-platform
npx wrangler types
npx wrangler types --check
```

Resultado:

- `worker-configuration.d.ts` quedo sincronizado con `wrangler.jsonc`
- el binding `CANONICAL_RELATIONS_WORKFLOW` quedo reflejado en tipos generados

## Como ejecutar el primer ensayo controlado

Desde `cgr/cgr-platform`:

```bash
curl -X POST http://127.0.0.1:8787/api/v1/trigger/canonical-relations \
  -H 'Content-Type: application/json' \
  -d '{
    "limit": 50,
    "offset": 0,
    "recursive": false,
    "onlyFlagged": true
  }'
```

En staging o production, enviar `x-admin-token` con `INGEST_TRIGGER_TOKEN`.

Parametros recomendados para el primer ensayo:

- `limit = 50`
- `offset = 0`
- `recursive = false`
- `onlyFlagged = true`

## Como validar el ensayo

Despues de correr un lote pequeno, revisar en D1:

```sql
SELECT COUNT(*) FROM dictamen_relaciones_juridicas;
SELECT COUNT(*) FROM dictamen_relaciones_huerfanas;
```

Y revisar una muestra de dictamenes procesados:

```sql
SELECT *
FROM dictamen_relaciones_juridicas
WHERE origen_extracccion LIKE 'canonical_v1_%'
ORDER BY rowid DESC
LIMIT 50;
```

Ademas, contrastar algunos casos contra `DICTAMENES_SOURCE` y verificar:

- si el verbo detectado coincide con la accion canonica
- si el `destino_id` corresponde al dictamen citado
- si las huerfanas responden a referencias irresolubles o a fallas de matching por `numero/anio`

## Visibilidad en Frontend

Desde este avance, la revision ya no depende solo de D1 o de logs:

- `GET /api/v1/dictamenes/:id` devuelve `relaciones_causa` y `relaciones_efecto` en `meta`.
- `frontend/src/pages/DictamenDetail.tsx` renderiza un panel de relaciones canonicas entrantes y salientes.
- Esto permite revisar el progreso del backfill directamente desde la UI del dictamen.
## Siguiente paso recomendado

Antes de usar Mistral, cerrar esta secuencia:

1. Ejecutar lotes pequenos y medir cobertura incremental.
2. Medir precision manual sobre una muestra de relaciones insertadas.
3. Refinar matching de destino en D1 para reducir huerfanas falsas.
4. Recien despues introducir LLM para los ambiguos, multi-verbo o contradictorios.

## Como retomar este hilo si se pierde el contexto

Reanudar desde estos archivos:

- `cgr-platform/src/lib/relationsCanonical.ts`
- `cgr-platform/src/workflows/canonicalRelationsWorkflow.ts`
- `cgr-platform/src/index.ts`
- `cgr-platform/wrangler.jsonc`
- `cgr-platform/worker-configuration.d.ts`
- `docs/historico/02_workflow_temporal_relaciones_canonicas.md`

Recordatorio operativo:

- ignorar cambios no consolidados en commit previo; tratarlos como ruido
- usar produccion via MCP como fuente principal para auditoria
- no reactivar el paradigma historico anterior sin nueva validacion empirica
