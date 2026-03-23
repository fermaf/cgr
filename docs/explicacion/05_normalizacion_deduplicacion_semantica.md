# 05 - Normalización, Deduplicación y Clustering Semántico

Esta guía detalla la estrategia de limpieza y organización de datos, especialmente enfocada en el proceso de ingesta de **Filtros Inteligentes** (como descriptores normativos y etiquetas LLM) para garantizar una experiencia visual pulcra y prevenir la generación de múltiples registros semánticamente equivalentes.

---

## 📖 1. El Problema (Orfandad y Duplicidad Semántica)
A lo largo del tiempo, la extracción cruda de datos (tanto clásicos como generados por LLMs como Mistral) introduce impurezas y redundancias en los catálogos.
Ejemplos comunes que afectaban los filtros de búsqueda:
- **Puntuación y Capitalización Inconsistente:** "abuso posicional." vs "Abuso posicional" vs "Abuso posicional."
- **Errores Tipográficos y Plurales (Distancia Levenshtein pequeña):** "acoso sexual" vs "acosos sexual" o "patentes de alcohol" vs "patentes de alcoholes".

Para los administradores y usuarios, el autocompletado del `Búsqueda Avanzada` en CGR.ai presentaba una experiencia degradada debido al ruido de todos estos registros "huérfanos" (que semánticamente significan lo mismo pero que ocupan un ID propio).

---

## 🛠 2. La Regla de Oro (Visual)
Todo registro que pertenezca a un catálogo enriquecido (por ejemplo, `cat_descriptores` o `dictamen_etiquetas_llm`) **debe forzosamente almacenarse con**:
1. **Title Case Inicial:** Solamente la primera letra del término se hace mayúscula, conservando el resto en su estándar nativo.
2. **Punto final:** Todos los campos deben concluir en un punto (`.`).

*Ejemplo canónico perfecto: `Patente de alcoholes.`*

**Justificación técnica**: La adición consistente del punto facilita la consistencia visual y define una firma determinista al momento de normalizar hacia la capa de presentación.

---

## 🧠 3. Mecanismo de Deduplicación Dinámico (Levenshtein Preventivo)
Para impedir que la plataforma regrese a un estado degradado, hemos modificado el Pipeline de Ingesta (`src/lib/ingest.ts` y tabla dinámica `src/storage/d1.ts`). 

Cuando la metadata de un nuevo dictamen contiene un descriptor o etiqueta, no se inserta a ciegas. 
El flujo es el siguiente:

1. **Normalización Base**: El sistema minarquiza el candidato (lo convierte a minúscula, quita el punto final y hace `trim()`).
2. **Búsqueda Limitada por Prefijo**: Selecciona de D1 todos los registros existentes que comparten los **primeros 4 caracteres**.
3. **Clustering Algorítmico (Levenshtein)**: 
   - A las coincidencias obtenidas, el sistema les aplica una función rápida de distancia Levenshtein (`src/lib/stringMatch.ts`).
   - Si la longitud original es mayor a 10 letras, el sistema tolera una distancia de hasta `2` ediciones (ej: cambio de una letra más agregado de plural).
   - Si la distancia calculada cumple el criterio y la diferencia de tamaño total (longitud) entre las cuerdas no supera `3`, el sistema **adopta la versión original de la base de datos**.
4. **Validación Exacta**: Si como último recurso no coincide un prefijo (ej: error humano en la primera letra), el sistema valida si el texto es *idéntico* en su forma base.
5. **Inserción / Reuso**:
   - Si hubo coincidencia (Existing Match): El sistema reutiliza el texto canónico encontrado (y su ID subyacente de existir) conectando el dictamen limpiamente al árbol existente.
   - Si es virgen (No Match): El sistema lo "eleva" a su **Regla de Oro** (Mayúscula y punto) y lo inserta como nueva raíz semántica.

---

## 🗃 4. Auditoría Histórica
Para referencia, la migración fundacional que limpió y redujo en un 20% el catálogo de metadatos se encuentra preservada en el repositorio en `docs/historico/reporte_unificacion_descriptores_marzo2026.md`.
En total, unificó cerca de 60,000 ocurrencias en más de docenas de miles de clusters óptimos mediante el mismo script Levenshtein.
