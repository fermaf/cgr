# 13 - Resincronización Vectorial de Pinecone

Este documento detalla los procedimientos y endpoints disponibles para sincronizar metadatos y vectores entre la base de datos D1/KV y el índice vectorial de Pinecone, asegurando que el estándar **Gold v2** se mantenga en todo el universo de dictámenes.

---

## 🏗️ 1. Estándar de Metadatos (v2)

Cualquier sincronización hacia Pinecone debe incluir exactamente 22 claves de metadatos, normalizadas mediante la función `normalizePineconeMetadata` en `src/clients/pinecone.ts`. 

### Campos Clave:
- **`descriptores_AI`**: Etiquetas generadas por Mistral.
- **`descriptores_originales`**: Etiquetas provenientes de la fuente CGR.
- **`u_time`**: Timestamp Unix calculado a partir de la fecha del documento para ordenamiento temporal en búsquedas.
- **`analisis`**: Contenido enriquecido que sirve de base para la vectorización.

---

## 🚀 2. Endpoints de Sincronización

### 2.1 Sincronización Individual (`sync-vector`)
Utilizado para actualizar un dictamen específico si se detecta una discrepancia puntual. No vuelve a ejecutar el LLM; usa los datos almacenados en D1/KV.

- **Endpoint**: `/api/v1/dictamenes/:id/sync-vector`
- **Método**: `POST`

#### Ejemplo CURL
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/012345N24/sync-vector" \
  -H "x-admin-token: <TOKEN>"
```

---

### 2.2 Sincronización Masiva (`sync-vector-mass`)
Diseñado para migraciones de esquema de metadatos o correcciones globales. Busca dictámenes en estado `vectorized` cuya versión de metadata sea inferior a 2.

- **Endpoint**: `/api/v1/dictamenes/sync-vector-mass`
- **Método**: `POST`
- **Body JSON**:
  - `limit`: Cantidad de registros por lote (Sugerido: `50-100` debido a límites de tiempo de ejecución del Worker).

#### Ejemplo CURL
```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/sync-vector-mass" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: <TOKEN>" \
  -d '{ "limit": 100 }'
```

---

## 🛠️ 3. Consideraciones Técnicas (Integrated Inference)

El sistema utiliza **Pinecone Integrated Inference**, lo que significa que el Worker envía texto plano y Pinecone genera el embedding internamente.

> [!IMPORTANT]
> **Límites de Batch**: 
> Aunque Pinecone soporta bulk upserts de hasta 1000 vectores normales, cuando se usa **Integrated Inference** el límite es de **96 registros por solicitud HTTP**. El código actual procesa los upserts de forma secuencial pero el endpoint masivo permite iterar sobre lotes definidos.

---

## 📊 4. Verificación de Estado

La tabla `pinecone_sync_status` en D1 registra la versión y fecha del último éxito:

```sql
SELECT metadata_version, count(*) 
FROM pinecone_sync_status 
GROUP BY metadata_version;
```

---

[Referencia: 00 - Guía de Estándares para Agentes LLM](file:///home/bilbao3561/github/cgr/docs/v2/platform/00_guia_estandares_agentes_llm.md)
