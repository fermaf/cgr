# 8. Ingeniería Inversa: API Oculta de la CGR

Este documento registra los hallazgos técnicos obtenidos mediante ingeniería inversa sobre el portal oficial de la Contraloría General de la República de Chile (febrero 2026). Estos descubrimientos permiten realizar consultas "quirúrgicas" directamente al motor de búsqueda (Elasticsearch) de la CGR.

## 8.1 Protocolo de Comunicación
- **URL Base:** `https://www.contraloria.cl/apibusca/search/dictamenes`
- **Método:** `POST`
- **Headers Obligatorios:**
  - `Content-Type: application/json`
  - `User-Agent`: Debe ser uno moderno (Chrome/Edge).
  - `Origin/Referer`: Para evitar bloqueos CORS.
  - `Cookie`: Se requiere inicializar sesión en `/web/cgr/buscador` para obtener el token de sesión.

## 8.2 Estructura del Payload
La API espera un objeto con la siguiente forma base:
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

## 8.3 Catálogo de Filtros (`options`)

### A. Filtro de Fecha (Descubrimiento Crítico)
Permite extraer documentos en rangos temporales precisos.
- **Campo:** `fecha_documento`
- **Tipo:** `date`
- **Formato de Valor:** ISO 8601 (ej. `2025-07-01T04:00:00.000Z`)
- **Operadores:** `gt` (mayor que), `lt` (menor que), `gte`, `lte`.
```json
{
  "type": "date",
  "field": "fecha_documento",
  "value": {
    "gt": "2025-07-01T04:00:00.000Z",
    "lt": "2025-07-31T23:59:59.000Z"
  },
  "dir": "gt"
}
```

### B. Filtro por Número de Dictamen
Busca un documento específico por su numeración oficial.
- **Campo:** `n_dictamen`
- **Tipo:** `force_obj`
```json
{
  "type": "force_obj",
  "field": "n_dictamen",
  "value": "128578"
}
```

### C. Filtro por Año
Acota la búsqueda a un año calendario de emisión.
- **Campo:** `year_doc_id`
- **Tipo:** `force_obj`
```json
{
  "type": "force_obj",
  "field": "year_doc_id",
  "value": "2024"
}
```

### D. Filtro por Criterio Jurídico
Filtra según la naturaleza jurídica del dictamen (Jurisprudencia).
- **Campo:** `criterio`
- **Tipo:** `category`
- **Valores comunes:** `Aplica Jurisprudencia`, `Genera Jurisprudencia`.

### E. Filtro por Materia (Descriptores)
Las materias de la interfaz se mapean a códigos cortos.
- **Campo:** `descriptores`
- **Tipo:** `category`
- **Valores comunes:** 
  - `mun` (Municipales)
  - `gen` (General)
  - `per` (Personal)

## 8.4 Filtros Avanzados vía Sintaxis Lucene
El parámetro `search` no es solo texto plano; acepta prefijos que actúan directamente sobre las columnas del índice, incluso si no hay un filtro en el JSON de `options`.

| Prefijo | Campo Filtrado | Ejemplo |
| :--- | :--- | :--- |
| `abogado:` | Iniciales o nombre del abogado | `search: "abogado:JCQ"` |
| `origen:` | División o departamento de origen | `search: 'origen:"División Jurídica"'` |
| `id:` | ID interno de base de datos | `search: "id:E128586N25"` |

---
*Este documento es dinámico y debe actualizarse conforme se descubran nuevos campos en el esquema de Elasticsearch de la Contraloría.*
