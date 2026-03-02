# 00 - Guía de Estándares para Agentes LLM

Esta guía establece las directivas obligatorias para cualquier agente LLM o desarrollador que intervenga en la documentación del proyecto **CGR-Platform**. Como  tu misión es organizar, preservar y expandir el conocimiento técnico con un nivel de detalle extremo, didáctico y exhaustivo.

---

## 📖 1. Filosofía 
- **Exhaustividad sobre Simplicidad**: Nada es "obvio". Si una función tiene un parámetro opcional, documéntalo. Si un endpoint tiene un fallback, explica por qué existe y cómo se activa.
- **Source of Truth**: El código (`src/`) es la verdad absoluta. Si la documentación dice X y el código hace Y, actualiza la documentación inmediatamente.
- **Didáctica para Nerds**: Escribe como un experto hablando con otros expertos, pero estructuralo para que un junior pueda seguir el flujo sin perderse.
- **Contextos por default**: Tus conextos basales son:
### Contexto de infraestructura
  - `cloudflare-docs/workerPromtContext.txt`
### Contexto de la plataforma (tú misma)
  - `docs/v2/platform/00_guia_estandares_agentes_llm.md`
### Contexto de la arquitectura
  - `docs/v2/platform/02_arquitectura_c4.md`
### Contexto de ti misma
  - `README.md`

- **Autoreferencia**: Cita el enlace a este documento en la documentación que generes. (puedes mejorarlo, si lo crees necesario)
---

## 🏗 2. Marco de Trabajo: Diátaxis
Toda documentación nueva debe clasificarse en uno de estos cuatro pilares:
1. **Tutoriales**: Aprendizaje guiado paso a paso.
2. **Guías de Tareas**: Resolución de problemas específicos (ej: "Cómo re-procesar un dictamen").
3. **Explicación**: Conceptos, arquitectura y "por qué" de las decisiones (ej: Arquitectura C4).
4. **Referencia**: Datos técnicos puros, esquemas de API, diccionarios de base de datos.

---

## 💻 3. Estándares Técnicos (Cloudflare)
Sigue estrictamente el archivo `cloudflare-docs/workerPromtContext.txt`:
- **TypeScript por defecto**: Siempre usa tipado explícito en ejemplos de código.
- **Configuración**: Usa siempre `wrangler.jsonc` (no .toml).
- **Modelo de IA**: El modelo base para agentes es `mistral-large-2512`.
- **Observabilidad**: Documenta cómo monitorear cada nueva funcionalidad usando Logging u Analytics Engine.

---

## 📝 4. Requisitos para Nuevas Funcionalidades
Si añades un nuevo endpoint, módulo o skill, DEBES actualizar:
1. **Referencia de API (`03_referencia_api.md`)**: Añade la ruta, método, descripción funcional, parámetros de entrada (query/body) y esquema de respuesta JSON completo.
2. **Arquitectura C4 (`02_arquitectura_c4.md`)**: Si el componente altera el flujo crítico, actualiza los diagramas Mermaid.
3. **Casos de Uso (`05_casos_de_uso.md`)**: Provee al menos un ejemplo real de cómo se usa la nueva funcionalidad.

---

## 🎨 5. Estilo de Redacción y Formato
- **Uso de Mermaid**: Diagramas de secuencia para flujos complejos, diagramas de clase para lógica de datos.
- **Alertas GitHub**: Usa `> [!IMPORTANT]`, `> [!WARNING]` y `> [!TIP]` para resaltar información crítica.
- **Ejemplos CURL**: Siempre provee ejemplos de consola (`sh`) para endpoints de API. Deben incluir:
  - URL real de producción (ej: `https://cgr-platform.abogado.workers.dev`).
  - Headers necesarios (`Content-Type`, `Accept`, `x-admin-token`).
  - Escenarios para cada variación de parámetros (query strings y body JSON).
- **No dejar secciones vacías**: Si te falta información, búscala en el código. Si es inferida, márcala como tal.

---

## 🔍 6. El Check de "Simplicidad"
Antes de entregar tu documentación, hazte esta pregunta: **"¿Se siente simplona?"**.
- Si la respuesta es sí, añade más detalles técnicos, diagramas de secuencia o tablas de parámetros.
- **Meta**: La documentación debe ser tan detallada que pueda servir de manual de ingeniería inversa.

**Nota para el Agente**: 
En el texto escrito o prompt, estos standares se puden referir como "El Librrero".
