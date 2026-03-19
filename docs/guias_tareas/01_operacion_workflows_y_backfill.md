# 01 - Operación de Workflows y Backfill

Esta guía detalla el comportamiento de los Workflows de larga duración en la **CGR-Platform** y cómo interactuar operativamente con ellos a nivel experto, incluyendo el control de recursividad y la recuperación forzada de dictámenes.

---

## 🔗 1. Flujo en Cascada: Ingesta → Backfill

El diseño de la plataforma utiliza **Cloudflare Workflows** para garantizar la ejecución resiliente mediante transiciones de estado. El mayor diferenciador es su **recursividad automática**.

Cuando insertamos o rescatamos dictámenes de la fuente externa utilizando `/api/v1/dictamenes/crawl/range` o un trigger manual, el sistema activa la siguiente cadena de eventos:

1. **IngestWorkflow (`src/workflows/ingestWorkflow.ts`)**: Se conecta al buscador oficial de la CGR y descarga el JSON original (*raw source*).
2. **Persistencia (KV y D1)**: Guarda el JSON crudo en Cloudflare KV (`DICTAMENES_SOURCE`) para inmutabilidad y hace un registro inicial en la base SQLite (D1) asignando el estado `ingested`.
3. **Disparador del Backfill**: Inmediatamente tras finalizar, el IngestWorkflow instancia a su contraparte, el `BackfillWorkflow`.

---

## 🔄 2. La Recursión del BackfillWorkflow

Una vez provocado, el `BackfillWorkflow` cumple el rol de orquestador de Inteligencia Artificial. Llama a Mistral para extraer jurisprudencia, atributos y fuentes legales, guardando luego en Pinecone.

> [!IMPORTANT]
> **Comportamiento Recursivo**: El `BackfillWorkflow` procesa los registros pendientes y al finalizar un lote, se llama **a sí mismo de manera recursiva** si aún quedan registros por procesar en D1 (con estado `ingested` o `error`).
>
> Este comportamiento asegura que el catálogo eventualemente se pondrá al día, pero puede consumir una gran cantidad de tokens si no se controla durante pruebas.

### Control Avanzado de Recursividad
La versión actual de la API permite **desactivar** este bucle enviando el parámetro `recursive: false` al endpoint de enriquecimiento en bloque.

**Endpoint**: `POST /api/v1/dictamenes/batch-enrich`

```bash
# Procesar un único lote de 20 dictámenes sin recursión (Ideal para pruebas de Prompt)
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/batch-enrich" \
  -H "x-admin-token: <TU_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "batchSize": 20,
    "delayMs": 500,
    "recursive": false
  }'
```

---

## 🧐 3. Resolución de Discrepancias ("Truly Missing Dictamenes")

Durante operaciones de auditoría, puedes identificar dictámenes "huérfanos" que nunca se sincronizaron o que quedaron truncos. 

### Camino Correcto: Scraping Forzado
Para obligar al sistema a ignorar cualquier estado interno y consultar la fuente oficial desde cero, NO debes usar reprocesamientos internos. Debes inyectar el identificador a través del trigger de scrapeo.

```bash
# Recuperación individual forzada desde el portal CGR
curl -X POST "https://cgr-platform.abogado.workers.dev/ingest/trigger" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: <TU_TOKEN>" \
  -d '{
    "search": "E121949N25", 
    "limit": 10
  }'
```

### Peculiaridades de la API Abierta CGR
Al intentar rescatar dictámenes, ten en consideración:
1. **Doble Petición de Sesión**: La API oficial (`apibusca/search/dictamenes`) requiere cookies válidas. Nuestro código hace un _pre-flight_ a `/web/cgr/buscador` para capturar la cabecera `Set-Cookie`.
2. **"Fantasmas Jurídicos"**: Existen códigos de dictámenes referenciados en otros textos que **arrojan 0 resultados** en el buscador oficial. Si la plataforma falla repetidamente en ingerir un dictamen específico, verifica su existencia manual en el portal público de la CGR antes de asumir un error sistémico.

---

**Documentación Relacionada**:
- [Arquitectura C4 y Flujos](../explicacion/01_arquitectura_c4_y_flujos.md)
- [Referencia de API](../referencia/01_referencia_api_completa.md)
