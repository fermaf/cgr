# 03 - Monitoreo y Operaciones (Manual del Administrador)

Este manual detalla los procedimientos para la operación diaria, el monitoreo y la resolución de incidentes en el ecosistema **CGR-Platform**. Está diseñado para ingenieros que aseguran la continuidad del servicio (High Availability) y la integridad de los datos.

---

## 📅 1. Automatización y Orquestación Diaria

### El Ciclo del `IngestWorkflow`
El sistema ejecuta su escaneo inicial automáticamente utilizando un *Cron Trigger* definido en `wrangler.jsonc`.

- **Horario**: `05 3 * * *` (3:05 AM hora servidor). Se ejecuta en la madrugada para capturar todos los dictámenes firmados y publicados durante el día anterior.
- **Ventana de Observación (Lookback)**: Utiliza la variable `CRAWL_DAYS_LOOKBACK` (por defecto `3`) para asegurar que no haya pérdida de datos si el portal de la CGR experimentó caídas en los días previos.

### Monitoreo del Workflow
Cada ejecución de Ingesta o Backfill puede y debe ser auditada desde el **Cloudflare Dashboard (Workers > Workflows)**:
1. **Pausas y Reintentos**: Si un paso (`step.do`) falla, por ejemplo, por un *timeout* en la recolección, el Workflow no descarta lo avanzado. Espera con un *backoff* exponencial.
2. **Backfill Batching**: El `BackfillWorkflow` procesa en lotes (definidos por `BACKFILL_BATCH_SIZE`). Si notas que un lote particular siempre falla, verifica los IDs en D1 con `estado = 'ingested'`.

---

## 🛡️ 2. Gobernanza Determinista (Skillgen Routing)

**CGR-Platform** no se apoya en logs ciegos. Ante fallos excepcionales, el **Clasificador de Incidentes** (`src/lib/incidentRouter.ts`) entra en acción:

1. El error es capturado usando la función `persistIncident`.
2. Se normaliza sanitizando cualquier posible API Key o secreto.
3. Se rutea a un "Skill" de diagnóstico (ej: `mistral_timeout_triage`).
4. **Evidencia Forense**: El registro íntegro se guarda en la tabla `skill_events` de D1.

> [!TIP]
> **Query de Diagnóstico Inmediato**:
> ```sql
> SELECT workflow_id, created_at, incident_code, severity, error_message 
> FROM skill_events 
> ORDER BY created_at DESC LIMIT 10;
> ```

---

## 🛠️ 3. Troubleshooting Avanzado de Operación

### Problema A: "Mis dictámenes no se ven en el Dashboard Frontend"
1. **Comprueba el Estado en Base de Datos**:
   ```sql
   SELECT estado, count(*) FROM dictamenes GROUP BY estado;
   ```
   Si la mayoría está en `ingested`, el `BackfillWorkflow` está atascado.
2. **Revisa la Cuota de Mistral AI**: Ingresa al Cloudflare AI Gateway. ¿Alcanzaste el límite de tokens diarios o rate-limits?
3. **Validación de Metadata v2**: Si ves los dictámenes pero fallan los filtros por materia, es porque aún no cuentan con la metadata cruzada Pinecone v2. Usa el endpoint `/api/v1/dictamenes/batch-enrich`.

### Problema B: Modificaciones en origen de CGR
A veces, la Contraloría añade un nuevo tipo de norma o campo al buscador que rompe nuestro parser.
1. Revisa si en `skill_events` hay registros con código `PARSE_ERROR`.
2. El Parser está ubicado en `src/lib/ingest.ts`. Si la estructura de origen cambió, deberás actualizar la interfaz allí.

---

## 📈 4. Monitoreo de Rendimiento

- **Analytics Engine**: Toda petición HTTP genera un registro `LogEvents`. Puedes calcular el tiempo promedio de respuesta (p95) de Pinecone vs SQL.
- **Cache Hits**: Revisa los logs en la terminal (`wrangler tail`) para confirmar que endpoints críticos como `/api/v1/analytics/statutes/heatmap` están arrojando un `CACHE_HIT` (sirviendo desde `DICTAMENES_PASO` con TTL) en lugar de consultar pesadamente D1.
