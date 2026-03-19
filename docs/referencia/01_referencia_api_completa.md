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

---

## 🔍 2. Búsqueda Híbrida Inteligente

El núcleo del sistema de consulta para el Frontend.

### `GET /api/v1/dictamenes`
El orquestador de búsqueda. Resuelve el gran problema de los LLM: "Encontrar documentos que no tienen la palabra exacta pero significan lo mismo". No consulta directamente a D1; primero delega la vectorización del prompt a Cloudflare AI (Pinecone) para encontrar proximidad matemática por cosenos y, solo si falla o no hay índice vectorial, aplica una heurística *Fallback* de `LIKE %text%` contra D1.

#### Parámetros Query
| Parámetro | Default | Razón de ser / Caso de uso (Ingeniería Inversa) |
| :--- | :--- | :--- |
| `q` | `''` | El texto, párrafo o idea. Pinecone convierte este texto a 1024 dimensiones. |
| `page` | `1` | Paginador. El tamaño de fragmento (`limit` interno) está congelado intencionalmente en `10` para prevenir abusos de *data scraping* en una de las rutas públicas más costosas en términos de ancho de banda. |

#### Ejemplo CURL
```bash
# Caso de uso: Búsqueda del concepto de probidad, no de la palabra probidad.
curl "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes?q=uso+indebido+vehiculos+fiscales+por+alcaldes&page=1"
```

### `GET /api/v1/dictamenes/:id/lineage`
Genera el *"Grafo de Linaje Doctrinal"*. Evalúa la tabla de aristas `dictamen_referencias`.

#### Argumentación de Diseño
En lugar de extraer solo "a quién cita este dictamen", este endpoint extrae en modo bidireccional (quién me cita + a quién cito). Esto te permite construir árboles de precedencia jurídica para validar si la doctrina de un dictamen viejo ha sido revocada hoy.

---

## ⚙️ 3. Orquestadores y Operaciones de Reparación (Mutación)

Endpoints dedicados a mantener la higiene del Datalake. Requieren el Token protegido.

### `POST /api/v1/dictamenes/batch-enrich`
Dispara el motor de Mistral AI asíncronamente a través del `BackfillWorkflow`. Esta ruta es la encargada de transformar un JSON muerto en Conocimiento Estructurado (Atributos LLM, Fuentes, Booleanos).

#### Parámetros del Body (JSON)
| Parámetro | Default | Razón de ser / Riesgos de Operación |
| :--- | :--- | :--- |
| `batchSize` | `50` | Define cuántos registros se envían al Worker a procesar en una sola corrida. Cloudflare Workers mata la ejecución al cabo de cierto tiempo de CPU. Si lo subes a `500`, el Workflow reventará por *Memory Exceeded* o Timeout. Mantenlo en `50` o `100`. |
| `delayMs` | `500` | Tiempo de respiración (en milisegundos) inyectado entre las llamadas a Mistral AI. Mistral (Cloudflare AI Gateway) expulsa *Rate Limits* (Error 429) si llamas a inferencia masiva agresivamente. Al situarlo en `500`, limitas la inferencia a 2 requests por segundo estabilizando la ingesta sin quebrar el pipeline. |
| `recursive` | `true` | **El parámetro MÁS vital de orquestación**. Si es `true`, al terminar el lote de 50, el Worker se inspecciona a sí mismo; si nota que quedan más registros en gris, levanta **otra instancia clonada de sí mismo** en Cloudflare y sigue consumiendo. Si lo pasas en `false`, procesa solo 1 lote de 50 y se apaga (Ideal para depurar el proceso en Staging sin quemar 5.000 tokens probando un Prompt). |

#### Ejemplo CURL
```bash
# Caso de Uso: Has actualizado el Prompt de Mistral y necesitas borrar la Doctrina y probar el impacto SOLO en los 5 primeros fallos de la base.
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/batch-enrich" \
     -H "x-admin-token: <<TU_TOKEN_SECRETO>>" \
     -H "Content-Type: application/json" \
     -d '{
           "batchSize": 5,
           "delayMs": 1000,
           "recursive": false
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
