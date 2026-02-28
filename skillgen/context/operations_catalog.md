# Operations Catalog: CGR.ai

## Ingesta y Crawl
Operaciones para alimentar el sistema con nuevos dictámenes.

### 1. Ingesta por Rango de Fechas
```bash
curl -X POST "https://REDACTED_HOST/api/v1/dictamenes/crawl/range" \
  -H "Content-Type: application/json" \
  -d '{
    "date_start": "2024-01-01",
    "date_end": "2024-01-31",
    "limit": 1000
  }'
```

### 2. Disparar Batch de Enriquecimiento
```bash
curl -X POST "https://REDACTED_HOST/api/v1/dictamenes/batch-enrich" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 50, "delayMs": 1000}'
```

## Mantenimiento de D1
Consultas frecuentes para estado del sistema.

### 3. Verificar Backlog de Estados
```bash
wrangler d1 execute cgr-dictamenes --remote --command \
"SELECT estado, COUNT(*) as total FROM dictamenes GROUP BY estado;"
```

### 4. Identificar Errores de Workflow
```bash
wrangler d1 execute cgr-dictamenes --remote --command \
"SELECT id, numero, updated_at FROM dictamenes WHERE estado = 'error' LIMIT 10;"
```

## Búsqueda
### 5. Probar Búsqueda Semántica
```bash
curl -X GET "https://REDACTED_HOST/api/v1/dictamenes/search?q=jubilacion%20fuerzas%20armadas"
```
