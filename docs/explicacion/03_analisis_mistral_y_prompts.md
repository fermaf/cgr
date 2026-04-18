# 03 - Estrategia de Inferencia y Prompt Consolidado (Mistral)

En esta sección nos sumergimos en las decisiones de diseño del motor semántico. El núcleo de la plataforma requiere equilibrar **precisión jurisprudencial, latencia en Edge Workers y costo computacional**.

---

## 🧠 1. Evolución de Secuencial a Consolidado

Inicialmente (heredado de pruebas en sistemas orientados a nodos como n8n), la IA realizaba tres llamadas discretas por documento:
1. Extraer Jurisprudencia y Resumen.
2. Identificar Booleanos/Metadatos.
3. Extraer Fuentes y Citas.

### El Problema de la Secuencialidad
Invocar tres veces al modelo `mistral-large-2512` generaba tiempos de procesamiento que excedían fácilmente los timeouts de Cloudflare Workers (por encima de 60 segundos por dictamen). Además, el modelo carecía de "memoria" compartida entre las etapas, reduciendo la consistencia.

### La Solución: "Mega-Prompt" V5 Semantic Depth
Se configuró un prompt único (referenciado orgánicamente en `src/clients/mistral.ts`) que instruye a Mistral a emitir un output JSON masivo pero ultra-estructurado resolviendo las tres tareas en un instante atómico de generación.

## 🔬 2. El "Prompt V5 Semantic Depth" y la Pereza del LLM

Durante el benchmarking, detectamos un comportamiento de "pereza" en el LLM ("Laziness"), donde al ver documentos larguísimos, decidía truncar su síntesis o usar puntos suspensivos (`[omitiendo por brevedad]`).
Esto es catastrófico para la Base de Datos Vectorial (Pinecone), ya que el vector termina careciendo del significado completo.

> [!TIP]
> **Integración Narrativa de Citas**: Se ajustó el sistema exigiendo explícitamente una **"Narrativa de ALTA PROFUNDIDAD SEMÁNTICA"**. La heurística clave introducida requiere que cada dictamen que se cite *dentro* del texto **DEBE integrarse orgánicamente** explicando por qué es relevante. Esto detiene las síntesis telegráficas perezosas y genera "vectores ricos" ideales para embeddings. 

---

## 📝 3. Prompt Integral Vigente (El Librero)

Aquí se describe el formato lógico inyectado al modelo desde el `worker`:

```text
Eres un abogado, eminencia en derecho administrativo en Chile.
Tu entrada es el dictamen completo.

### TAREA CRÍTICA (PROFUNDIDAD SEMÁNTICA):
Analiza el dictamen y entrega UNA SOLA respuesta JSON integral. 
PROHIBICIÓN ABSOLUTA de truncamiento.

### 1. Jurisprudencia
- titulo: descripcion corta (max 66 char).
- resumen: narrativa del fallo.
- analisis: narrativa de ALTA PROFUNDIDAD. Argumentar contexto, hechos, fundamentación. INTEGRAR CITAS, NO LISTARLAS. (Mínimo 1500 char, max 999 tokens).
- etiquetas: array descriptivo.
- genera_jurisprudencia: boolean true/false.

### 2. Booleanos
Clasifica SI/1 (true) o NO/Vacío (false).

### 3. Fuentes Legales
Extrae Leyes, DFL, D.L., Decretos Supremos. 
Estructura: nombre, numero, year, sector, articulo.

### RESTRICCIONES DE ESTILO:
- Impresonalidad total.
- Anonimización absoluta de personas naturales.
- Salida ESTRICTAMENTE en JSON.
```

---

## ⚡ 4. Sincronía con Pinecone (Metadata V2)

Una vez que Mistral retorna el JSON estructurado, este es preparado para la Inferencia Integrada.
Al enviar el registro a la base vectorial, **CGR-Platform** anexa los `descriptores_originales` extraídos del payload primitivo de la Contraloría junto a las `etiquetas` de Mistral.

**La Metadata V2** que consume Pinecone unifica la inteligencia del LLM con las etiquetas "Legacy" del gobierno, permitiendo búsquedas semánticas que son harto precisas tanto en lenguaje natural moderno como en notación archivera clásica.

---

## 🚦 5. Estrategia de Enrutamiento y Claves (Abril 2026)

Para optimizar el uso de cuotas y asegurar la calidad del enriquecimiento en el backlog histórico, se implementó una estrategia de enrutamiento basada en el estado del dictamen:

- **Migración Total a Mistral**: Se eliminó Gemini del flujo de enriquecimiento doctrinal. Todos los dictámenes ahora utilizan modelos de la familia Mistral Large.
- **Distribución de Carga por Claves**:
    - **ALE (`MISTRAL_API_KEY_CRAWLER_ALE`)**: Utilizada exclusivamente para dictámenes nuevos detectados por el crawler (`estado: 'ingested'`). Estos se procesan con `mistral-large-2512`.
    - **OLGA (`MISTRAL_API_KEY_IMPORTANTES_OLGA`)**: Utilizada para dictámenes marcados como importantes o relevantes (`estado: 'ingested_importante'`). Procesados también con `mistral-large-2512`.
    - **Pool Global/EVA**: Utilizada para el grueso del procesamiento histórico o dictámenes triviales (`estado: 'ingested_trivial'`) usando `mistral-large-2411`.
- **Reprocesamiento 2020+**: Todos los dictámenes desde 2020 en adelante han sido forzados al uso del modelo `2512` para asegurar la máxima profundidad semántica en el corpus reciente.
