# 11 - Comportamiento de Workflows de Ingesta y Recuperación de Dictámenes

Este documento sirve como guía explicativa y de tareas sobre los mecanismos internos de la CGR-Platform para poblar la base de datos de dictámenes, detallando la interacción entre los endpoints de recuperación, el sistema de Workflows recursivos (Backfill) y el scrapeo de dependencias directas.

## 🔗 1. Flujo en Cascada: Ingesta → Backfill

Uno de los comportamientos más importantes (y frecuentemente sorpresivo) de la plataforma es la **recursividad automática** entre la inserción de nuevos dictámenes y la asignación de IA. 

Cuando insertamos o rescatamos dictámenes de la fuente externa utilizando cualquiera de los mecanismos de recolección (`/api/v1/dictamenes/crawl/range` o `/ingest/trigger`), el sistema activa la siguiente cadena de eventos:

1. **IngestWorkflow**: Va al buscador oficial de la CGR y descarga el JSON original (conocido como *raw source*).
2. **Inserta a KV y D1**: Carga el JSON crudo de la CGR directamente en el Worker de Cloudflare KV (`DICTAMENES_SOURCE`) y hace un primer registro en la base SQLite (D1) asignando el estado inicial `ingested`.
3. **Disparador del Backfill**: Inmediatamente tras finalizar una sesión de ingresos, el `IngestWorkflow` ordena al sistema despertar a su primo, el `BackfillWorkflow`.

### 🔄 La Recursión del BackfillWorkflow

Una vez provocado, el `BackfillWorkflow` cumple la función de la IA (Mistral 2512): analiza metadatos y extrae etiquetas clave para vectorizar el documento en Pinecone. 

> [!IMPORTANT]
> **Comportamiento Recursivo**: El `BackfillWorkflow` no solo analizará los dictámenes recién ingresados, sino que internamente ejecutará la consulta `listDictamenIdsParaProcesar` sobre toda la tabla D1.
> Mientras encuentre **CUALQUIER** dictamen histórico abandonado en estado `ingested` o `error` (o cuya versión del LLM esté desfasada), procesará el lote y se llamará **a sí mismo de manera recursiva** una y otra vez.
> 
> **Control de Recursividad (v2.2)**: Es posible desactivar este comportamiento automático enviando `"recursive": false` en el body del endpoint `/api/v1/dictamenes/batch-enrich`. Esto permite procesar un único lote de prueba (ej: validación de API Key o prompt) sin desencadenar el barrido masivo del catálogo.

---

## 🧐 2. Resolución de Discrepancias ("Truly Missing Dictamenes")

Cuando auditas la sincronización y notas dictámenes que se perdieron en la importación original  —también conocidos como "Truly Missing"— o necesitas forzar una actualización profunda de uno que quedó trunco, surgen dos caminos:

### Camino Equivocado: Reprocesamiento Interno
Usar `/api/v1/dictamenes/:id/re-process` asume erróneamente que la plataforma ya cuenta con la información base dentro de sí misma. 
Este endpoint extrae el payload directo a la base de datos interna `DICTAMENES_SOURCE` en KV.
- **Si el dictamen nunca llegó a KV (falla 404)**, el sistema estrellará lanzando un error "No se encontró JSON en KV" dejándolo bloqueado en estado de `error`.

### Camino Correcto: IngestTrigger (Scraping Forzado)
Para decirle al sistema: *"Olvida todo lo que crees saber, ve a Internet y trae el dictamen como si fueras un usuario"*, se debe usar **`/ingest/trigger`**.
Este endpoint invoca el archivo `/src/clients/cgr.ts` que suplantará a un navegador real, resolverá el bloqueo de sesión por *cookies* de la CGR y bajará el payload desde cero. 

```bash
# Script de recuperación individual
curl -X POST "https://cgr-platform.abogado.workers.dev/ingest/trigger" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_TOKEN_HERE" \
  -d '{
    "search": "E121949N25", 
    "limit": 10
  }'
```

---

## 🛡️ 3. Peculiaridades del API "abierto" CGR

El código subyacente interactuando con `https://www.contraloria.cl/apibusca/search/dictamenes` tiene consideraciones vitales documentadas para ingenieros futuros:

1. **Autenticación Basada en Sesión Activa**: A diferencia de las APIs modernas sin estado (`stateless`), la API CGR exige una co-conexión de cookie previa.
   - Antes de llamar a `apibusca/search/dictamenes`, la plataforma **DEBE** hacer una petición ciega a la página del buscador frontal (`/web/cgr/buscador`) y robar su encabezado `Set-Cookie`. Este flujo ya está orquestado internamente por el `initCgrSession` en nuestro código.
2. **Dictámenes Huérfanos/Fantasma**: Hay identificaciones de dictámenes (como el `E556488N24`) que fueron mencionados o vinculados alguna vez en la red CGR y guardados en listas, pero cuyas páginas reales y respuestas API internas en la CGR devuelven 0 resultados (`hits: []`). Si el sistema devuelve error tras un `ingest/trigger`, es certero que dicho registro no se expone a nivel público.

[Referencia de API para Endpoints Mencionados](./03_referencia_api.md)
