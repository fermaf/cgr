# Frontend - Plataforma de Jurisprudencia CGR.ai

Este directorio contiene la interfaz de usuario de la **Plataforma de Consulta de Jurisprudencia Administrativa de la CGR**, construida con un entorno moderno y un diseño enfocado en la usabilidad "Premium Gubernamental/Legal".

## 🚀 Arquitectura y Stack Tecnológico
- **React 19 + Vite**: Entorno rápido con HMR, configurado para proxies API (`/api/*` redirigido a `localhost:8787`).
- **TypeScript**: Para garantizar la robustez e integridad de tipos (e.g. `DictamenMeta`, `DictamenResponse`).
- **Tailwind CSS 4**: Implementación de interfaces modernas, soporte *glassmorphism*, sombras personalizadas (`shadow-premium`), degradados sutiles y paleta curada institucional (tonos `cgr-navy`, `cgr-blue`, `slate`).
- **React Router 7**: Manejo de rutas limpias para búsquedas (`/buscar`) y detalles de documento (`/dictamen/:id`).
- **Lucide React**: Sistema de iconografía ligera y consistente.

## 🛠 Lógica y Flujo de Búsqueda (Tolerancia a Fallos)
Hemos implementado un modelo resiliente en el Frontend capaz de interpretar el motor utilizado por la Inteligencia Artificial del Backend:

1. **Búsqueda Resiliente (`SearchResults.tsx`)**:
   - Cuenta con un timeout de mitigación rápida (`AbortController` a los 15s).
   - Manejadores estrictos de errores que previenen la congelación de la pantalla de carga (Try/Catch).
2. **Identificadores Visuales de Motor de Búsqueda**:
   - Analiza el flag `origen_busqueda` proveniente del Cloudflare Worker.
   - **Badge "BÚSQUEDA SEMÁNTICA"**: Renderizado cuando el Dictamen es retornado matemáticamente por el motor Vectorial (Pinecone + IA).
   - **Badge "BÚSQUEDA LITERAL"**: Renderizado cuando el frontend detecta que el vector falló, pero el servidor rescató la consulta utilizando fragmentación SQL en Cloudflare D1.

## 🎨 Visualización de Textos Íntegros y Datos (`DictamenDetail.tsx`)
- Presentación limpia, en un render robusto.
- Soporte para metadatos, resúmenes analíticos hechos por IA.
- Control de caída ("Fallback") en visores de JSON: Si un dictamen antiguo solo contiene su esqueleto original no-formateado informáticamente, se previene que la interfaz "colapse" su estructura visual envolviendo el JSON en un marco texturizado mono-espaciado `<pre>`, dándole apariencia técnica.

## ⚙️ Desarrollo Local y Despliegue Público
- `npm run dev`: Levanta el sitio en *localhost:5173*. Las peticiones `/api/*` se enviarán en proxy a tu backend local `8787` (que debe estar corriendo simultáneamente con `wrangler dev --remote`).
- `npm run build`: Compila el proyecto completo generando la carpeta web `./dist` para la producción final, lista para subirse a cualquier CDN.
- **Despliegue a Cloudflare Pages**: Cuando el código esté validado, simplemente corre la compilación anterior y luego inyéctala directamente en la nube de Cloudflare usando: `npx wrangler pages deploy dist`
