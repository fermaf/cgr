# 02 - Mecanismo de Reparación de Nulos (Cloudflare Queues Deep Dive)

> [!IMPORTANT]
> **Tipo Diátaxis**: Guía de Tareas Avanzada. Documenta el porqué y el cómo detrás del saneamiento de datos asíncrono, útil para perfiles DevOps que necesitan depurar fallos de conectividad con D1.

---

## 🏗️ 1. Arquitectura Message-Broker (Por Qué Queues)

Cuando un dictamen pasa por la ingesta inicial, debe guardar en D1 su `division_id` y `old_url`. Ocasionalmente, picos de carga en el JSON parse o bloqueos SQLite evitan la inserción correcta de estos metadatos, dejando la fila "Null" (Deuda Técnica).

**El Problema:** Correr un script monolítico `UPDATE FROM KV` en 30.000 filas destrozaría las memorias RAM del worker y bloquearía la base D1 de producción arrojando *SQLITE_BUSY*.
**La Solución:** Desacoplarlo con un patrón Event-Driven (Productor-Consumidor) usando **Cloudflare Queues** (`repair-nulls-queue`).

1. **El Productor HTTP (`POST /api/v1/jobs/repair-nulls?limit=1000`)**: Simplemente hace un `SELECT id WHERE division_id IS NULL LIMIT 1000`. Coge ese arreglo en memoria de [ 'E123', 'E456' ] y hace *Fire and Forget* enviándolos en bloque crudo hacia el sistema de Colas de Cloudflare. Retorna Status 200 casi instantáneamente de cara al administrador.
2. **El Consumidor (`index.ts` Queue Handler)**: Los traga respetando la configuración de `wrangler.jsonc`:
   - `max_batch_size: 100`. Consume de a 100 eventos discretos de la cola en cada ráfaga. Si hay 1000 reparaciones pendientes, levanta al menos 10 instancias separadas que correrán distribuidas en la red de Cloudflare sin colapsar memoria.
   - `max_batch_timeout: 10`. Permite amasar los 100 eventos en 10 segundos como máximo, balanceando la prisa.

---

## 🚀 2. Ejecución Quirúrgica de la Reparación

La plataforma soporta dos vectores de ingreso al Message-Broker para Saneamiento:

### Limpieza Escoba (Barrido Asíncrono Continuo)
Reenvía los N peores casos que el sistema detesta. El worker detectará aquellos que sean *Unrecoverable* (no existen en KV tampoco) y los flaggeará de modo letal como `missing_kv` en la columna `origen_importacion`, previniendo que la escoba vuelva a recogerlos eternamente.

```bash
# Sanea 5.000 registros, mandándolos a la infraestructura de colas
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/jobs/repair-nulls?limit=5000" \
  -H "x-admin-token: <<TU_TOKEN_SECRETO>>"
```

### Limpieza Quirúrgica (ID Targeting)
Útil post-mortem de Ingeniería Inversa. Si detectas un dictamen sin URL a través del dashboard, puedes enviar el ID a la cola. El endpoint inyectará UN (1) evento solitario.

```bash
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/jobs/repair-nulls?id=012345N26" \
  -H "x-admin-token: <<TU_TOKEN_SECRETO>>"
```

---

## 🛠️ 3. Trazabilidad Forense de Estado y Metadatos Muertos

El sistema de la CGR falla masivamente al devolver documentos completos en APIs v1. El Consumidor de colas aplica un algoritmo rígido de Rescate:

1. Trata de extraer la cadena `old_url` hurgando en las entrañas inmutables de KV (`DICTAMENES_SOURCE`).
2. Trata de adivinar el `division_id` mapeándolo desde strings ruidosos como "División de la Función municipal y Regional" a las ID numéricas insertadas en el Catálogo normalizado.

**Si Falla la Reparación (Fallback Destructivo)**:
Un registro re-evaluado que sanea con éxito deja la cola. Un registro evaluado que sigue destrozado tras checar su source inmutable se marca como `repaired_incomplete`.

### Laboratorio Práctico SQL (Monitor de Salud D1)
El desarrollador está obligado a monitorear la taza de descomposición del sistema KV->D1 desde Wrangler Local:

```sql
-- Consultar el balance de destrucción por fallos CGR
SELECT origen_importacion, count(1) as Cantidad 
FROM dictamenes 
GROUP BY origen_importacion;
```

> **NOTA SOBRE `SIN_DIVISION`:** 
> Todo Worker Ingestor se negará a vectorizar un fallo sin División vinculada por integridad referencial. Si fallan las reparaciones, se debe parchear la integridad usando el comodín "SIN_DIVISION".
