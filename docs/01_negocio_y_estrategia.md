# 1. Negocio y Estrategia

## 1.1 Visión del Producto

**CGR.ai** es una plataforma de jurisprudencia administrativa inteligente que moderniza el acceso al acervo documental de la **Contraloría General de la República de Chile**.

El problema histórico: durante décadas, la recuperación de dictámenes se basaba en búsquedas textuales rudimentarias — coincidencias exactas de cadenas de texto. Un abogado buscando "probidad en contratos de honorarios municipales" no encontraba dictámenes que hablaran del mismo tema con otras palabras. Esto creaba una **ceguera sistémica** que afectaba la calidad del análisis jurídico.

**El cambio fundamental:** CGR.ai reemplaza "encontrar palabras sueltas" por **"entender de qué se habla"**. Una inteligencia transversal que asimila conceptos de probidad, recursos humanos, contratos y urbanismo, ofreciendo resúmenes didácticos en segundos.

---

## 1.2 Propuesta de Valor

### Búsqueda Semántica (Vectorial)
El consultor formula preguntas en lenguaje natural. El sistema usa **Pinecone** con el modelo de embeddings `llama-text-embed-v2` para encontrar dictámenes conceptualmente relevantes, no solo textualmente coincidentes.

**Dato real de producción:** Al día 22 de Febrero de 2026, el sistema tiene **11.138 dictámenes vectorizados** y búsqueda semántica activa.

### Enriquecimiento Automático con IA
Cada dictamen es procesado por **Mistral AI** (`mistral-large-2411`) que extrae:
- **Título descriptivo** (el original de la CGR suele ser un código críptico)
- **Resumen ejecutivo** de 2-3 oraciones
- **Análisis jurídico** estructurado
- **Etiquetas temáticas** (`nuevo`, `relevante`, `boletin`, etc.)
- **Fuentes legales** citadas en el documento
- **Booleanos jurídicos** (12 campos: `aclarado`, `complementado`, `reconsiderado`, etc.)

### Resiliencia ante Fallos
Si el motor de IA o Pinecone sufre una caída, el sistema **nunca deja de funcionar**. Automáticamente degrada a búsqueda SQL clásica en Cloudflare D1, alertando al usuario con un badge visual "Búsqueda Literal".

### Infraestructura Serverless
Toda la plataforma corre en el edge de Cloudflare: Workers para el backend, Pages para el frontend, D1 para SQL, KV para almacenamiento de documentos crudos. Cero servidores que mantener, cero dependencias de hardware.

---

## 1.3 Usuarios Target

| Perfil | Uso Principal |
|---|---|
| **Abogados auditores** | Búsqueda de precedentes y jurisprudencia aplicable |
| **Consultores CGR** | Análisis de tendencias y materias frecuentes |
| **Funcionarios públicos** | Revisión de criterios históricos en contratos y probidad |
| **Municipalidades** | Consulta de dictámenes sobre temas administrativos locales |
| **Academia** | Investigación jurídica y análisis de evolución normativa |
| **Ciudadanía** | Acceso abierto a la jurisprudencia administrativa |

---

## 1.4 Modelo Operativo

El sistema se auto-mantiene mediante un **Cron Job** que se ejecuta cada 6 horas, descargando automáticamente los dictámenes nuevos de los últimos 3 días desde el sitio oficial de la CGR. El procesamiento posterior (enriquecimiento IA + vectorización) se gestiona mediante batches manuales o automatizados, permitiendo controlar los costos del consumo de API de Mistral.

### Flujo Simplificado

```
CGR.cl (fuente oficial) → [Cron cada 6h] → KV + D1 (ingested)
                                              ↓
                                     [Batch Enrich] → Mistral AI → D1 (enriched)
                                              ↓
                                     [Vectorización] → Pinecone → D1 (vectorized)
                                              ↓
                                     [Búsqueda] → Usuario final
```
