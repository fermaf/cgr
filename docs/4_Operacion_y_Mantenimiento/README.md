# 4. Operación y Mantenimiento (DevOps y SRE)

## 4.1 Entorno de Ejecución (`wrangler`)
La infraestructura del servidor y base de datos de CGR.ai depende completamente del ecosistema Serverless de [Cloudflare Workers](https://workers.cloudflare.com/). 

### Despliegue Backend (`cgr-platform`)
Todo despliegue del motor CGR se realiza mediante el comando `npx wrangler deploy` en la raíz de `cgr-platform`. Asegúrate de revisar que `wrangler.jsonc` (y/o `wrangler.toml`) no rompa paridad con los bindings (Variables secretas de entorno) ni restrinja parámetros críticos como Cloudflare Worker Observability u opciones incompatibles.

### Despliegue Frontend (`frontend`)
El despliegue está atado a Cloudflare Pages. Se compila con `npm run build` y se lanza con `npx wrangler pages deploy dist`.

## 4.2 Runbooks Básicos (Recuperación y Monitoreo)
1. **Caída del Servicio IA (Mistral 429 Limit Exceeded):** 
   Revisa los límites tarifarios en el proveedor del modelo de inteligencia. Sin embargo, no hay inactividad crítica gracias al diseño tolerante a fallos; los usuarios verán temporalmente los metadatos clásicos en sus dictámenes con el indicador *Búsqueda Literal*.
2. **Caída del Index Vectorial (Pinecone Timeout):**
   Mismo procedimiento anterior. El backend automáticamente consultará SQL si Pinecone se desconecta. Deberás verificar la llave o el saldo temporal en Pinecone Host.
3. **Pérdida Crítica Relacional de Cloudflare D1:** 
   Dispones del `DICTAMENES_SOURCE` en Cloudflare KV, una copia estática, perfecta y atómica (`JSON`) almacenada globalmente fuera de D1. En el script de recuperación en `borrame` y el motor antiguo de la carpeta `migracion`, puedes reconstruir el estado actual en escasos minutos mediante los scripts de *Turbo Feeder*.

## 4.3 Auditorías
El endpoint `/api/v1/stats` se encuentra blindado para visualizar rápidamente los metadatos históricos sobre inserciones a D1 en tiempo real. Utilízalo en tus paneles de administración.
