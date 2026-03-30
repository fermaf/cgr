# 04 - Entorno Principal y Despliegue

Este proyecto opera con una sola línea principal.

La referencia operativa real es:

- Worker productivo: `cgr-platform`
- URL productiva del backend: `https://cgr-platform.abogado.workers.dev`
- Pages principal: `cgr-jurisprudencia-frontend`
- URL principal del frontend: `https://cgr-jurisprudencia-frontend.pages.dev`

## Principio operativo

- producción es la línea principal;
- `staging` existe en `wrangler.jsonc`, pero no forma parte del flujo normal de release;
- no debe usarse como “entorno seguro” de escritura porque comparte recursos reales;
- los previews de Pages son útiles para validación puntual, pero no son URLs canónicas del producto.

## Despliegue canónico del backend

Desde `cgr-platform/`:

```bash
npx wrangler deploy --minify
```

Notas:

- este comando publica el Worker productivo real;
- no usar `--env staging` como paso rutinario;
- si el release requiere validación previa, hacerla con build local, smoke tests y worktree limpio.

## Despliegue canónico del frontend

Desde `frontend/`:

```bash
npm run build
npx wrangler pages deploy dist --project-name cgr-jurisprudencia-frontend
```

Notas:

- el alias `head` es un preview técnico del deploy, no la URL principal;
- la URL que debe documentarse y usarse como referencia es `https://cgr-jurisprudencia-frontend.pages.dev`.

## Regla de seguridad

- no introducir nuevos entornos por costumbre;
- no asumir que `staging` aísla datos reales;
- para cambios sensibles, preferir:
  - worktree limpio;
  - `preview` o `dry-run`;
  - lotes pequeños;
  - audit trail;
  - `apply` explícito.

## Checklist mínimo de release

1. build local del frontend
2. validación del Worker real
3. commit limpio
4. deploy desde worktree limpio
5. smoke test sobre la URL principal del frontend y el Worker productivo
