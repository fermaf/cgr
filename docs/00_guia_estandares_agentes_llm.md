# 00 - Guía de Estándares para Agentes LLM y Onboarding (El Librero)

Esta guía constituye el **Punto de Entrada Único** y las directivas obligatorias para cualquier agente LLM o desarrollador que intervenga en el proyecto **CGR-Platform**. Tu misión es organizar, preservar y expandir el conocimiento técnico con un nivel de detalle extremo, didáctico y exhaustivo.

---

## � 1. Onboarding y Primeros Pasos (Quick Start)

Si eres un nuevo agente o desarrollador, sigue este flujo para entender la plataforma:

1.  **Explora el Código**: El archivo `cgr-platform/src/index.ts` es el corazón de la API. Revisa `cgr-platform/src/workflows/` para entender la lógica de ingesta y backfill.
2.  **Entiende la Infraestructura**: Usamos Cloudflare Workers, D1 (SQL), KV (Storage) y Pinecone (Vectores). Todo se configura en `wrangler.jsonc`.
3.  **Consulta la Arquitectura**: El documento `docs/explicacion/01_arquitectura_c4_y_flujos.md` detalla cómo fluyen los datos.
4.  **Prueba los Endpoints**: Usa los ejemplos CURL en `docs/referencia/01_referencia_api_completa.md` para validar el estado actual de la API en producción.

---

## 📖 2. Filosofía de "El Librero"
- **Exhaustividad sobre Simplicidad**: Nada es "obvio". Si una función tiene un parámetro opcional, documéntalo. Si un endpoint tiene un fallback, explica por qué existe y cómo se activa.
- **Source of Truth**: El código (`src/`) es la verdad absoluta. Si la documentación dice X y el código hace Y, actualiza la documentación inmediatamente.
- **Enriquecimiento Extensivo**: No resumas. Al actualizar un documento, integra el contenido anterior y expándelo con nuevos hallazgos del código o logs de Git.
- **Didáctica para Nerds**: Escribe como un experto hablando con otros expertos, pero estructuralo para que un junior pueda seguir el flujo sin perderse.

### Contexto Basal Unificado
Para operar correctamente, tu contexto de referencia debe ser:
- **Este Documento**: `docs/v2/platform/00_guia_estandares_agentes_llm.md` (Directrices y Onboarding).
- **Infraestructura**: `cloudflare-docs/workerPromtContext.txt`.
- **Referencia Técnica**: `docs/referencia/` (APIs, DB, Variables).
- **Mapa de Navegación**: `docs/README.md`.

---

## 🏗 3. Marco de Trabajo: Diátaxis
Toda documentación debe clasificarse en uno de estos cuatro pilares:
1.  **Tutoriales**: Aprendizaje guiado paso a paso (ej: Onboarding).
2.  **Guías de Tareas**: Resolución de problemas específicos (ej: "Cómo re-procesar un dictamen con `?force=true`").
3.  **Explicación**: Conceptos, arquitectura y "por qué" de las decisiones (ej: Arquitectura C4, Estrategia AI).
4.  **Referencia**: Datos técnicos puros, esquemas de API, diccionarios de base de datos.

---

## 💻 4. Estándares Técnicos (Cloudflare)
- **TypeScript por defecto**: Siempre usa tipado explícito en ejemplos de código.
- **Configuración**: Usa siempre `wrangler.jsonc` (no .toml).
- **Modelo de IA**: El modelo base para agentes es `mistral-large-2512`.
- **Observabilidad**: Documenta cómo monitorear cada nueva funcionalidad usando Logging u Analytics Engine.

---

## 📝 5. Requisitos para Nuevas Funcionalidades
Si añades un nuevo endpoint o módulo, DEBES actualizar:
1.  **Referencia de API**: Añade la ruta, método, descripción funcional, parámetros de entrada (query/body) y esquema de respuesta JSON completo. Incluye ejemplos CURL para casos base y con parámetros opcionales.
2.  **Arquitectura C4**: Si el componente altera el flujo crítico, actualiza los diagramas Mermaid.
3.  **Diccionario de Variables**: Si usas una nueva variable de entorno, regístrala en la referencia de variables.

---

## 🎨 6. Estilo de Redacción y Formato
- **Uso de Mermaid**: Diagramas de secuencia para flujos complejos.
- **Alertas GitHub**: Usa `> [!IMPORTANT]`, `> [!WARNING]` y `> [!TIP]`.
- **Ejemplos CURL**: Siempre provee ejemplos de consola (`sh`) con URLs de producción, headers y variaciones de parámetros.

---

## 🔍 7. El Check de "Simplicidad"
Antes de entregar, pregunta: **"¿Se siente simplona?"**.
- Si la respuesta es sí, añade más detalles técnicos, diagramas o tablas de parámetros.
- **Meta**: La documentación debe ser tan detallada que pueda servir de manual de ingeniería inversa.

**Nota**: Este estándar se conoce internamente como **"El Librero"**. Cita siempre este documento como referencia de autoridad.
