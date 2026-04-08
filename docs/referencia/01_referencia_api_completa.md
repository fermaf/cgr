# 01 - Referencia de API Completa (Deep Dive v2.0)

> [!IMPORTANT]
> **Tipo Diátaxis**: Referencia. 
> Este documento no es una simple lista de URLs. Es la especificación técnica profunda y razonada del contrato de toda la API de **CGR-Platform**. Aquí reside el "por qué" de cada parámetro, diseñado para arquitectos, ingenieros de QA y perfiles que necesiten realizar ingeniería inversa u operaciones masivas.

### Consideraciones Globales
- **Base URL (PROD)**: `https://cgr-platform.abogado.workers.dev`
- **Headers Requeridos**:
  - `Content-Type: application/json`
  - `Accept: application/json`
  - `x-admin-token: <<TU_TOKEN_SECRETO>>` *(Estrictamente obligatorio para operaciones state-mutating mediante POST)*.

---

## 📊 1. Inteligencia Analítica y Snapshotting (Lectura Estructurada)

Endpoints diseñados para alimentar Dashboards gerenciales evitando el sobrecoste de consultas OLAP en un entorno Serverless.

### `GET /api/v1/analytics/statutes/heatmap`
Retorna una matriz de incidencias normativas (qué artículos/leyes se rompen/citan más cada año).

#### Argumentación de Diseño
Las consultas de agregación masiva (`COUNT`, `GROUP BY`) bloquean la base de datos D1 en horario de alto tráfico. Por ello, este endpoint no consulta la base de datos en vivo de forma predeterminada, sino que lee de un "Snapshot" materializado asíncronamente en KV. 

#### Parámetros Query
| Parámetro | Default | Razón de ser / Caso de uso (Ingeniería Inversa) |
| :--- | :--- | :--- |
| `limit` | `50` | Previene _Payload too large_ y excede tiempos de ejecución del Worker. Úsalo en `500` si vas a construir un gráfico de cola larga. Rango: 1-500. |
| `yearFrom` | `null` | Corta el cubo de análisis. Crucial si buscas aislar un cambio de jurisprudencia (ej. "Solo desde 2018"). |
| `yearTo` | `null` | Igual a `yearFrom`, conforma el marco temporal (Cota superior). |
| `live` | `false` | **Peligroso pero vital**. Al pasar `?live=true`, el sistema ignora la caché KV y ejecuta el recálculo analítico O(N^2) directo contra D1. Úsalo exclusivamente si acabas de forzar una re-ingesta masiva y necesitas validar la inserción inmediatamente sin esperar 24h al Cronjob. |

#### Ejemplo CURL
```bash
# Caso de uso: Auditor de datos que necesita las proporciones en tiempo real post-ingesta limitando a 10 resultados para no ahogar D1.
curl "https://cgr-platform.abogado.workers.dev/api/v1/analytics/statutes/heatmap?yearFrom=2020&yearTo=2025&limit=10&live=true"
```

### `POST /api/v1/analytics/multidimensional`
Endpoint maestro del **Centro de Comando**. Realiza un barrido transversal de todas las dimensiones operativas.

#### Argumentación de Diseño
En lugar de disparar 6 peticiones HTTP por separado desde el Dashboard (Volumetría, Semántica, etc.), este endpoint único centraliza la computación en el Worker para reducir la latencia de red y entregar un objeto JSON unificado.

#### Cuerpo de Petición (JSON)
- `{}` (Cuerpo vacío para resultados generales).

#### Ejemplo CURL
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/analytics/multidimensional" \
     -H "x-admin-token: <<TU_TOKEN>>"
