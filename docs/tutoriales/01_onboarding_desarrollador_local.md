# 01 - Primeros Pasos y Onboarding del Desarrollador

¡Bienvenido a **CGR.ai**! Este tutorial te guiará para configurar tu entorno local y levantar la infraestructura del Cloudflare Worker en tu máquina.

---

## 🛠️ 1. Requisitos Previos

Asegúrate de tener instalado en tu sistema:
- **Node.js** (v18 o superior).
- **npm** o **pnpm**.
- Una cuenta en **Cloudflare** con permisos de despliegue, y Wrangler CLI instalado globalmente:
  ```bash
  npm install -g wrangler
  ```

---

## 🚀 2. Levantar el Worker Localmente

### A. Clonar y Preparar el Repositorio
Ubicado en la carpeta `cgr-platform/`, instala las dependencias:
```bash
cd cgr-platform
npm install
```

### B. Ejecución local (`npm run dev`)
Cloudflare provee un entorno emulado, local, muy similar al real usando **Miniflare**. 
Para lanzar la API en tu máquina (por defecto en `http://localhost:8787`):
```bash
npm run dev
```

> [!NOTE]
> **Datos Locales**: Al correr en local, las bases de datos D1 y los namespaces de KV se emulan en un directorio oculto local (usualmente `.wrangler/state/v3`). **Tu base de datos D1 local empezará vacía.**
>
> Para pruebas reales, puede resultar útil conectar el entorno local (solo para lecturas) a la D1 remota usando `--remote`, pero evita alterar datos.

---

## 🧠 3. Tour Rápido por el Código

Tómate unos minutos para navegar y familiarizarte con esta estratigrafía:

1. **`src/index.ts`**
   - Es el punto de entrada principal (Entrypoint).
   - Usa el framework **Hono** para enrutamiento ultra-rápido de la REST API (`/api/v1/*`).
   - Define las exportaciones requeridas para los Cloudflare Workflows (`export { IngestWorkflow ... }`).

2. **`src/workflows/`**
   - Contiene la orquestación pesada. Revisa `ingestWorkflow.ts` y notarás cómo su lógica se divide en pasos resilientes (`step.do(...)`) que guardan su estado en caso de interrupción.

3. **`src/clients/`**
   - **`mistral.ts`**: Aquí habita la magia del Prompt Consolidado V5.
   - **`cgr.ts`**: Lógica de web-scraping "ninja", donde nos autenticamos a la CGR extrayendo cookies y hacemos bypass a su seguridad básica.
   - **`pinecone.ts`**: El puente directo a la base de datos vectorial para guardar inferencias en la metadata v2.

---

## ✅ 4. Próxima Tarea (Tu primer Test)

Intenta ejecutar una búsqueda de dictámenes usando una herramienta como Postman, cURL o en tu propio navegador interactuando con tu Worker emulado local.

Como tu D1 local estará vacío, el paso inicial sugerido es inyectar un par de dictámenes usando el endpoint de recolección en bloque, revisando la terminal para comprobar cómo se disparan los pasos locales.

**Lectura recomendada antes de seguir experimentando**:
- Revisa las [Guías de Tareas](../guias_tareas/) sobre la operación de los Workflows.
- Lee por completo los mandamientos de diseño en la [Guía Maestra 00](../00_guia_estandares_agentes_llm.md).
