# 07 - Gobernanza y Estratigrafía de Datos

Este documento detalla la gestión científica de los datos en **CGR-Platform**, desde su captura cruda hasta su transformación en conocimiento vectorial. Incluye el análisis reflexivo sobre la gobernanza de entornos y la lógica interna de normalización.

---

## 🧠 Análisis Reflexivo: La Auditoría como Motor de Calidad

La creación de documentos de arquitectura v2 no es solo un acto de transcripción, sino un proceso de **auditoría continua**. 

Durante la fase de documentación, se identificó un conflicto crítico: mientras la arquitectura teórica proponía entornos aislados, la infraestructura real compartía la base de datos D1 y KV entre *Staging* y *Producción*. Esta reflexión permitió:
1. Detectar un riesgo nuclear de integridad de datos.
2. Identificar "huecos" de conocimiento en la documentación antigua (como la lógica de generación de IDs y filtros de ruido).
3. Establecer que el nivel de documentación "El Librero" exige que el conocimiento sea **auditable y verificable** contra el código fuente.

---

## 🏛 Estratigrafía de Datos (Arquitectura de Capas)

El sistema utiliza un patrón de capas para garantizar la resiliencia y la inmutabilidad:

### 1. Capa de Bronce (Raw Storage)
- **Repositorio**: Cloudflare KV (`DICTAMENES_SOURCE`).
- **Estado**: Datos JSON originales obtenidos por el scraper de la CGR.
- **Inmutabilidad**: Esta capa es sagrada; nunca se modifica. Permite re-procesar históricos sin re-consultar la fuente externa.
- **Clave KV**: `ID_DICTAMEN` (Formato N-ID).

### 2. Capa de Paso (Enriched JSON)
- **Repositorio**: Cloudflare KV (`DICTAMENES_PASO`).
- **Estado**: JSON estructurado post-IA.
- **Contenido**: Consolida el origen + análisis de Mistral AI + metadatos jurídicos v2.
- **Uso**: Alimentación directa al Frontend para visualización sin recurrir a D1 para el contenido pesado.

---

## 🧪 Alquimia de IDs y Normalización

La consistencia de los datos depende de algoritmos deterministas de identificación:

### Generación de IDs (N-Format)
Para dictámenes que no poseen un ID unificado en el origen, el sistema aplica la lógica:
- `NUMERIC_DOC_ID` + `N` + `YEAR_DOC_ID_LAST_2_DIGITS`.
- Ejemplo: `12345` año `2024` → `12345N24`.

### Heurísticas de Filtrado de Ruido (Librero Heuristics)
Para evitar que los catálogos de abogados y materias se contaminen con términos comunes, el parser de ingesta (`ingest.ts`) aplica un filtro de longitud (2-5 caracteres) y una **Lista Negra de Ruido** que incluye términos como:
- `CHILE`, `SALUD`, `DEFENSA`, `MINISTRO`, `JEFE`, `GRAL`.

---

## 🕒 Estrategia LIFO y Automatización

Para maximizar el valor de negocio, el enriquecimiento masivo (`BackfillWorkflow`) prioriza los datos mediante:
- **Prioridad LIFO**: Las consultas a D1 utilizan `ORDER BY updated_at DESC`.
- **Razón**: Garantiza que la jurisprudencia más reciente (2025/2026) sea la primera en estar enriquecida y vectorizada, dejando el fondo histórico para periodos de baja carga.
