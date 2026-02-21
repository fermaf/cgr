# Arquitectura y Diseño del Frontend - Jurisprudencia CGR

Este documento proporciona una visión técnica detallada de la arquitectura del frontend para asegurar su mantenibilidad y capacidad de reconstrucción por parte de una IA o un desarrollador.

## 1. Stack Tecnológico
- **Framework**: [React 19](https://react.dev/) con [Vite](https://vitejs.dev/) como herramienta de construcción rápida.
- **Lenguaje**: [TypeScript](https://www.typescriptlang.org/) para asegurar tipado estricto y reducir errores en tiempo de ejecución.
- **Estilos**: [TailwindCSS 4](https://tailwindcss.com/) para un diseño responsivo, moderno y eficiente (Government/Legal Premium).
- **Iconografía**: [Lucide React](https://lucide.dev/) para una interfaz limpia y profesional.
- **Enrutamiento**: [React Router 7](https://reactrouter.com/) gestionando navegación SPA (Single Page Application).

## 2. Patrón de Arquitectura: BFF (Backend for Frontend)
El frontend no se comunica directamente con las bases de datos externas. Utiliza un patrón **BFF** implementado mediante **Cloudflare Pages Functions**.

### Flujo de Datos
1. **Cliente (Navegador)**: Realiza peticiones a `/api/v1/*`.
2. **Cloudflare Functions**: Actúan como middleware/proxy.
   - Orquestan llamadas a **Cloudflare D1** (Metadatos SQL).
   - Orquestan llamadas a **Cloudflare KV** (Contenido JSON extendido y Análisis IA).
3. **Respuesta**: La Function unifica los datos y retorna un JSON optimizado para la vista.

## 3. Estructura de Directorios (Módulos Frontend)
- `src/components/`: Componentes reutilizables.
  - `layout/`: Componentes estructurales (Sidebar, Layout).
  - `ui/`: Componentes básicos de interfaz (SearchBar).
  - `dictamen/`: Componentes específicos de dominio (DictamenCard).
- `src/pages/`: Vistas principales vinculadas a rutas.
- `src/types.ts`: Definiciones de interfaces TypeScript que sirven como contrato con la API.
- `functions/`: (Backend local al frontend) Endpoints de la API que corren en el edge de Cloudflare.

## 4. Contratos de API Clave
El frontend espera respuestas estructuradas para alimentar componentes como:
- `DictamenMeta`: Datos básicos para tarjetas y listas.
- `DictamenResponse`: Objeto completo para la vista de detalle, incluyendo `raw` (fuente original) y `intelligence` (análisis de IA).

---
*Nota: Este manual es específico para el módulo de Frontend del proyecto CGR Jurisprudencia.*
