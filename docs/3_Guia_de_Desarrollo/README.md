# 3. Guía de Desarrollo y Onboarding

Este documento está diseñado especialmente para los nuevos talentos (Programadores Junior o Externos) que se integren al equipo Cloudflare/React de CGR.ai.

## 3.1 El Código es la Única Verdad 

Olvídate de las carpetas `@borrame` y `@migracion` del ecosistema histórico. Si quieres entender cómo fluyen los datos en tiempo real hoy en día, **las respuestas de vida o de muerte de producción están alojadas en el Backend (`cgr-platform/src`) y el Frontend (`frontend/src`)**. 

Si modificas algo, el código de esos dos repositorios tiene comentarios traducidos 100% al español, explicados de forma interactiva y con propósito. 

## 3.2 Stack de Ingreso Rápido

- TypeScript Obligatorio y estricto. (Infinita tipificación en `cgr-platform/src/types.ts`).
- **Cloudflare Workers**: Ejecútalo en la consola de `cgr-platform` usando el comando `npm run dev`. Usa herramientas como Wrangler.
- **Vite & React 19**: Levántalo con `npm run dev` en la consola de `frontend`. Ya cuenta con proxies automáticos para hablar con el worker local en el puerto `8787`.

## 3.3 Patrones de Diseño Usados
1. **Flujo CGR a Vectores (Ingest Workflow):** Revisa el Workflow de Cloudflare en `ingestWorkflow.ts`. Es un proceso asíncrono potente. Cada `item.do` es independiente. Evita mutaciones globales.
2. **Controladores Limpios (Hono):** Mantén los endpoints de lógica de negocio en `index.ts` legibles. Todo llamado de base de datos extra se aísla en `/clients` si es API de terceros o `/storage` si es base de datos D1 local.
3. **Tailwind CSS Estándar CGR:** Revisa el archivo CSS principal o `tailwind.config` si existe, usa siempre el color corporativo *cgr-navy* (`#0a192f` u análogo) que demuestre sobriedad, y *cgr-blue* para contrastes ("Shadow-premium").
