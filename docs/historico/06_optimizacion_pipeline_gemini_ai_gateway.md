# 06 — Optimización del Pipeline de Enriquecimiento: Gemini + AI Gateway

**Fecha:** 2026-04-04  
**Estado:** Completado y en Producción  
**Responsable:** Agente IA (sesión 88f93da6)

---

## 1. Contexto

En el marco del backfill masivo de ~80,000 dictámenes históricos, se identificaron los siguientes problemas que frenaban el procesamiento del lote Importante (dictámenes con `es_relevante = 1` O `en_boletin = 1`):

1. **Gemini no estaba enrutado por AI Gateway** — Las llamadas iban directamente a la API de Google, impidiendo el monitoreo centralizado en Cloudflare AI Gateway.
2. **Error de parseo JSON** — Gemini devuelve en ocasiones la respuesta envuelta en bloques de código markdown (` ```json ... ``` `), lo que causaba un error fatal de `JSON.parse` y dejaba el dictamen en estado `error`.
3. **Sin control de cadencia** — No había un límite de velocidad forzado por el workflow, lo que podía consumir la cuota diaria gratuita de Google Gemini (1,500 RPD) en minutos.
4. **Error de cuota mal manejado** — Cuando se agotaba la cuota, el workflow lanzaba una excepción y terminaba en `error`, en lugar de esperar y reintentar.
5. **Bug de recursividad** — Al lanzar la siguiente instancia recursiva del workflow, los parámetros `allowedStatuses` no se propagaban, lo que causaba que la nueva instancia procesara todos los estados disponibles en lugar de solo los filtrados.

---

## 2. Cambios Realizados

### 2.1 Centralización en AI Gateway (`src/clients/gemini.ts`)

- Se refactorizó `analyzeDictamenGemini` para aceptar una `baseUrl` dinámica desde `env.GEMINI_API_URL`.
- Se añadió el header `cf-aig-authorization` para autenticar con el AI Gateway de Cloudflare.
- **Provider slug usado:** `google-ai-studio`
- La variable de entorno `GEMINI_API_URL` se configuró en `wrangler.jsonc` para los entornos `base`, `staging` y `production` apuntando al gateway centralizado.

### 2.2 Limpieza Robusta de Respuestas JSON

Gemini a veces "envuelve" el JSON en un bloque de markdown, por ejemplo:

```
```json
{
  "titulo": "...",
  "resumen": "..."
}
```
```

Esto provocaba que `JSON.parse()` lanzara un error del tipo:
> **"Unexpected non-whitespace character after JSON at position 6067"**

**Solución implementada en `src/clients/gemini.ts`:**
```typescript
let text = data.candidates[0].content.parts[0].text;
// Limpieza robusta de JSON envuelto en markdown
text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
```

Este cambio hace al sistema inmune a esa mala costumbre del modelo.

### 2.3 Cadencia Controlada: 1 Dictamen por Minuto en Gemini

Para no superar el límite de 1,500 RPD (Rate Per Day) de la capa gratuita de Google Gemini, se implementó un `sleep` de 60 segundos obligatorio después de cada llamada al modelo en el `backfillWorkflow.ts`:

```typescript
// Delay de 1 minuto para respetar 1 RPM en Gemini
await sleep(60000);
```

Con 5 instancias paralelas procesando lotes de 10, esto resulta en ~5 dictámenes por minuto (~1,440 por día).

### 2.4 Suspensión Inteligente por Cuota Agotada

Cuando el Rate Limiter interno (`rate_limits` en D1) detecta que se agotó la cuota diaria, en lugar de lanzar una excepción y marcar el dictamen como `error`, el workflow ahora:

1. Señaliza internamente que la cuota se agotó.
2. Ejecuta un `step.sleep('wait-for-quota-reset', '1 hour')` — la instancia queda **dormida** en Cloudflare por 1 hora, sin consumir recursos.
3. Al despertar, retoma el procesamiento desde donde quedó.

### 2.5 Corrección del Bug de Recursividad

Se corrigió un bug crítico: al encolar la siguiente instancia recursiva, los parámetros no se propagaban correctamente. Ahora se preservan todos los parámetros relevantes:

```typescript
await env.BACKFILL_WORKFLOW.create({
    params: { 
        batchSize, 
        delayMs, 
        recursive: true,
        allowedStatuses: params.allowedStatuses  // ← Corrección
    }
});
```

---

## 3. Auditoría y Recuperación de Datos

### Análisis del Universo Pre-2020

Se realizó un análisis exhaustivo para identificar dictámenes que no tenían análisis basal (Mistral 2512):

| Clasificación | Criterio | Total |
| :--- | :--- | :--- |
| **Candidatos Importantes** (Gemini) | `anio < 2020` AND (`es_relevante = 1` OR `en_boletin = 1`) | **5,921** |
| **Candidatos Triviales** (Mistral 2411) | `anio < 2020` AND ambos atributos en 0 | **68,049** |

### Recuperación de Dictámenes Fallidos

De los 5,921 candidatos importantes, **5,235** estaban en estado `error` o `error_quota` sin enriquecimiento válido. Se ejecutó el siguiente plan de recuperación:

1. **Registro de auditoría:** Se insertaron 5,235 filas en `dictamen_events` con `event_type = 'RECOVERY_GEMINI_RESET'` para trazabilidad completa del cambio.
2. **Actualización de estado:** Los dictámenes se migraron de vuelta a `ingested_importante`.
3. **Re-lanzamiento:** Se dispararon 5 instancias de `backfill-workflow` con `allowedStatuses: ["ingested_importante"]` y lotes de 10.

---

## 4. Configuración de Infraestructura

| Parámetro | Valor |
| :--- | :--- |
| `GEMINI_API_URL` | `https://gateway.ai.cloudflare.com/v1/...` (AI Gateway) |
| `BACKFILL_BATCH_SIZE` | 40 (wrangler.jsonc) |
| Delay entre dictámenes Gemini | 60 segundos (en código) |
| Suspensión por cuota agotada | 1 hora (`step.sleep`) |
| Instancias paralelas | 5 |
| Dictámenes/día estimados | ~1,440 |

---

## 5. Estado Antes y Después

| Problema | Antes | Después |
| :--- | :--- | :--- |
| Routing Gemini | Directo a Google API (sin monitoreo) | A través de Cloudflare AI Gateway |
| Error de parseo markdown | `error` fatal, dictamen bloqueado | Limpieza automática, sin impacto |
| Cuota agotada | Excepción, instancia termina en `error` | `step.sleep(1h)`, retoma automáticamente |
| Propagación de filtros recursivos | Se perdían los `allowedStatuses` | Correctamente preservados |
| Trazabilidad de recuperaciones | Sin registro | `dictamen_events` con tipo `RECOVERY_GEMINI_RESET` |
