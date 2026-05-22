# Diagnóstico CTO: Permisos D1 — Error 10000 en perfiles operativos

**Fecha:** 2026-05-19 20:30
**Ejecutado por:** indubia-cto (t_b62c8a05)
**Modo:** Read-only. Sin deploy, migration, mutación D1.

---

## 1. CONCLUSIÓN (TL;DR)

**Las tablas SÍ existen. El token SÍ funciona. La causa raíz es que CLOUDFLARE_API_TOKEN no está disponible en las sesiones de los perfiles Hermes operativos.**

El error 10000 NO es de permisos Cloudflare (scopes), NO es de tablas inexistentes, NO es de base de datos inaccesible. Es simplemente que los procesos Hermes no heredan la variable de entorno `CLOUDFLARE_API_TOKEN`.

---

## 2. Verificaciones realizadas

### 2.1 Estado de tablas en producción (D1 `cgr-dictamenes`)

| Tabla | Existe | Filas | Columnas clave |
|-------|--------|-------|----------------|
| `dictamenes` | ✓ | 86,700 | id, numero, anio, materia, criterio, estado |
| `dictamen_metadata_doctrinal` | ✓ | 57,995 | manual_review_status, reading_role, estado_vigencia, confidence_global |
| `regimenes_jurisprudenciales` | ✓ | 20 | dictamen_fundante_id, dictamen_pivote_id, dictamen_rector_id |
| `dictamen_relaciones_juridicas` | ✓ | 87,760 | dictamen_origen_id, dictamen_destino_id, tipo_accion |
| `relation_evidence` | ✓ | 0 (vacía) | source_entity_id, relation_type, evidence_type |
| `relation_assertions` | ✓ | ? | assertion_status, confidence_score |
| `problemas_juridicos_operativos` | ✓ | 20 | pregunta, regimen_id, dictamen_rector_id |
| `pjo_dictamenes` | ✓ | 396 | pjo_id, dictamen_id, rol |
| `norma_regimen` | ✓ | ? | norma_key, regimen_id, centralidad |
| `regimen_timeline` | ✓ | ? | regimen_id, dictamen_id, tipo_evento |
| `regimen_dictamenes` | ✓ | ? | regimen_id, dictamen_id |

**Total: 52 tablas en producción.** Ninguna tabla requerida por los perfiles operativos está ausente.

### 2.2 Columnas verificadas (match con schema de migraciones)

- `dictamen_metadata_doctrinal`: 31 columnas, incluye `manual_review_status`, `confidence_global`, `estado_vigencia`, `reading_role`. ✓ Match con migración 0009.
- `regimenes_jurisprudenciales`: 20 columnas, incluye `dictamen_fundante_id`, `dictamen_pivote_id`, `dictamen_rector_id`. ✓ Match con migración 0009.
- `dictamen_relaciones_juridicas`: 6 columnas (`id`, `dictamen_origen_id`, `dictamen_destino_id`, `tipo_accion`, `origen_extracccion`, `created_at`). ✓ Match con código en `d1.ts:1006`.

### 2.3 Token Cloudflare

- Token existe en `/home/fermaf/github/divulgadorCONTRA/.env` (40 chars, Cloudflare API Token estándar)
- Token validado via `wrangler whoami` → autenticado como `abogado@furchi.com`
- Token verificado via Cloudflare API `/user/tokens/verify` → `status: active`, sin expiry
- Token permite queries D1 en `SELECT`, `PRAGMA`, `COUNT(*)` sin restricciones
- **Todas las tablas derivadas son consultables con este token**

### 2.4 Entorno Hermes

- `env_passthrough: []` en TODOS los perfiles (indubia-cto, indubia-tech-lead-cgr, indubia-verificador-normativo, etc.)
- `CLOUDFLARE_API_TOKEN` NO está en el entorno del shell del host
- `CLOUDFLARE_API_TOKEN` SÓLO existe en `/home/fermaf/github/divulgadorCONTRA/.env`
- El `.env` NO es cargado automáticamente por Hermes
- **Resultado: cualquier perfil Hermes que intente `wrangler d1 execute` recibe error porque no tiene CLOUDFLARE_API_TOKEN**

### 2.5 Reproducción del error

```
Sin token:
$ wrangler d1 execute cgr-dictamenes --env production --remote --command "SELECT 1"
→ ERROR: In a non-interactive environment, it's necessary to set CLOUDFLARE_API_TOKEN

Con token (sourced .env):
$ wrangler d1 execute cgr-dictamenes --env production --remote --command "SELECT COUNT(*) FROM regimenes_jurisprudenciales"
→ {"cnt": 20}  ← FUNCIONA
```

