# Manual de Usuario - Migración 3 (Turbo & Relational)

Este manual explica cómo operar el sistema de migración de datos masivos de la CGR hacia Cloudflare.

## 1. Requisitos Previos
- **Node.js v18+** y **Wrangler CLI**.
- **Infraestructura**: Debe existir la cola `cgr-source-migration-queue` y la base de datos D1 `cgr-dictamenes`.
- **Archivo Fuente**: `@mongoBackup/20250630_dictamenes_source_84973.txt`.

## 2. Configuración y Despliegue

1.  **Desplegar el Backend**:
    ```bash
    wrangler deploy
    ```
2.  **Configurar el Feeder**: Asegúrate de que `scripts/feeder.ts` tenga la URL correcta del worker generado.

## 3. Guía de Operación

### Fase 1: Prueba de Humo
Antes de la carga masiva, verifica la conectividad con:
```bash
npx tsx scripts/test_feeder.ts
```
Este script procesará solo 20 registros y validará el flujo end-to-end.

### Fase 2: Carga Masiva (Turbo Mode)
Ejecuta el alimentador principal:
```bash
npx tsx scripts/feeder.ts
```
*   **Velocidad**: Gracias al pool de concurrencia de 25, la migración de 85k registros se completa en minutos.
*   **Payload Overflow**: Los registros pesados (>128KB) se gestionan automáticamente vía KV.

### Fase 3: Auditoría de Integridad
Para asegurar que no faltó ningún registro:
1.  Genera el volcado de IDs actuales desde D1:
    ```bash
    wrangler d1 execute cgr-dictamenes --command "SELECT id FROM dictamenes" --format=json > scripts/logs/d1_ids.json
    ```
2.  Ejecuta el auditor:
    ```bash
    npx tsx scripts/audit_missing.ts
    ```

## 4. Consultas Útiles (D1 SQL)

### Estado de Ingesta
```sql
SELECT estado, COUNT(*) FROM auditoria_migracion GROUP BY estado;
```

### Registros Enriquecidos
```sql
SELECT COUNT(*) FROM dictamenes WHERE es_enriquecido = 1;
```

### Top Abogados
```sql
SELECT a.iniciales, COUNT(*) as total
FROM cat_abogados a
JOIN dictamen_abogados da ON a.id = da.abogado_id
GROUP BY a.iniciales ORDER BY total DESC LIMIT 10;
```

---
*Manual v3.0 - Soporte Turbo Paralelo*
