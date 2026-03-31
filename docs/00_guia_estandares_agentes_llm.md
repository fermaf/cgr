# 00 - Guía de Estándares para Agentes LLM y Onboarding (El Librero)

Esta guía es la referencia de documentación, onboarding técnico y estándares de explicación para cualquier agente LLM o desarrollador que intervenga en **Indubia / CGR-Platform**.

No reemplaza la constitución del proyecto. Las reglas de producto, arquitectura y operación diaria viven en:

- `AGENTS.md`
- `context/project_constitution.md`
- `context/project_context.md`

Aquí el foco es otro: documentar bien, explicar bien y mantener trazabilidad técnica útil.

---

## 1. Onboarding y Primeros Pasos

Si eres un nuevo agente o desarrollador, sigue este flujo:

1. **Carga el contexto portable**: lee `AGENTS.md` y luego `context/README.md`.
2. **Explora el código**: `cgr-platform/src/index.ts` es el corazón de la API. Revisa `cgr-platform/src/workflows/` para entender ingesta y backfill.
3. **Entiende la infraestructura**: usamos Cloudflare Workers, D1, KV y Pinecone. La configuración real vive en `cgr-platform/wrangler.jsonc`.
4. **Consulta la arquitectura**: `docs/explicacion/01_arquitectura_c4_y_flujos.md` detalla flujos y componentes.
5. **Prueba los endpoints**: usa los ejemplos CURL en `docs/referencia/01_referencia_api_completa.md` para validar el estado actual de la API en producción.

---

## 2. Filosofía de "El Librero"

- **Exhaustividad con criterio**: si una función tiene fallback, explica por qué. Si un endpoint tiene ramas, documenta cuándo ocurre cada una.
- **Source of truth**: el código es la verdad. Si la documentación discrepa, actualízala.
- **Expansión útil**: no se trata de escribir por escribir. Se trata de dejar contexto suficiente para que otro agente o desarrollador no tenga que reconstruir el sistema desde cero.
- **Didáctica técnica**: escribe para expertos, pero con estructura suficiente para que el flujo se siga sin adivinar.

### Contexto basal unificado

Para operar correctamente, tu base de contexto debe ser:

- `AGENTS.md`
- `context/README.md`
- este documento: `docs/00_guia_estandares_agentes_llm.md`
- `docs/referencia/`
- `docs/README.md`

---

## 3. Marco de Trabajo: Diátaxis

Toda documentación debe clasificarse en uno de estos pilares:

1. **Tutoriales**: aprendizaje guiado paso a paso.
2. **Guías de tareas**: resolución de problemas específicos.
3. **Explicación**: conceptos, arquitectura y por qué.
4. **Referencia**: datos técnicos puros, contratos y esquemas.

---

## 4. Estándares Técnicos

- **TypeScript por defecto**: usa tipado explícito en ejemplos y contratos.
- **Configuración**: usa `wrangler.jsonc`, no `.toml`, para Workers.
- **Modelos de IA**:
  - enrichment doctrinal: `mistral-large-2512`
  - query understanding: `mistral-large-2411`
- **Observabilidad**: documenta cómo monitorear funcionalidades nuevas cuando cambien flujos críticos.

---

## 5. Requisitos para Nuevas Funcionalidades

Si añades o cambias una capacidad relevante, actualiza lo que corresponda:

1. **Referencia de API**: ruta, método, parámetros, esquema de respuesta y ejemplos.
2. **Arquitectura / explicación**: si cambia el flujo crítico, actualiza la documentación conceptual.
3. **Variables de entorno**: si aparece una nueva, regístrala en referencia.
4. **Contexto portable**: si el cambio altera el estado real del sistema, actualiza `context/`.

---

## 6. Estilo de Redacción y Formato

- **Uso de Mermaid**: solo cuando el flujo realmente lo necesite.
- **Alertas GitHub**: usa `> [!IMPORTANT]`, `> [!WARNING]` y `> [!TIP]` con moderación útil.
- **Ejemplos CURL**: usa URLs de producción cuando el objetivo sea validar estado real.
- **Ámbito de esta guía**: este documento regula cómo documentar y explicar. Las reglas de producto, lenguaje jurídico y cambio seguro viven en `context/project_constitution.md`.

---

## 7. Check Final

Antes de cerrar una iteración, pregunta:

- ¿la documentación refleja el sistema real?
- ¿otro agente podría continuar sin reconstruir el contexto?
- ¿el documento explica el porqué y no solo el qué?

Si la respuesta es no, falta contexto.

**Nota**: este estándar se conoce internamente como **El Librero**. Úsalo como autoridad para documentación y onboarding técnico, no como sustituto de la constitución del proyecto.
