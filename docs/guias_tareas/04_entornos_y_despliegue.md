# 04 - Entornos, Despliegue y Drift de Bases de Datos

Este documento establece los protocolos de seguridad y las reglas para desplegar actualizaciones en la **CGR-Platform**, mitigando riesgos sobre la integridad de la base vectorial y la base D1.

---

## ⚠️ ADVERTENCIA CRÍTICA: Recursos Físicos Compartidos

> [!CAUTION]
> **PELIGRO DE CORRUPCIÓN DE DATOS**
> Por diseño arquitectónico actual, los entornos de **Staging** (`cgr-platform-staging`) y **Producción** (`cgr-platform`) están configurados en `wrangler.jsonc` apuntando a los **mismos recursos físicos**:
> - **D1**: `cgr-dictamenes` (`c391c767-2c72-450c-8758-bee9e20c8a35`)
> - **KV Namespaces**: Mismos IDs para SOURCE y PASO.
>
> **Implicación Inmediata**: Cualquier operación de escritura, borrado o migración DDL realizada desde el worker de *Staging* impactará directamente a los usuarios en *Producción*. Staging es un entorno para validar lógica (ej. una nueva versión del prompt de Mistral), **NUNCA** para ejecutar migraciones SQL destructivas de prueba.

---

## 🏗️ 1. Matriz de Entornos

| Entorno | Comando de Despliegue | Caso de Uso Aprobado | Nivel de Riesgo |
| :--- | :--- | :--- | :--- |
| **Local** | `npm run dev` | Desarrollo de lógica general, tipado y pruebas de endpoints. (Usa SQLite local en `.mf`). | Bajo |
| **Staging** | `wrangler deploy -e staging` | Pruebas de integración de *Workflows* o *Skills* en el EDGE. Validación de latencia Mistral. | **Alto** (Afecta DB Real) |
| **Prod** | `wrangler deploy -e production`| Versión estable consumida por el Frontend CGR.ai. | Máximo |

---

## 🚀 2. Flujo de Despliegue Seguro

### Paso 1: Verificación de Variables (Control de Drift)
Antes de deplegar, inspecciona el bloque `env.staging` vs `env.production` en tu `wrangler.jsonc`.
- **Regla de Oro**: Asegúrate de que las credenciales ocultas (`x-admin-token`, `INGEST_TRIGGER_TOKEN`) no estén *hardcodeadas* en el código fuente.

### Paso 2: Despliegue a Staging
Verifica cómo se comporta el worker en Cloudflare ejecutando un lote de prueba sin afectar toda la cola:
```bash
npx wrangler deploy --env staging
```
*(Prueba hacer una llamada CURL con un `recursive: false` a un endpoint en el dominio de staging).*

### Paso 3: Despliegue a Producción
Una vez que `Staging` haya procesado un Dictamen sin lanzar un `Incident` fatal a la DB:
```bash
npx wrangler deploy --env production
```

---

## 🔐 3. Protocolos de Seguridad y Secretos

### Gestión de Tokens en Producción
ParaEndpoints administrativos como `/api/v1/jobs/repair-nulls` o las subrutas `/ingest/*`, los tokens no deben vivir en el Git. Deben inyectarse como secretos criptográficos en Cloudflare:

```bash
# Seteo de token seguro
npx wrangler secret put INGEST_TRIGGER_TOKEN --env production
```

### Rollback (Plan de Contingencia)
Si un despliegue en Producción corrompe el parseo de la CGR y empieza a inyectar miles de registros erróneos (estado `error_format`):
1. **Pausa inmediata**: No intentes hacer fix forward. Ve al dashboard de Cloudflare y pausa el Cron Trigger.
2. **Reversión**: Busca el último commit estable en Git y redespliega esa versión:
   ```bash
   git checkout <hash_anterior_estable>
   npx wrangler deploy --env production
   ```
3. **Limpieza D1**: Usa queries SQL para eliminar los registros ingresados en la última hora.
