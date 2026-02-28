# 06 - Gestión de Entornos y Despliegue

Este documento describe la arquitectura de entornos de **CGR-Platform** y establece los protocolos de seguridad para mitigar riesgos derivados del uso compartido de recursos físicos en la infraestructura de Cloudflare.

---

## ⚠️ ADVERTENCIA CRÍTICA: Recursos Compartidos

> [!CAUTION]
> **PELIGRO DE INTEGRIDAD DE DATOS**
> Actualmente, los entornos de **Staging** (`cgr-platform-staging`) y **Producción** (`cgr-platform`) están configurados para consumir los mismos recursos físicos:
> - **D1 Database**: `cgr-dictamenes`
> - **KV Namespaces**: `DICTAMENES_SOURCE` y `DICTAMENES_PASO`
>
> **Consecuencia**: Cualquier operación de escritura, borrado o migración masiva realizada desde el worker de *Staging* impactará directamente en la base de datos real de *Producción*. El entorno de Staging solo debe usarse para validar lógica de código y gobernanza, **NUNCA** para pruebas destructivas de datos.

---

## 🏗 Niveles de Entorno

| Entorno | Worker Name | Uso Principal | Riesgo |
| :--- | :--- | :--- | :--- |
| **Local** | `cgr-platform (local)` | Desarrollo de lógica y debugging de red. | Bajo (Usa local storage). |
| **Staging** | `cgr-platform-staging` | Pruebas de "hardening" y gobernanza determinista. | **ALTO** (Escribe en DB real). |
| **Prod** | `cgr-platform` | Operación oficial y servicio a usuarios finales. | Máximo. |

---

## 🚀 Comandos de Despliegue

El despliegue se gestiona exclusivamente vía `wrangler`. Asegúrate de estar en el directorio `cgr-platform/`.

### 1. Despliegue a Staging
Ideal para probar cambios en el sistema de **Skills** o nuevos **Workflows** sin afectar el worker de producción.
```bash
npx wrangler deploy --env staging
```

### 2. Despliegue a Producción
Requiere validación previa en staging.
```bash
npx wrangler deploy --env production
```

---

## ⚙️ Configuración de Variables (Control de Drift)

Existen variables que deben diferenciarse para evitar comportamientos inesperados en producción.

| Variable | Staging | Producción | Razón |
| :--- | :---: | :---: | :--- |
| `ENVIRONMENT` | `staging` | `prod` | Identificación en logs. |
| `SKILL_EXECUTION_ENABLED` | `1` | `1` | Permite diagnóstico autónomo. |
| `SKILL_TEST_ERROR` | `1` | **ELIMINAR** | Forzar errores de prueba. |
| `INGEST_TRIGGER_TOKEN` | Token Staging | Token Secreto | Seguridad de disparadores manuales. |

### Protección de Tokens en Producción
Para el endpoint `/ingest/trigger` en producción, el token debe gestionarse como un secreto:
```bash
npx wrangler secret put INGEST_TRIGGER_TOKEN --env production
```

---

## 🛡 Protocolo de Auditoría
Ante cualquier anomalía en el entorno de Staging:
1. **Verificar Logs**: `wrangler tail --env staging`.
2. **Revisar Skill Runs**: 
   ```sql
   wrangler d1 execute cgr-dictamenes --remote --command "SELECT * FROM skill_runs ORDER BY id DESC LIMIT 5;"
   ```
3. **Rollback de Emergencia**: Si un cambio en Staging bloquea la DB compartida, detén el worker:
   ```bash
   wrangler deploy --env staging --var SKILL_EXECUTION_ENABLED:0
   ```
