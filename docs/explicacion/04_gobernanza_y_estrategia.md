# 04 - Gobernanza y Estratigrafía de Datos

Este documento detalla la gestión científica de los datos en **CGR-Platform**, desde su captura cruda hasta su transformación en conocimiento vectorial, incluyendo la lógica interna de normalización.

---

## 🏛️ 1. Estratigrafía de Datos (Arquitectura de Capas)

El sistema utiliza un patrón de capas acopladas a diferentes medios de Storage (KV vs SQL) para garantizar resiliencia, escalabilidad y la inmutabilidad de la fuente original.

### Capa de Bronce (Raw Storage)
- **Repositorio**: Cloudflare KV (`DICTAMENES_SOURCE`).
- **Estado**: Datos JSON originales obtenidos por el scraper directo del portal de la Contraloría.
- **Inmutabilidad**: Esta capa es sagrada y **nunca se modifica**. Es la garantía de que siempre podremos re-procesar históricos ante un cambio de modelo de IA sin re-consultar o saturar la fuente externa.

### Capa Relacional (Hot Storage)
- **Repositorio**: Cloudflare D1 (SQLite Edge).
- **Estado**: Metadatos extraídos, auditoría de fallos (`skill_events`), y relaciones clave.
- **Uso**: Control del estado de la ingesta (`ingested`, `enriched`, `vectorized`), reportabilidad SQL rápida y agregaciones analíticas.

### Capa de Paso (Cache / View Storage)
- **Repositorio**: Cloudflare KV (`DICTAMENES_PASO`).
- **Estado**: JSON estructurado post-IA y resultados analíticos.
- **Contenido**: Consolida el origen + análisis de Mistral AI.
- **Uso**: Alimentación ultra-rápida (Cache) al Frontend para visualizaciones (Heatmaps, Tendencias) sin recurrir al cómputo de D1.

---

## 🧪 2. Alquimia de IDs y Normalización

La consistencia de los datos en un ambiente asíncrono como Cloudflare Workers depende de algoritmos deterministas.

### Generación de IDs Faltantes (N-Format)
Para los dictámenes (especialmente antiguos) que no poseen un identificador unificado en el payload original, el IngestWorkflow aplica una fórmula determinista de asignación de clave:
1. `NUMERIC_DOC_ID` 
2. Letra `N`
3. `YEAR_DOC_ID_LAST_2_DIGITS`

**Ejemplo**: Número `12345` año `2024` se transforma y persiste como `12345N24`.

### Heurísticas de Filtrado de Ruido ("Librero Heuristics")
Para evitar que los catálogos de búsqueda, abogados y materias se contaminen con términos repetitivos o vacíos de significado legal, el parser de la plataforma (`src/lib/ingest.ts`) aplica:
- Filtros de longitud mínima (2-5 caracteres dependiendo del campo).
- Una **Lista Negra de Ruido** pre-compilada que intercepta y descarta términos como: `CHILE`, `SALUD`, `DEFENSA`, `MINISTRO`, `JEFE`, `GRAL`.

---

## 🕒 3. Estrategia LIFO y Automatización de Valor

El enriquecimiento de miles de dictámenes históricos mediante LLM (BackfillWorkflow) toma tiempo y dinero. 

Para **maximizar el valor de negocio temprano**, las sentencias SQL que alimentan al orquestador priorizan los datos mediante una estrategia **LIFO** (Last In, First Out):
- Se utiliza `ORDER BY updated_at DESC` en las Queries de Backfill.
- **Razón Estratégica**: Esto garantiza que la jurisprudencia más reciente y relevante del año en curso sea la primera en ser interpretada por Mistral AI y vectorizada en Pinecone, relegando el fondo histórico de los años 90 o principios del 2000 a los periodos nocturnos o de baja intensidad transaccional de la API.
