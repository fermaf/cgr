# 9. Guía de Uso Avanzado: Motor de Búsqueda y Extracción CGR

Esta guía explica cómo interactuar de forma programática con la API de la Contraloría General de la República (CGR). Gracias a la ingeniería inversa realizada en 2026, podemos realizar filtrados que incluso superan en precisión a la propia interfaz web básica.

---

## 9.1 Conceptos Fundamentales

El motor de la CGR utiliza **Elasticsearch**. Para que las consultas funcionen y no sean ignoradas, el servidor espera tres tipos de estructuras de datos diferentes dependiendo de la naturaleza del campo:

1.  **`force_obj`**: Para coincidencias exactas y campos numéricos/ID (Año, Número).
2.  **`category`**: Para catálogos predefinidos (Materias, Criterios).
3.  **`date`**: Para rangos temporales (requiere formato ISO8601 UTC).

---

## 9.2 Catálogo de Comandos y Ejemplos Reales

### A. Filtro por Identificación (ID y Año)
Se utiliza para localizar un documento o una cohorte anual específica.

*   **Lógica:** `type: "force_obj"`, `field: "n_dictamen" | "year_doc_id"`
*   **Ejemplo Real:** Buscar el dictamen **128578**.
    ```json
    {
      "options": [{ "type": "force_obj", "field": "n_dictamen", "value": "128578" }]
    }
    ```

---

### B. Filtro por Rango de Fechas (Extracción Masiva)
Es el filtro más potente para rellenar vacíos de datos ("GAPs").
*   **Lógica:** `type: "date"`, `field: "fecha_documento"`
*   **CRÍTICO:** Las fechas deben llevar el sufijo `T04:00:00.000Z` para ser aceptadas.
*   **Ejemplo Real:** Rango Histórico (Diciembre 1972).
    ```json
    {
      "options": [{
        "type": "date",
        "field": "fecha_documento",
        "value": {
          "gt": "1972-12-01T04:00:00.000Z",
          "lt": "1972-12-31T23:59:59.000Z"
        },
        "dir": "gt"
      }]
    }
    ```
    *Resultado: 91 dictámenes extraídos con éxito.*

---

### C. Filtros "Exóticos" y Sintaxis Lucene
Podemos buscar en columnas que no tienen botones visibles en la web usando prefijos en el campo `search`.

#### 1. Búsqueda por Abogado Firmante
*   **Comando:** `search: "abogado:JCQ"`
*   **Caso Real:** Localización de jurisprudencia redactada por el abogado con iniciales **JCQ**.
*   **Resultado:** 18 dictámenes encontrados (Ej: ID `028982N18`).

#### 2. Búsqueda por División de Origen
*   **Comando:** `search: 'origen:"División Jurídica"'`
*   **Caso Real:** Filtrar solo lo emanado por la **División Jurídica** en 2020.
*   **Resultado:** 668 dictámenes (Ej: ID `E64230N20`).

#### 3. Combinación Quirúrgica: Municipales + Jurisprudencia
*   **Comando:** Mezcla de dos `category`.
*   **Caso Real:** Dictámenes de materia **Municipal** que además han sido marcados como **Generan Jurisprudencia**.
    ```json
    "options": [
      { "type": "category", "field": "descriptores", "value": "mun" },
      { "type": "category", "field": "criterio", "value": "Genera Jurisprudencia" }
    ]
    ```
*   **Resultado:** 739 dictámenes (Ej: ID `D56N26`).

---

## 9.3 Invocación desde nuestra Plataforma

Para ejecutar estas búsquedas desde el Worker de **cgr-platform** y que se guarden automáticamente en D1 y KV, use el endpoint de crawl:

```bash
# Ejemplo: Traer todo el año 1972 (Búsqueda Exótica por Año)
curl -X POST "https://cgr-platform.abogado.workers.dev/api/v1/dictamenes/crawl/range" \
  -H "Content-Type: application/json" \
  -d '{
    "options": [{ "type": "force_obj", "field": "year_doc_id", "value": "1972" }],
    "limit": 5000
  }'
```

---
*Documentación generada tras sesión de Ingeniería Inversa en Febrero 2026.*
