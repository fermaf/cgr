# CGR - Payload de busqueda

La CGR acepta un payload JSON con `options`. Este doc lista patrones reales.

## Payload base
```json
{
  "search": "",
  "options": [],
  "order": "date",
  "date_name": "fecha_documento",
  "source": "dictamenes",
  "page": 0
}
```

## Rango de fechas
```json
{
  "options": [
    {
      "type": "date",
      "field": "fecha_documento",
      "dir": "gt",
      "value": {
        "gt": "2025-12-12T03:00:00.000Z",
        "lt": "2025-12-20T03:00:00.000Z"
      }
    }
  ],
  "order": "date",
  "date_name": "fecha_documento",
  "page": 0,
  "search": "",
  "source": "dictamenes"
}
```

## Rango + criterio
```json
{
  "options": [
    { "type": "date", "field": "fecha_documento", "dir": "gt", "value": { "gt": "2025-01-01T03:00:00.000Z", "lt": "2026-01-01T02:59:59.999Z" } },
    { "type": "category", "field": "criterio", "value": "Genera Jurisprudencia" }
  ],
  "order": "date",
  "date_name": "fecha_documento",
  "page": 0,
  "search": "",
  "source": "dictamenes"
}
```

## Rango + n_dictamen exacto
```json
{
  "options": [
    { "type": "date", "field": "fecha_documento", "dir": "gt", "value": { "gt": "2025-01-01T03:00:00.000Z", "lt": "2026-01-01T02:59:59.999Z" } },
    { "type": "force_obj", "field": "n_dictamen", "value": "2828" }
  ],
  "order": "date",
  "date_name": "fecha_documento",
  "page": 0,
  "search": "",
  "source": "dictamenes"
}
```

## Nota
El endpoint interno `POST /internal/crawl-range` acepta `options` y agrega el filtro de fechas cuando hay `from/to`.
