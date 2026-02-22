# 5. Manual de Usuario — Portal de Jurisprudencia CGR

## 5.1 Acceso al Portal

URL de producción: `https://cgr-jurisprudencia.pages.dev`

El portal es una aplicación web moderna que funciona en cualquier navegador (Chrome, Firefox, Safari, Edge). No requiere instalación ni cuenta de usuario.

---

## 5.2 La Interfaz

### Barra Lateral (Sidebar)
Ubicada a la izquierda, permite navegar entre secciones:

| Sección | Función |
|---|---|
| **Inicio** | Página principal con buscador central |
| **Búsqueda Avanzada** | Resultados de búsqueda con filtros |
| **Estadísticas** | Volumen de datos y estado del repositorio |

### Buscador Central (Omnibox)
En la página principal, escriba su consulta en lenguaje natural. No necesita usar jerga de bases de datos. Ejemplos válidos:

- `"Contratos honorarios en municipalidades"`
- `"Probidad administrativa en licitaciones"`
- `"Licencias maternales funcionarios públicos"`
- `"E129499N25"` (búsqueda por ID directo)

Presione Enter o haga clic en la lupa para buscar.

---

## 5.3 Resultados de Búsqueda

### Tarjetas de Dictámenes
Cada resultado se muestra como una tarjeta con:
- **Título**: generado por IA desde el texto original
- **Número**: identificador oficial del dictamen
- **Fecha**: fecha de emisión
- **Materia**: tema jurídico principal
- **Resumen**: extracto breve generado por IA (si está disponible)

### Panel de Filtros
Disponible en la vista de resultados:
- **Año**: filtrar por año de emisión
- **Materia**: filtrar por tema jurídico
- **Paginación**: navegar entre páginas con flechas

---

## 5.4 Badges de Tipo de Búsqueda

Cada resultado incluye un indicador visual del tipo de búsqueda utilizado:

### Badge "Búsqueda Semántica" (Violeta)
Aparece el **99% de las veces**. Significa que el sistema entendió el concepto de su consulta y encontró dictámenes relacionados temáticamente, aunque no contengan las mismas palabras exactas.

**Tecnología**: Pinecone con modelo `llama-text-embed-v2` de 1024 dimensiones.

### Badge "Búsqueda Literal" (Gris)
Aparece excepcionalmente cuando el servicio de IA está sobrecargado o no disponible. El sistema encontró dictámenes por coincidencia textual en la base de datos SQL.

**No significa que los resultados sean malos**, solo menos precisos conceptualmente. El sistema sigue funcionando normalmente.

### Badge "Análisis IA" (Azul)
Indica que el dictamen fue procesado por Inteligencia Artificial y contiene:
- Resumen ejecutivo
- Análisis jurídico estructurado
- Etiquetas temáticas

---

## 5.5 Vista de Detalle del Dictamen

Al hacer clic en una tarjeta, se abre la vista detallada con dos paneles:

### Panel Principal — Documento Original
Muestra el texto oficial del dictamen en tipografía serif optimizada para lectura extendida. Si el dictamen original está en formato JSON crudo (archivos históricos), se presenta en un bloque de código formateado.

### Panel Lateral — Análisis con IA

| Sección | Contenido |
|---|---|
| **Resumen Inteligente** | 2-3 oraciones con lo esencial del dictamen |
| **Análisis Jurídico** | Puntos clave y razonamiento extraído |
| **Conceptos Clave** | Etiquetas que categorizan el documento |
| **Genera Jurisprudencia** | Indicador de si el dictamen establece precedente |

---

## 5.6 Estadísticas

La página de estadísticas muestra:
- **Total de documentos** indexados en la plataforma
- **Documentos enriquecidos** (procesados por IA)
- **Fecha de última actualización** del repositorio

---

## 5.7 Preguntas Frecuentes

**¿Puedo confiar en el resumen de IA?**
Los resúmenes son asistencia jurídica, no opinión legal. Siempre verifique la vigencia del dictamen en los canales oficiales de la CGR en [contraloria.cl](https://www.contraloria.cl).

**¿Cada cuánto se actualizan los datos?**
El sistema revisa automáticamente cada 6 horas los dictámenes publicados por la CGR en los últimos 3 días.

**¿Por qué un dictamen no tiene análisis IA?**
Puede estar en estado `ingested` (recién descargado, pendiente de procesamiento por Mistral). El enriquecimiento se ejecuta en batches periódicos.

**¿Puedo buscar por número de dictamen?**
Sí. Escriba el ID directamente en el buscador (ej: `E129499N25` o `D56N26`).
