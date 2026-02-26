# 11. ToDo: Servicio de Búsqueda Avanzada y Análisis Semántico Macroscópico

Este documento define los requisitos funcionales y técnicos para la implementación de un sistema de búsqueda avanzada en el @frontend, integrando capacidades de "Ingesta en Caliente" y análisis masivo mediante LLM.

---

## 1. Visión General
El objetivo es transformar la búsqueda simple en un **Portal de Inteligencia Jurídica**. El usuario no solo debe encontrar dictámenes existentes, sino también poder explorar el catálogo completo de la CGR en tiempo real y obtener respuestas sintéticas sobre grandes volúmenes de documentos.

---

## 2. Requisitos Funcionales

### 2.1 Búsqueda Avanzada Multi-Filtro
La interfaz debe exponer los filtros "exóticos" descubiertos mediante ingeniería inversa, mapeados a las capacidades de D1:
-   **Filtros Locales (D1):** Materia, Institución, Año, Estado de Enriquecimiento.
-   **Filtros Externos (CGR):** Abogado (sintaxis `abogado:`), División de Origen (sintaxis `origen:`), Rango de Fechas exacto (formato ISO).

### 2.2 Sistema de "Ingesta en Caliente" (Hot Ingestion)
Si una búsqueda del usuario arroja resultados que están en el portal de la CGR pero **no** en nuestra base de datos local:
1.  El sistema debe mostrar los resultados con un indicador visual de "Disponible en CGR (No procesado)".
2.  Al seleccionar uno o varios de estos resultados, se debe disparar un flujo prioritario:
    -   `POST /api/v1/dictamenes/ingest-specific`: Un nuevo endpoint para descargar y guardar en KV/D1 en el acto.
    -   `POST /api/v1/dictamenes/enrich-on-demand`: Procesamiento por IA inmediato para el usuario actual.

### 2.3 Análisis Semántico de Alto Nivel
Capacidad de seleccionar múltiples dictámenes (ej. 10 a 50) y generar un **Resumen de Patrones**:
-   Identificar el hilo conductor (ej. "Todos estos dictámenes endurecen el criterio sobre horas extras").
-   Detectar contradicciones o reafirmaciones.
-   Listar fuentes legales comunes citadas en el grupo.

---

## 3. Flujo de Trabajo para Agente LLM (Implementación)

### Paso 1: Refactorización de la API de Búsqueda
-   Modificar el endpoint de búsqueda para que acepte un flag `external_fallback: true`.
-   Si está activo, el Worker consulta a D1 y, en paralelo, a la API de CGR con los mismos filtros.
-   Mezclar los resultados (Merge) marcando el origen de cada registro.

### Paso 2: Endpoint de Enriquecimiento Prioritario
-   Crear un workflow de "baja latencia" que omita colas largas y procese el dictamen solicitado en < 15 segundos para el usuario.

### Paso 3: Componente de Síntesis Macroscópica
-   Nuevo endpoint `POST /api/v1/analyze/batch`.
-   **Prompt Interno:** "Eres un analista senior de la Contraloría. Recibes los siguientes resúmenes de dictámenes [JSON]. Identifica el patrón de jurisprudencia dominante y cualquier cambio de criterio reciente".

---

## 4. Propuestas de Valor Impulsadas por Filtros

Aprovechando los filtros descubiertos, se proponen las siguientes funcionalidades "Premium":

1.  **Línea de Tiempo del Abogado:**
    Visualización interactiva que permite ver cómo un abogado específico (filtro `abogado:`) ha redactado dictámenes a lo largo de los años, identificando si su tendencia es más restrictiva o permisiva según la materia.

2.  **Monitor de Divisiones Estratégicas:**
    Dashboard que agrupa dictámenes por `origen:` (ej. División Jurídica vs. División de Municipalidades) para detectar qué áreas de la Contraloría están emitiendo más criterios de "Genera Jurisprudencia".

3.  **Mapa de "Puntos Calientes" Jurídicos:**
    Uso combinado de filtros de `Institución` y `Materia` para identificar qué órganos públicos están teniendo más conflictos legales recurrentes y sobre qué temas específicos.

4.  **Detector de Evolución de Criterio:**
    Al filtrar por un `Criterio` específico (ej. "Vivienda") y un rango de 20 años, la IA genera un informe de cómo ha cambiado la interpretación de la ley en ese periodo.

5.  **Recomendador de "Precedentes Peligrosos":**
    Filtro automático que busca dictámenes con el flag `genera_jurisprudencia` que afecten a una institución similar a la que el usuario está investigando.

6.  **Simulador de Impacto Normativo:**
    Analizar un lote de dictámenes "Nuevos" (filtro `nuevo: 1`) para predecir qué normativas vigentes podrían verse complementadas o alteradas por esta nueva jurisprudencia.

---

## 5. Diseño de Interfaz Sugerido
-   **Barra Lateral:** Filtros dinámicos que se pueblan con `DISTINCT` de D1.
-   **Toggle "Global":** Interruptor para incluir resultados externos de la CGR en tiempo real.
-   **Modo Analista:** Checkbox en cada resultado para "Añadir a Comparativa" y un botón flotante de "Generar Síntesis Semántica".
