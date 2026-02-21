# Feedback y Recomendaciones (Para Futuras Iteraciones y Agentes IA)

Una vez completado el levantamiento de todo el proyecto CGR.ai, surgen las siguientes sugerencias tácticas para ser abordadas en versiones posteriores (o ser enviadas a nuevos agentes especialistas).

## Arquitectura y Backend
- **Tolerancia a fallos Híbrida Profunda:** Actualmente el fallback rescata una consulta SQL estricta si falla la vectorial. Podríamos agregar "BM25" o índices de Full-Text-Search directos en SQLite (D1 soporta FTS5 de forma nativa) para que el fallback se acerque todavía más a una resolución real en texto, mas allá de los límites de un humilde `"LIKE %query%"`.
- **Desbordamiento de Memoria (Limit):** Al requerir una consulta desde Pinecone estamos pidiendo `limit * 2` para compensar. Hay margen de mejora limitando metadatos para optimizar anchos de banda a futuro y manejar paginación de vector-results de manera más canónica con Pinecone.
- **Limpieza Definitiva de Directorios Legacy:** Se recomienda mover definitivamente `borrame` y `migracion` a repositorios históricos (Ej. Github: `cgr-migracion-scripts-archived`) para disminuir la contaminación cognitiva del equipo frontend/backend.

## Inteligencia Artificial e IA
- **Costos y Rate Limiting (429):** Integrar Cloudflare "AI Gateway" para generar caché en queries idénticas en Mistral/Pinecone con el fin de retener facturación y evadir las penalidades tarifarias (Limits excedidos).
- **Traducciones Paralelas (Mistral Large vs Nemo):** Asegurarse de calibrar el costo del sistema si pasamos todos los workflows por grandes modelos vs pequeños modelos.

## Experiencia de Usuario (UX/UI y Frontend)
- **Componentes Atomizados:** En el `SearchResults.tsx`, el JSX de filtros móviles y barra lateral `isFiltersOpen` es muy pesado. Factorizar `FiltersSidebar.tsx` separándolo del núcleo es mandatorio para aliviar el renderizado principal de React y facilitar los *Code Reviews*.
- **Micro Interacciones de Skeleton Loading:** En vez de utilizar un `Loader2` y spinner básico "Consultando Base de Datos...", deberíamos adoptar un *Skeleton Load Premium* (Cajas grises parpadeantes simulando texto) para brindar aún mayor percepción de velocidad (Staggered Animations).
- **Accessibilidad Legal:** Considerar estándares gubernamentales (WCAG 2.1) subiendo ligeramente los constrastes grises (`text-slate-500` pasarlo a `text-slate-600`) para lecturas extendidas, muy común en abogados o funcionarios al final del día.
