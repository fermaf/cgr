# 02 - Mecanismo de Reparación de Nulos y Reprocesamiento

Esta guía explica cómo funciona y cómo operar el sistema de reparación asíncrona ("null-repair") de la plataforma, que busca mantener la consistencia en registros donde atributos críticos (`division_id`, `old_url`) no se insertaron exitosamente en el flujo primario.

---

## 🏗️ 1. Arquitectura del Sistema (Producción-Consumo)

Para evitar bloqueos en la base de datos D1 y manejar fallos externos (ej. rate-limits), la reparación está desacoplada usando **Cloudflare Queues** (`repair-nulls-queue`).

1. **Productor (Endpoint REST)**: Ejecutas un escaneo sobre D1 para buscar registros incompletos. Por cada bloque, se envían IDs a la cola.
2. **Consumidor (Worker Queue Handler)**: En el archivo `index.ts`, la función exportada procesa los lotes recibidos. 
    - Acude al `DICTAMENES_SOURCE` (KV) para leer el JSON original (el Source of Truth inmutable).
    - Extrae la URL antigua y mapea la división a través de `getOrInsertDivisionId()`.
    - Realiza un `UPDATE` en D1, subsanando el registro.

---

## 🚀 2. Ejecución Operativa de la Reparación

### Disparo Manual (Batch Masivo)
Invoca el endpoint administrativo sin parámetro de ID para encolar registros masivamente. Ignora los registros ya reparados de manera segura.

```bash
# Enviar hasta 1000 registros a la cola de reparación
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/jobs/repair-nulls?limit=1000" \
  -H "x-admin-token: <TU_TOKEN>"
```

### Disparo Puntual (Reparar un ID Singular)
Si estás investigando un incidente específico con un solo dictamen:

```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/jobs/repair-nulls?id=012345N26" \
  -H "x-admin-token: <TU_TOKEN>"
```

---

## 🛠️ 3. Lógica Interna y Manejo de Errores

El Worker consumidor clasifica los resultados fallidos y **altera los orígenes** de importación para distinguirlos en auditorías:

- **Búsqueda Flexible en KV**: Intenta encontrar la llave exacta, o aplica fallback buscando el formato `dictamen:{ID}`.
- **Error - Sin KV (`missing_kv`)**: Si el origen jamás fue guardado en Storage (extremadamente raro si el `IngestWorkflow` funcionó), el registro es marcado irrevocablemente con `origen_importacion = 'missing_kv'` y no se reintenta a menos que se fuerce una nueva ingesta desde cero.
- **Error - Reparación Parcial (`repaired_incomplete`)**: Si el JSON existe en KV pero no contiene los campos esperados (no tiene `old_url` o división inferible), se cambia su bandera de origen a `repaired_incomplete` para que el SQL no lo recoja repetidamente en futuros barridos de `repair-nulls`.

---

## 📊 4. Auditoría y Monitoreo (SQL D1)

Para comprobar el impacto antes y después de encolar reparaciones:

```sql
-- Contar la deuda técnica de registros nulos:
SELECT count(*) as pendientes 
FROM dictamenes 
WHERE division_id IS NULL OR old_url IS NULL;

-- Listar los marcados como defectuosos:
SELECT id, origen_importacion 
FROM dictamenes 
WHERE origen_importacion IN ('missing_kv', 'repaired_incomplete');
```