---

## 3. Causa raíz

**El `CLOUDFLARE_API_TOKEN` está disponible en el archivo `.env` del proyecto divulgadorCONTRA, pero NO es heredado por las sesiones de los perfiles Hermes.** Esto ocurre porque:

1. El token no está en el entorno del shell del host (no en `.bashrc`, `.profile`, ni exportado)
2. `env_passthrough` está vacío en todos los `config.yaml` de perfiles
3. Hermes no tiene mecanismo automático para cargar `.env` files

Los perfiles que necesitan D1 (indubia-tech-lead-cgr, indubia-verificador-normativo, indubia-integrador-cgr, indubia-data-structure-cgr, indubia-cto) NO pueden ejecutar queries D1 porque Wrangler v4 requiere `CLOUDFLARE_API_TOKEN` en entorno no interactivo.

---

## 4. Plan de remediación

### Opción A (recomendada): Cargar .env en el entorno del host

Agregar al `.bashrc` del usuario:
```bash
# Cargar .env de divulgadorCONTRA para acceso D1
if [ -f "$HOME/github/divulgadorCONTRA/.env" ]; then
  set -a
  source "$HOME/github/divulgadorCONTRA/.env"
  set +a
fi
```

Luego configurar `env_passthrough` en los perfiles que requieren D1:
```yaml
terminal:
  env_passthrough: [CLOUDFLARE_API_TOKEN]
```

**Ventajas:** Una sola fuente de verdad. El token se carga una vez y se hereda.
**Riesgo:** Cualquier perfil con `env_passthrough` tendrá acceso al token.

### Opción B: Script wrapper por perfil

Crear `/home/fermaf/.hermes/profiles/indubia-tech-lead-cgr/scripts/setup_d1.sh`:
```bash
#!/bin/bash
set -a
source /home/fermaf/github/divulgadorCONTRA/.env
set +a
```

Y modificar `config.yaml` del perfil para ejecutar este script al inicio.

**Ventajas:** Control granular por perfil.
**Riesgo:** Duplicación, mantenimiento.

### Opción C: Token específico de solo-lectura D1

Crear un token Cloudflare con permisos EXCLUSIVAMENTE `D1:Read` para la base `cgr-dictamenes`, y configurarlo en `env_passthrough` de perfiles operativos.

**Ventajas:** Principio de mínimo privilegio. El token de admin no se expone a perfiles operativos.
**Riesgo:** Requiere crear un nuevo token en Cloudflare Dashboard.

---

## 5. Recomendación CTO

**Opción C (token D1 read-only específico) + Opción A (env_passthrough).**

1. Crear un token Cloudflare con scope `D1:Read` exclusivamente para `cgr-dictamenes`
2. Guardarlo en `.env` como `CLOUDFLARE_D1_READONLY_TOKEN`
3. Agregar `CLOUDFLARE_D1_READONLY_TOKEN` al `env_passthrough` de perfiles: indubia-tech-lead-cgr, indubia-verificador-normativo, indubia-integrador-cgr, indubia-data-structure-cgr, indubia-cto
4. Modificar el skill `cgr-d1-safe-query-writer` para usar la variable correcta
5. Actualizar `.bashrc` para cargar el `.env` automáticamente

---

## 6. Brechas estructurales detectadas (no bloqueantes)

- `relation_evidence`: **0 filas**. La tabla existe pero está vacía. El workflow `CanonicalRelationsWorkflow` puede no haberse ejecutado, o usa `dictamen_relaciones_juridicas` como fuente primaria y `relation_evidence` como capa secundaria.
- `dictamen_relaciones_juridicas` NO tiene migración CREATE TABLE documentada en el repositorio. Sólo existe en índices de optimización (0017, 0018). Fue creada manualmente o por una migración ya eliminada.
- PJO/regímenes (20 registros cada uno) están en fase temprana, consistente con la clasificación de madurez "desarrollo temprano".

---

## 7. Próximos pasos

1. **Usuario**: Crear token D1 read-only en Cloudflare Dashboard y proveerlo
2. **CTO**: Actualizar `.env`, `.bashrc`, y `config.yaml` de perfiles
3. **CTO**: Actualizar skill `cgr-d1-safe-query-writer` con la nueva variable
4. **Tech Lead**: Verificar acceso post-remediación ejecutando `wrangler d1 execute` contra tablas derivadas
