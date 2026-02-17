# Documento de Diseño Técnico - Migración 3 (Final)

## 1. Objetivos del Diseño
Optimizar la transferencia de datos masivos (1.2GB, 84,973 registros) desde archivos locales hacia Cloudflare. El objetivo es alcanzar un estado de sincronización total entre un modelo relacional normalizado en D1 (13 tablas) y una capa de acceso rápido en KV, superando las limitaciones de tamaño de mensaje de Cloudflare Queues.

## 2. Flujo de Datos "Turbo" (End-to-End)
1. **Ingesta (Turbo Feeder)**: Script local con concurrencia de 25 hilos que lee el archivo vía streams.
2. **Buffer Dinámico**: Si un registro supera los 128KB (Límite de Queue), el Worker lo desvía temporalmente a KV (`DICTAMENES_SOURCE`) y envía solo la referencia.
3. **Buffer de Cola**: Cloudflare Queue procesa los lotes de forma asíncrona.
4. **Consumo y Reconstrucción**: El Worker consumidor recupera los datos (o la referencia de KV) y ejecuta el mapeo relacional.
5. **Persistencia Relacional**: Distribución normalizada en **13 tablas** D1 mediante transacciones batch.
6. **Mirror KV**: Copia final en `DICTAMENES_SOURCE` para acceso O(1) por ID.

## 3. Manejo de Errores y Resiliencia
- **Large Payload Overflow**: Mitiga el error "Payload Too Large" de las colas mediante almacenamiento temporal.
- **Turbo Concurrency Pool**: Gestiona fallos de red locales reintentando lotes automáticamente.
- **Auditoría de Integridad**: Tabla `auditoria_migracion` y script `audit_missing.ts` para reconciliación total.

## 4. Decisiones de Diseño Clave

### Dual Storage Strategy (D1 + KV)
- **D1 (Relacional)**: Optimizado para búsqueda por abogado, división, año o materia.
- **KV (Blob)**: Almacena el JSON original completo (raw_data) para no saturar D1 con blobs de texto de 400KB.

### Turbo Parallelism
- El uso de un pool de promesas en el feeder permite saturar el binding de la cola, reduciendo el tiempo de migración de horas a pocos minutos.

## 5. Modelo de Datos Relacional (13 Tablas)

### 5.1 Estructura Detallada

#### **Dimensiones (Catalogos)**
- `cat_divisiones`: 6 divisiones de la CGR.
- `cat_abogados`: Catálogo único de abogados (Normalizado UPPER).
- `cat_descriptores`: Tesauro de términos jurídicos (Normalizado LOWER).

#### **Tablas de Hechos y Estado**
- `dictamenes`: Tabla maestra (ID, número, fechas, materia, `es_enriquecido`).
- `atributos_juridicos`: Flags booleanos de carácter jurídico.
- `enriquecimiento`: Análisis LLM (resumen, título generado, análisis).
- `auditoria_migracion`: Estado de la ingesta y errores de proceso.
- `historial_cambios`: Log de auditoría de modificaciones campo a campo.

#### **Relaciones y Detalle**
- `dictamen_abogados`: N:M (Dictamen <-> Abogado).
- `dictamen_descriptores`: N:M (Dictamen <-> Descriptor).
- `dictamen_fuentes_legales`: Referencias a leyes y artículos.
- `dictamen_referencias`: Vínculos a otros dictámenes.
- `dictamen_etiquetas_llm`: Tags de inteligencia artificial.

## 6. Infraestructura
- **D1 DB**: `cgr-dictamenes` (`c391c767-2c72-450c-8758-bee9e20c8a35`).
- **KV Source**: `DICTAMENES_SOURCE` (`ac84374936a84e578928929243687a0b`).
- **KV Paso**: `DICTAMENES_PASO` (Fuente de enriquecimiento).
- **Queue**: `cgr-source-migration-queue`.

---
*Doc. Diseño Técnico v3.0 - Estado Final*
