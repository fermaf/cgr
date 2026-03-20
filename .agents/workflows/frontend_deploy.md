---
description: Proceso de despliegue y actualización de versión del frontend
---
Este flujo DEBE ejecutarse cada vez que un agente de IA realice cambios en el código de la carpeta `frontend/`.

1. **Actualización de Versión y Compilación**:
   - Cada modificación que impacte visualmente el frontend DEBE incrementar la versión menor o el parche en el componente pertinente (ej: `Layout.tsx` o `Sidebar.tsx`).
   - Actualizar la fecha de última compilación (`Last compiled: [YYYY-MM-DD HH:mm]`) en el mismo componente.
   - Esto asegura que el usuario final pueda verificar que sus cambios fueron desplegados con éxito.

2. **Proceso de Build**:
   ```bash
   cd frontend
   npm run build
   ```

3. **Despliegue a Cloudflare Pages**:
   ```bash
   npx --yes wrangler pages deploy dist --project-name cgr-jurisprudencia-frontend
   ```

// turbo-all
4. **Verificación**:
   - Confirmar que la URL de despliegue devuelta sea accesible.
   - Notificar al usuario con el ID de la nueva versión.
