# 04 - Manual de Usuario (Interfaz Frontend)

Esta guía explica a los operadores y analistas el comportamiento de la interfaz gráfica y qué ocurre tras bambalinas cuando se realiza una consulta.

---

## 🔍 1. Comportamiento del Buscador Central

El _Omnibox_ de la página de inicio y el buscador avanzado admiten un comportamiento dual inteligente:

### 1.1 Inferencia Semántica (Lenguaje Natural)
Admite consultas descriptivas sin jerga exacta.
Ejemplos de interacción:
- *"Conflictos por licencias maternales en municipios rurales"*
- *"Prohibición legal para horas extras de alcaldes directos"*

**¿Por qué funciona?** El sistema cruza tu texto por el modelo `llama-text-embed-v2` de Pinecone (1024 dimensiones) para calcular distancias matemáticas. Si buscas "retraso", el sistema entenderá "demora" o "dilación".

### 1.2 Búsqueda Exacta por ID (Prioridad Absoluta)
Si el motor detecta un patrón de dictamen (ej. `E129499N25` o `129499`), el sistema **aborta la vectorización semántica** y lanza una búsqueda directa a la base de datos SQL. Esto garantiza que encuentres el documento exacto al instante sin ruido semántico.

---

## 🎛️ 2. Filtros Avanzados y Catálogos Dinámicos

La búsqueda avanzada cuenta con catálogos respaldados en tiempo real:
- **Área Especializada**: A diferencia de filtros estáticos comunes, este despliega las divisiones leyendo directamente la base de datos oficial (`cat_divisiones`), eliminando opciones nulas o no identificadas para garantizar consistencia institucional.
- **Tooltips Asistidos**: Cada filtro (`Materia`, `Área especializada`, `Temática`) cuenta con un icono `(?)` que despliega ayuda técnica sobre su alcance.
- **Toggle Jurisprudencia**: Filtro binario explícito para aislar *"SOLO DICTAMENES QUE HAN GENERADO JURISPRUDENCIA"*.

---

## 📛 3. Significado de los Badges (Indicadores Visuales)

El resultado de cada dictamen porta diferentes etiquetas visuales:

### Badge Violeta: "Búsqueda Semántica"
- Es el resultado ideal y aparecerá el 99% del tiempo.
- Garantiza que el dictamen listado fue traído debido a su relevancia conceptual (Pinecone) respecto a tu prompt.

### Badge Gris: "Búsqueda Literal"
- Ocurre cuando el Worker sufre un fallo de red consultando al servicio de IA, activando la heurística de resiliencia (Fallback).
- El sistema ejecutó en su defecto un `SELECT ... LIKE '%texto%'` en D1. Los resultados son válidos, pero puramente literales.

### Badge Azul: "Análisis IA"
- Confirma que el dictamen expone Metadata V2.
- Indica que el "Resumen Ejecutivo", el "Análisis Jurídico Explicado", las etiquetas temáticas y las citas legales fueron auto-generadas extrayendo sentido del texto original mediante Mistral_2512.

---

## 📊 4. Estadísticas y Línea de Tiempo

La página de `/stats` ofrece una visión histórica institucional. El gráfico central expone la **"Comparativa de Dictámenes totales y los que han producido jurisprudencia"**. 

- **Scroll Automático**: Por diseño, la gráfica de barras carga posicionada en el extremo derecho (años más recientes). Esto permite ver de inmediato la actividad actual sin necesidad de desplazarse manualmente desde 1960.
- **Interactividad**: Puedes filtrar u observar las tendencias de "Corte" y "Aumento" de jurisprudencia pasando el ratón sobre los nodos de la gráfica de líneas.

---

## 🛡️ 5. Centro de Comando (Admin)

Reservado para operadores con token de administración. Se divide en clústers semánticos:

- **Volumetría**: Conteo real de dictámenes en D1 por año y estado.
- **Transaccionalidad**: Flujo de ingesta y estados de integración.
- **Salud Operacional**: Integridad entre los motores de búsqueda (D1 vs KV).
- **Semántica**: Análisis de las materias más recurrentes detectadas por IA.
- **Agente Skillgen**: Bitácora técnica en tiempo real. Muestra cada paso que el orquestador autónomo realiza (Enriquecimiento, Fallbacks, Validaciones).
- **Migración LLM**: Estado del proceso de modernización. Las métricas aquí son **mutuamente excluyentes**: un dictamen es *Migrado* (V2 completo), *Legacy* (V1 antiguo) o *Pendiente*. La suma de estas categorías siempre representará el 100% de tu base de datos sin duplicados.
