# 2. Arquitectura y Diseño Tecnológico

## 2.1 Visión a Alto Nivel (C4 - Topología Cloudflare)

El sistema opera bajo un ecosistema 100% Serverless, reduciendo costos inactivos y multiplicando la escala mediante instancias distribuidas de borde (Edge Computing).

1. **Interfaz Web (Frontend):** React 19 + Vite alojado en Cloudflare Pages, con una capa de interfaz premium en Tailwind CSS 4.
2. **Capa API (Hono en Workers):** Orquestador central (`cgr-platform/src/index.ts`). Un enrutador liviano pero increíblemente rápido. Define si la búsqueda debe ir por vectorización (primera línea de ataque) o por base relacional (fallback/seguro de vida).
3. **Persistencia (Cloudflare D1 & KV):** 
   - D1 Relacional almacena los dictámenes, la metadata (`estado`, `materia`), el historial IA y la relación M:N de etiquetas, abogados y descriptores.
   - KV (Key-Value Database) resguarda el objeto JSON crudo (`DICTAMENES_SOURCE`), permitiendo una re-indexación instantánea ante catástrofes.
4. **Motor Vectorial (Pinecone):** Se comunica con Cloudflare Workers devolviendo los *maches* matemáticamente más relevantes (`clients/pinecone.ts`).
5. **Cerebro LLM (Mistral AI):** En la fase de Workflow, Mistral extrae resúmenes, títulos coherentes e información booleana desde la masa textual bruta de leyes (`clients/mistral.ts`).

## 2.2 Patrón Arquitectónico de Búsqueda Resiliente (Fallback)

Si el motor de Inferencia Pinecone AI sufriese una caída, el sistema **nunca** debe caer para el funcionario público. 
El `index.ts` atrapará (try/catch) el fallo heurístico de Cloudflare. Automáticamente reescribirá la petición natural en una segmentación SQL básica y la despachará contra Cloudflare D1. El frontend lo alertará sutilmente al renderizar un distintivo "*Búsqueda Literal*", demostrando el protocolo fail-safe al usuario de forma elegante.

## 2.3 Diseño de Base de Datos Relacional

*(El diagrama lógico consta de 13 tablas integradas)*
Principales entidades en uso:
- `dictamen`: La unidad principal. Punteros al estado (ej: 'vectorized') y llaves secundarias.
- `enrichment`: Registro histórico, por id de modelo (ej: Mistral Large) que alberga resúmenes elaborados. Relación 1:N con sus etiquetas resultantes.
