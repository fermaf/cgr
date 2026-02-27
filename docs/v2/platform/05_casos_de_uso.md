# 05 - Casos de Uso Avanzados: Escenarios Reales

Este documento presenta escenarios técnicos detallados que demuestran la potencia del motor de **CGR-Platform**. Se incluyen ejemplos de payloads JSON, comandos CURL y descripción de los cambios de estado interno.

---

## Escenario A: Pipeline de Ingesta y Enriquecimiento "Zero-Touch"
**Contexto**: Ingesta automática de un dictamen relevante sobre probidad administrativa.

1. **Detección Automática**: El trigger `scheduled` detecta el dictamen `054321N24`.
2. **Ingesta (JSON Crudo)**:
   - El sistema almacena en KV (`DICTAMENES_SOURCE`) el objeto original.
   - **D1 Entry**: `id: '054321N24', estado: 'ingested'`.
3. **Inferencia Cognitiva (Mistral AI)**:
   - **Input**: Texto del dictamen (truncado a 10k tokens si es necesario).
   - **Prompt**: Clasificador legal chileno.
   - **Output (AI Reflection)**:
     ```json
     {
       "extrae_jurisprudencia": {
         "titulo": "Incompatibilidad de cargos en el Sector Salud Municipal",
         "resumen": "Se analiza si un funcionario puede ejercer simultáneamente...",
         "analisis": "El dictamen establece un nuevo precedente basado en la ley...",
         "etiquetas": ["salud", "municipios", "probidad"],
         "genera_jurisprudencia": true
       },
       "booleanos": { "relevante": true, "nuevo": true, "boletin": true }
     }
     ```
4. **Persistencia Final**: El estado cambia a `vectorized` tras subir los embeddings a Pinecone con metadata v2.

---

## Escenario B: Re-proceso Masivo por Cambio de Modelo (v1 a v2)
**Contexto**: Se actualiza el estándar de metadata para incluir fuentes legales detalladas. Se requiere actualizar 500 registros antiguos.

1. **Identificación**: El administrador consulta D1 para buscar registros fuera de norma.
   ```sql
   SELECT id FROM dictamenes d 
   LEFT JOIN pinecone_sync_status s ON d.id = s.dictamen_id 
   WHERE s.metadata_version < 2 LIMIT 100;
   ```
2. **Ejecución de Sync-Mass**:
   ```bash
   curl -X POST "https://api.cgr.cl/v1/dictamenes/sync-vector-mass" \
     -d '{"limit": 100}' -H "x-admin-token: SECRET"
  ```
3. **Lógica Interna**:
   - Por cada ID, el Worker recupera el `enriquecimiento` existente en D1.
   - Re-genera el texto para embeber: `"Título: ... Resumen: ... Análisis: ..."`.
   - Realiza el `upsert` en Pinecone inyectando el nuevo schema `v2`.
   - Actualiza `pinecone_sync_status.metadata_version = 2`.

---

## Escenario C: Búsqueda Híbrida con Filtros Avanzados (Frontend)
**Contexto**: Un usuario busca dictámenes sobre "Educación" filtrando solo aquellos que sean "Relevantes" según la IA.

1. **Consulta al Worker**:
   ```bash
   curl "https://api.cgr.cl/v1/dictamenes?q=educacion&limit=10"
   ```
2. **Procesamiento de Búsqueda**:
   - **Paso 1**: Búsqueda semántica en Pinecone. La metadata en los vectores permite filtrar por `relevante: true` en el índice.
   - **Paso 2**: El motor vectorial retorna IDs.
   - **Paso 3**: El Worker cruza esos IDs con D1 para traer el `numero` y `anio` actualizados.
3. **Respuesta Unificada**:
   ```json
   {
     "data": [
       {
         "id": "099887N23",
         "materia": "Estatuto docente...",
         "origen_busqueda": "vectorial",
         "match_score": 0.89
       }
     ]
   }
   ```

---

## Escenario D: Resolución de Incidente Network (Skill Recovery)
**Contexto**: Durante el scraping, la web de la CGR bloquea la IP del Worker.

1. **Excepción**: El Workflow captura `FetchError: Connection Refused`.
2. **Skill Trigger**: El `IncidentRouter` detecta falla de conectividad y activa el skill `cgr_network_verify`.
3. **Diagnóstico**: El Skill intenta acceder a una URL pública de la CGR (`/health`). Si falla, concluye que es un bloqueo de IP o caída del servicio externo.
4. **Log & Alerta**: Se registra en `skill_events`:
   ```json
   {
     "incident_type": "EXTERNAL_SERVICE_DOWN",
     "severity": "HIGH",
     "diagnostic_output": "CGR Portal is returning 403 Forbidden. Recommended action: Wait 1h or rotate worker route."
   }
   ```
5. **Auto-Retry**: El Workflow entra en pausa exponencial gracias a las políticas de reintento de Cloudflare.

---

## Escenario E: Analítica Normativa con Snapshot + Cache
**Contexto**: Equipo legal requiere identificar qué normas concentran más conflictividad durante 2024-2025, sin degradar el rendimiento del buscador principal.

1. **Materialización previa**:
   ```bash
   curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/analytics/refresh" \
     -H "Content-Type: application/json" \
     -H "x-admin-token: YOUR_TOKEN_HERE" \
     -d '{ "yearFrom": 2024, "yearTo": 2025, "limit": 1200 }'
   ```
2. **Consulta de heatmap**:
   ```bash
   curl -X GET "https://cgr-platform.abogado.workers.dev/api/v1/analytics/statutes/heatmap?yearFrom=2024&yearTo=2025&limit=25"
   ```
3. **Comportamiento interno**:
   - El worker intenta resolver desde cache KV (`DICTAMENES_PASO`).
   - Si no hay cache, lee snapshot más reciente en D1.
   - Si no existe snapshot, hace query live y cachea el resultado.
4. **Uso de tendencias por materia**:
   ```bash
   curl -X GET "https://cgr-platform.abogado.workers.dev/api/v1/analytics/topics/trends?yearFrom=2024&limit=20"
   ```
5. **Resultado esperado**:
   - Respuesta con bloque `meta.source` (`snapshot` o `live`).
   - Reducción de consultas analíticas directas sobre tablas base.

---

## Escenario F: Navegación de Linaje de un Dictamen
**Contexto**: Analista necesita confirmar si un dictamen histórico fue citado por pronunciamientos posteriores.

1. **Consulta de linaje**:
   ```bash
   curl -X GET "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/012345N24/lineage" \
     -H "Accept: application/json"
   ```
2. **Salida esperada**:
   - `rootId`: ID solicitado.
   - `nodes`: lista con metadata mínima (`id`, `anio`, `fecha_documento`, `materia`).
   - `edges`: relaciones clasificadas en:
     - `outgoing_reference` (dictámenes referidos por el root).
     - `incoming_reference` (dictámenes que referencian al root).
3. **Valor operacional**:
   - Permite detectar rápidamente riesgo de jurisprudencia desactualizada.
   - Sirve como base para la siguiente evolución de grafo navegable (depth > 1).