```

---

## 🔍 2. Búsqueda Híbrida Inteligente

El núcleo del sistema de consulta para el Frontend.

### `GET /api/v1/dictamenes`
El orquestador de búsqueda maestro. Resuelve el gran desafío del enrutamiento cognitivo:
1. **Detección de Patrones Exactos (Shortcut)**: Si el término ingresado ("q") coincide con una estructura alfanumérica típica de dictamen (ej. `[A-Z0-9]*[0-9]+N[0-9]+` o un número `>3` dígitos), el orquestador aborta la inferencia y aplica un `LIKE %id%` directo a la base relacional SQL de D1. Esto previene que el LLM intente encontrar semántica en un código y obligue a resultados directos al usuario.
2. **Inferencia Semántica Vectorial**: Si no es un patrón exacto, delega la vectorización del texto a Cloudflare AI (Pinecone) encontrando documentos matemáticamente próximos por coseno.
3. **Fallback Resiliente**: Si Pinecone cae o no devuelve resultados, aplica la heurística final SQL `LIKE %text%` contra D1.

#### Post-procesamiento Estético (Fase 12)
Para garantizar una interfaz limpia ("El Librero"), el orquestador aplica una limpieza por Regex a los campos `materia` y `resumen` antes de servirlos al frontend. Se eliminan automáticamente los prefijos estructurales de vectorización como `^Título:` y se neutralizan los separadores internos `Resumen:`, permitiendo que el texto fluya de manera natural sin etiquetas técnicas visibles para el usuario final.

#### Parámetros Query
| Parámetro | Default | Razón de ser / Caso de uso (Ingeniería Inversa) |
| :--- | :--- | :--- |
| `q` | `''` | Búsqueda semántica base. Pinecone convierte este texto a 1024 dimensiones. |
| `page` | `1` | Paginador. Congelado a 10 resultados por página. |
| `year` | `null` | Filtro exacto por año de emisión. Crucial para reducir el espacio de búsqueda vectorial y acelerar la consulta SQL. |
| `materia` | `null` | Coincidencia parcial (`LIKE`) de la materia principal del dictamen. Se alimenta del autocompletado en el frontend. |
| `division` | `null` | Filtrado estricto por la división jurídica o área responsable de la CGR. |
| `tags` | `null` | Búsqueda por etiquetas inteligentes inyectadas vía motor de enriquecimiento LLM. |
| `relaciones_causa` | `[]` | **Nuevo (Retro-Update)**: Array inyectado con los dictámenes que originaron el estado actual (ej: quién lo complementó). |

#### Ejemplo Respuesta (Fragmento)
```json
{
  "id": "E85862N25",
  "materia": "...",
  "relaciones_causa": [
    {
      "origen_id": "008890N20",
      "tipo_accion": "complementado"
    }
  ]
}
```

#### Ejemplo CURL
```bash
# Caso de uso: Búsqueda detallada usando multiplicidad de filtros avanzados
curl "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes?q=probidad&year=2024&materia=Urbanismo&page=1"
```

### `GET /api/v1/divisions`
Expone el catálogo autorizado y depurado de divisiones o áreas técnicas.

#### Argumentación de Diseño
En los sistemas transaccionales legacy de Contraloría, existen incontables registros con el área `División No Identificada...` o `Sin División Asignada...`. Este endpoint garantiza a nivel de red que el Frontend de CGR.ai jamás renderizará opciones inútiles, filtrando las excepciones directamente en la query SQL para entregar el mapeo de `codigo` y `nombre_completo`.

---

### `GET /api/v1/dictamenes/:id/lineage`
Genera el *"Grafo de Linaje Doctrinal"*. Evalúa la tabla de aristas `dictamen_referencias`.

#### Argumentación de Diseño
En lugar de extraer solo "a quién cita este dictamen", este endpoint extrae en modo bidireccional (quién me cita + a quién cito). Esto te permite construir árboles de precedencia jurídica para validar si la doctrina de un dictamen viejo ha sido revocada hoy. Incluye la metadata de `relacion_juridica_causa` mapeada desde el Dependency Graph.

---

## ⚙️ 3. Orquestadores y Operaciones de Reparación (Mutación)

Endpoints dedicados a mantener la higiene del Datalake. Requieren el Token protegido.

### `POST /api/v1/dictamenes/batch-enrich`
Dispara el `EnrichmentWorkflow`. Esta ruta ejecuta exclusivamente enrichment con LLM y persistencia en KV/D1. No hace vectorización.

#### Parámetros del Body (JSON)
| Parámetro | Default | Razón de ser / Riesgos de Operación |
| :--- | :--- | :--- |
| `batchSize` | `50` | Define cuántos registros se envían al Worker a procesar en una sola corrida. Cloudflare Workers mata la ejecución al cabo de cierto tiempo de CPU. Si lo subes a `500`, el Workflow reventará por *Memory Exceeded* o Timeout. Mantenlo en `50` o `100`. |
| `delayMs` | `500` | Tiempo de respiración (en milisegundos) inyectado entre las llamadas a Mistral AI. Mistral (Cloudflare AI Gateway) expulsa *Rate Limits* (Error 429) si llamas a inferencia masiva agresivamente. Al situarlo en `500`, limitas la inferencia a 2 requests por segundo estabilizando la ingesta sin quebrar el pipeline. |
| `recursive` | `true` | **El parámetro MÁS vital de orquestación**. Si es `true`, al terminar el lote de 50, el Worker se inspecciona a sí mismo; si nota que quedan más registros en gris, levanta **otra instancia clonada de sí mismo** en Cloudflare y sigue consumiendo. Si lo pasas en `false`, procesa solo 1 lote de 50 y se apaga (Ideal para depurar el proceso en Staging sin quemar 5.000 tokens probando un Prompt). |
| `allowedStatuses` | `["ingested","ingested_importante","ingested_trivial"]` | Permite segmentar la cola de enrichment. Úsalo para correr solo 2026, solo importantes o solo triviales, según la cuota disponible por proveedor. |

#### Ejemplo CURL
```bash
# Caso de Uso: Has actualizado el Prompt de Mistral y necesitas borrar la Doctrina y probar el impacto SOLO en los 5 primeros fallos de la base.
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/batch-enrich" \
     -H "x-admin-token: <<TU_TOKEN_SECRETO>>" \
     -H "Content-Type: application/json" \
     -d '{
           "batchSize": 5,
            "delayMs": 1000,
           "recursive": false,
           "allowedStatuses": ["ingested_importante"]
         }'
