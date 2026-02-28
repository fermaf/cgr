# Risk Policy: CGR.ai

## Políticas de Fallo y Seguridad
1. **Fail-Closed (Workflows):** Si un workflow falla por RPC o timeout, el registro en D1 debe marcarse como `error` explícitamente para evitar "limbos" de procesamiento.
2. **Sanitización de Salida:** Los datos provenientes de la API de CGR deben ser validados antes de insertarse en D1 para mitigar inyecciones o errores de esquema.
3. **Límites de Rate-Limit (Mistral):** El uso de AI Gateway es obligatorio para manejar retries y evitar suspensiones por exceso de cuota en el LLM.

## Auditoría y Backups
4. **Historial de Cambios:** Cualquier actualización manual o por proceso de enriquecimiento sobre campos clave (`numero`, `materia`, `criterio`) debe registrarse en la tabla `historial_cambios`.
5. **Backups D1:** Se deben programar backups automáticos via Wrangler/Cloudflare Dashboard semanalmente.
6. **KV Retention:** KV actúa como fuente de la verdad para el contenido raw. No se deben borrar llaves sin una previa verificación de existencia en D1.

## Límites Operativos
- **Batch Size Máximo:** 100 registros por ejecución de workflow para evitar exceder los límites de tiempo de CPU de Workers.
- **Concurrencia:** Máximo 1 instancia activa del `IngestWorkflow` para evitar race conditions en tablas de catálogos.
