# AGENTS.md

Este repositorio usa una capa de contexto portable en [`context/`](./context/).

## Lectura obligatoria

Antes de proponer cambios o tocar código:

1. `context/project_constitution.md`
2. `context/project_context.md`
3. `context/architecture_map.md`
4. `context/current_priorities.md`
5. `context/glossary.md`

## Reglas de trabajo

- Documentación y commits en español.
- Deploy cuando el cambio esté listo y validado.
- La búsqueda semántica manda; la doctrina organiza.
- La capa agéntica ayuda al core, no lo reemplaza.
- **Si contexto y código discrepan, prevalece el código.** Actualiza `context/` si el cambio altera la realidad del sistema.

## Estructura del proyecto

- `cgr-platform/`: backend doctrinal (Cloudflare Workers + Hono)
- `frontend/`: aplicación React + Vite (Cloudflare Pages)
- `agents/`: runtime agéntico y skills
- `docs/`: documentación canónica
- `context/`: contexto inicial para agentes nuevos

## Comandos clave

```bash
# Backend
cd cgr-platform && npm run dev        # levanta worker local
cd cgr-platform && npm run deploy    # despliega a production

# Frontend
cd frontend && npm run dev            # levanta app local

# Agents runtime (desde raíz)
npm run agents:check                  # valida estructura + registry
npm run agents:test                   # test loop con skill_ping
npm run agents:wrap:test              # wrapper legacy_check_env_sanity
npm run agents:wrap:baseurl           # wrapper legacy_cgr_network_baseurl_verify
npm run agents:workflow:check         # healthcheck de workflows

# D1 local
cd cgr-platform && npm run d1:sanity  # verifica tablas SQLite locales
```

## Convenciones

- Skills nativas en `agents/skills/`; heredadas en `agents/skills/wrappers/` con prefijo `legacy_`.
- Wrappers validan configuración declarada, no bindings vivos.
- Evitar pseudo-precisión jurídica.

## URLs canónicas

- Backend: `https://cgr-platform.abogado.workers.dev`
- Frontend: `https://cgr-jurisprudencia-frontend.pages.dev`