```

---

### `POST /api/v1/dictamenes/batch-vectorize`
Dispara el `VectorizationWorkflow`. Esta ruta solo procesa dictámenes en `enriched_pending_vectorization` y los sube a Pinecone.

#### Parámetros del Body (JSON)
| Parámetro | Default | Razón de ser / Riesgos de Operación |
| :--- | :--- | :--- |
| `batchSize` | `50` | Controla cuántos dictámenes enriquecidos se intentan vectorizar por corrida. |
| `delayMs` | `500` | Introduce un respiro entre upserts para no castigar la cuota de Pinecone. |
| `recursive` | `true` | Si es `true`, el workflow sigue consumiendo lotes pendientes hasta vaciar la cola o toparse con cuota. |

#### Ejemplo CURL
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/batch-vectorize" \
     -H "x-admin-token: <<TU_TOKEN_SECRETO>>" \
     -H "Content-Type: application/json" \
     -d '{
           "batchSize": 25,
           "delayMs": 750,
           "recursive": true
         }'
```

---

### `POST /api/v1/jobs/repair-nulls`
Reparador quirúrgico. Muchos registros históricos descargados desde la CGR vienen con huecos estructurales (no traen la URL original o viene mal codificada su División). En vez de re-descargarlo completo, este endpoint lee la copia inmutable cruda resguardada en Cloudflare KV, parcha el campo ausente y devuelve los datos a D1.

#### Parámetros Query
| Parámetro | Default | Razón de ser / Caso de uso |
| :--- | :--- | :--- |
| `limit` | `500` | Dado que esto no llama a LLMs, es barato. Puede enviar lotes de 500 a la Cola `repair-nulls-queue`. |
| `id` | `null` | En vez de buscar masivamente, permite un "hot-fix" indicativo (apuntar el láser a un registro roto específico). |

#### Ejemplo CURL
```bash
# Caso de Uso: Reporte de usuario de un PDF roto para el fallo E0921N84. Disparas el láser directamente.
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/jobs/repair-nulls?id=E0921N84" \
     -H "x-admin-token: <<TU_TOKEN_SECRETO>>"
```
