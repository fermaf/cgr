# CGR Frontend — Portal de Jurisprudencia

Aplicación web React 19 + Vite desplegada en Cloudflare Pages.

Línea principal actual:

- proyecto de Pages: `cgr-jurisprudencia-frontend`
- URL principal: `https://cgr-jurisprudencia-frontend.pages.dev`
- alias `head`: preview técnico del último deploy, no URL canónica

## Inicio Rápido

```bash
npm install
npm run dev      # Desarrollo local en http://localhost:5173
npm run build    # Build de producción
npx wrangler pages deploy dist --project-name cgr-jurisprudencia-frontend
```

## Documentación

Toda la documentación está centralizada en [`/docs`](../docs/README.md):
- [Manual de Usuario](../docs/05_manual_usuario.md) — Interfaz, búsqueda, badges
- [Guía de Desarrollo](../docs/03_guia_desarrollo.md) — Stack, estructura, testing
- [Operación](../docs/04_operacion_y_mantenimiento.md) — Deploy, troubleshooting

## Estructura

```
src/
├── pages/           # Home, Search, DictamenDetail, Stats
├── components/      # layout/, ui/, dictamen/
├── types.ts         # Contratos de API
└── lib/             # Llamadas HTTP
```
