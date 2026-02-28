# Environments: CGR.ai

## Resumen de Entornos
El sistema opera bajo un modelo de entorno local de desarrollo y una infraestructura productiva en Cloudflare.

| Entorno | Host / URL | Propósito |
| :--- | :--- | :--- |
| **Local** | `localhost:8787` | Desarrollo de nuevas features y pruebas de prompts. |
| **Prod** | `cgr-platform.abogado.workers.dev` | Ingesta real y API para clientes. |
| **Frontend** | `cgr-frontend.pages.dev` | Interfaz de búsqueda semántica (Cloudflare Pages). |

## Variables de Entorno (Wrangler Vars)
Definidas en `wrangler.jsonc` o `.dev.vars`:
- `APP_TIMEZONE`: `America/Santiago`
- `CGR_BASE_URL`: `https://www.contraloria.cl`
- `MISTRAL_API_URL`: URL del AI Gateway de Cloudflare.
- `MISTRAL_MODEL`: `mistral-large-2411`
- `PINECONE_INDEX_HOST`: Host del índice de Pinecone.
- `LOG_LEVEL`: `debug | info | warn | error`

## Secretos (REDACTED)
Estos valores **NUNCA** deben persistirse en el repositorio:
- `MISTRAL_API_KEY`: `REDACTED`
- `PINECONE_API_KEY`: `REDACTED`
- `CF_AIG_AUTHORIZATION`: `REDACTED` (Para acceso al AI Gateway).

## Base de Datos (D1)
- **Local:** Persistent SQLite en `.wrangler/state/v3/d1`.
- **Remote:** `cgr-dictamenes` (UUID: `c391c767-2c72-450c-8758-bee9e20c8a35`).
