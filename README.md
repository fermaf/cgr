# CGR.ai - Ecosistema de Plataforma Jurídica Inteligente

**Estado de Producción:** Activo
**Motor Princial:** Cloudflare Workers, Cloudflare D1, Mistral AI, Pinecone, React + Vite.

Bienvenidos al repositorio central de **CGR.ai**, el ecosistema de jurisprudencia administrativa avanzada diseñado para la Contraloría General de la República. 

Este proyecto revoluciona la búsqueda y acceso a la normativa mediante Ingesta Masiva, Enriquecimiento vía Large Language Models (LLMs) y Búsquedas Semánticas ultra-rápidas gracias a computación en el borde (Edge Computing) y bases de datos vectoriales.

---

## 📚 Arquitectura Documental (Directorio `docs/`)

Hemos consolidado todo el conocimiento, negocio y operación del sistema en los siguientes volúmenes ubicados en la carpeta `docs/`. **El Código de este repositorio se considera la "Fuente de la Verdad" primaria de toda esta documentación.**
 *(Si existe disonancia entre la documentación y el código en ambiente de producción, obedece al código).*

1. **[Negocio y Estrategia](./docs/1_Negocio_y_Estrategia/README.md):** 
   Propósito del producto, visión gubernamental, por qué usamos IA para el análisis jurídico.
2. **[Arquitectura y Diseño](./docs/2_Arquitectura_y_Diseno/README.md):** 
   Diagramas de componentes (C4), flujos de Cloudflare Workers, modelo relacional D1 de 13 tablas y modelo vectorial (Pinecone).
3. **[Guía de Desarrollo y Onboarding](./docs/3_Guia_de_Desarrollo/README.md):** 
   Manual para programadores junior/senior. Estructura de repositorios (`frontend`, `cgr-platform`), convenciones de código y comentarios didácticos añadidos en `.tsx` y `.ts`.
4. **[Operación y Mantenimiento](./docs/4_Operacion_y_Mantenimiento/README.md):** 
   Runbooks operativos, despliegues mediante `wrangler deploy`, estrategias de tolerancia a fallos y observabilidad.
5. **[Manual de Usuario](./docs/5_Manual_de_Usuario/README.md):** 
   Instrucciones finales para el abogado/consultor fiscal. Explicación didáctica sobre los badges de "BÚSQUEDA SEMÁNTICA" y "BÚSQUEDA LITERAL" del frontend.

---

## 🛠 Topología del Repositorio Raíz

- `/cgr-platform/`: **(PRODUCCIÓN)** Backend Serverless escrito en TypeScript. Contiene el orquestador (`Hono`), `Cloudflare Workflows` y la lógica de contacto con `Pinecone` y `Mistral AI`.
- `/frontend/`: **(PRODUCCIÓN)** Aplicación web React/Vite orientada al usuario final, con un diseño institucional y heurísticas de tolerancia a fallos.
- `/migracion/`: *(HISTÓRICO)* Scripts turbocargados que se utilizaron por única vez para mover la base de datos documental (`@mongoBackup`) hacia la estructura relacional Cloudflare `D1`. 
- `/borrame/`: *(HISTÓRICO)* Código legacy y bocetos de documentación antigua (*Deprecated*).
- `/docs/`: Centro documental empresarial y consolidado.

## ✅ Recomendaciones de Mejora Continua
Para acceder a un listado de oportunidades y refactorizaciones detectadas por nuestro equipo de Agentes Expertos IA, revisa el archivo **[feedback.md](./feedback.md)** en la raíz de este proyecto.
