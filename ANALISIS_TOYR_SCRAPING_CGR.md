# ANALISIS LEGAL: Términos de Uso CGR y Legitimidad del Scraping

**Repositorio:** cgr (https://github.com/fermaf/cgr)
**Generado:** 2026-05-04 por CLO — Agente de Cumplimiento Legal
**Ref:** FURAA-18 — Bloqueo crítico #1
**Clasificación:** LEGAL — CONFIDENCIAL

---

## RESUMEN EJECUTIVO

| Hallazgo | Nivel de riesgo | Estado |
|---|---|---|
| robots.txt bloquea todo acceso | ALTO | Detectado |
| El scraping del buscador usa endpoint `/apibusca` no documentado | ALTO | Confirmado |
| Condiciones de uso del portal de datos abiertos是不一样的 | MEDIO | Detectado |
| No hay autorización expresa de CGR para scraping comercial | ALTO | Confirmado |
| Los dictamenes son documentos públicos pero la extracción automatizada requiere legitimación | MEDIO | Por determinar |

---

## 1. ANÁLISIS DE robots.txt

### 1.1 Contenido

```
User-agent: *
Disallow: /
```

**Interpretación:** El archivo `robots.txt` de `contraloria.cl` y `cgr.cl` indica que **todos los user-agents tienen prohibido acceder a cualquier recurso del sitio**. Esto incluye:

- El buscador de dictámenes (`/web/cgr/buscador`)
- La API interna (`/apibusca/search/dictamenes`)
- Cualquier otro endpoint

### 1.2 Valor jurídico de robots.txt

En Chile, `robots.txt` **no tiene fuerza legal vinculante** como norma reguladora. Es un mecanismo de crawl-discovery heredado de la industria互联网 que funciona por autorregulación. Su omisión o configuración restrictiva **no constituye autorización ni prohibición legal**.

Sin embargo, **el cumplimiento de robots.txt es relevante** para evaluar:
- La **intención manifestada** del operador del sitio respecto al acceso automatizado
- El estándar de la industria (bots lícitos deben respetarlo)
- El posible carácter **no autorizado** del acceso si se ignora

**Conclusión robots.txt:** El bot que accede a `/apibusca/search/dictamenes` está ignorando la instrucción `Disallow: /` manifestada por CGR. Esto no es automáticamente ilegal, pero sí es un **indicio de acceso no solicitado**.

---

## 2. ANÁLISIS DEL PORTAL DE DATOS ABIERTOS vs. SCRAPING

### 2.1 Portal de Datos Abiertos (datos-abiertos.contraloria.cl)

La CGR mantiene un portal de datos abiertos en `https://www.contraloria.cl/multisite/datos-abiertos/` con condiciones de uso explícitas (documento PDF disponible).

**Condiciones aplicables del portal de datos abiertos:**

| Condición | Texto relevante | Implicancia |
|---|---|---|
| Acceso libre | "Información de libre acceso" | Compatible con reutilización |
| Fines particulares y no comerciales | "Uso permitido: fines particulares y no comerciales" | **INCOMPATIBLE** con uso comercial en plataforma INDUBIA |
| Prohibición de uso comercial | "Se prohíbe especialmente: (b) Usar contenidos con propósitos comerciales" | **BLOQUEO DIRECTO** para INDUBIA SpA |
| Prohibición de supresión de copyright | "Suprimir, eludir o manipular el copyright" | Los dictamenes attribution debe mantenerse |
| Sin datos personales | "Toda información publicada no contendrá datos personales" | Parcialmente mitigado |

### 2.2 Scraper del repositorio cgr vs. portal oficial

El cliente `cgr.ts` usa el endpoint `/apibusca/search/dictamenes`, que es el **buscador oficial del sitio web de CGR**, no el portal de datos abiertos.

**Diferencias críticas:**

| Aspecto | Portal Datos Abiertos | Scraper /apibusca |
|---|---|---|
| Autorización expresa | Condiciones de uso PDF | No hay |
| Finalidad | Transparencia proactiva | No prevista |
| Términos de uso | Explicitados | No explicitados |
| Acceso programático | No documentado como feature | Uso de API interna |
| Interfaz | Diseñada para humanos | Diseñada para sesión browser |

**Conclusión:** El scraping de `/apibusca` **no está cubierto** por las condiciones del portal de datos abiertos (que son para el subdomain `/multisite/datos-abiertos/`). Es un uso de una funcionalidad interna que CGR no ha publicado ni autorizado para consumo programático externo.

---

## 3. MARCO NORMATIVO APLICABLE

### 3.1 Ley 20.285 sobre Acceso a la Información Pública

Los dictamenes de la CGR son **documentos públicos** en el sentido de la Ley 20.285 (art. 5 y 8). Su contenido puede ser consultado y utilizado.

**Alcance de la Ley 20.285:**
- Obliga a los órganos del Estado a entregar información pública
- **No regula** el método de extracción automatizada
- **No prohíbe** usar información ya obtenida legítimamente
- **No otorga** licencia sobre los contenidos

**Utilidad:** Los dictamenes son información pública; acceder a ellos por cualquier medio lícito (incluyendo scraping eventual) es consistencia con el principio de transparencia. Pero el uso posterior está limitado por las condiciones del sitio.

### 3.2 Ley 19.628 sobre Protección de Datos Personales

**Riesgo identificado:** Los dictamenes pueden contener datos personales (nombres de funcionarios, RUT, datos de entidades fiscalizadas).

**Hallazgo:** El repositorio no ha sido auditado para verificar si el corpus contiene datos personales no anonimizados. Esto es un **riesgo ALTO** independiente del tema de scraping.

**Acción requerida:** Auditoría de presencia de RUT, nombres completos, u otros datos personales en el corpus. Verificación de que la excepción del art. 4 Ley 19.628 (datos públicos) aplica.

### 3.3 Ley 17.374 — Ley Orgánica de la Contraloría

Fija las funciones de la CGR, incluyendo la emisión de dictamenes. Los dictamenes son actos administrativos en el ejercicio de función pública.

**Implicancia:** Los dictamenes emitidos en el ejercicio de función pública tienen carácter de acto administrativo. Su reproducción tiene limitaciones propias del derecho administrativo.

### 3.4 Ley 21.180 — Transformación Digital del Estado

Aplicable en la medida que el servicio busques procesa dictámenes electrónicos y debe garantizar trazabilidad, integridad y autenticidad.

---

## 4. EVALUACIÓN DE RIESGO: SCRAPING vs. COMPRA/LICENCIA

### 4.1 Escenario actual: Scraping sin autorización

| Factor | Evaluación |
|---|---|
| Violación de robots.txt | Sí (indicativo de acceso no solicitado) |
| Violación de ToS portal datos abiertos | Parcial (el scraping no usa el portal) |
| Violación de Ley 20.285 | No (los dictamenes son públicos) |
| Violación de Ley 19.628 | Por determinar (datos personales) |
| Autorización expresa de CGR | NO |
| Uso comercial por INDUBIA | SÍ (prohibido por condiciones portal) |

**Riesgo global: ALTO** para uso comercial de la plataforma INDUBIA.

### 4.2 Escenarios alternativos

| Escenario | Riesgo | Costo estimado | Viabilidad |
|---|---|---|---|
| Mantener scraping actual sin cambios | ALTO | Cero | Riesgo legal latente |
| Solicitar autorización письменная a CGR | BAJO | Tiempo de gestión | Requiere gestión institucional |
| Adquirir acceso a API oficial (si existe) | BAJO | Por definir | Depende de si CGR tiene API |
| Usar portal datos abiertos con restricciones | MEDIO | Bajo | Solo fines no comerciales |
| Migrar a fuentes oficiales alternativas (BCN) | NULO | Desarrollo | Recomendado para producción |
| Comprar数据集 a proveedor certificado | BAJO | Alto | Sin análisis de mercado |

---

## 5. HECHOS CONFIRMADOS

1. El repositorio `cgr` de fermaf contiene aproximadamente **86.000 dictamenes** obtenidos mediante scraping del sitio `cgr.cl`.
2. El scraping utiliza una **sesión browser** simulada (`User-Agent`, cookies) para acceder al endpoint `/apibusca/search/dictamenes`.
3. El sitio `cgr.cl` tiene `robots.txt` con `Disallow: /` para todos los bots.
4. El portal de datos abiertos de CGR (subdomain `/multisite/datos-abiertos/`) tiene condiciones que **prohíben el uso comercial** explícitamente.
5. **No existe** evidencia de que CGR haya autorizado expresamente el uso programático o comercial de sus dictámenes.
6. El dataset fue obtenido inicialmente desde **MongoDB** (historico) y complementado con el pipeline de scraping.
7. El corpus no ha sido auditado para verificar presencia de **datos personales** bajo Ley 19.628.

---

## 6. HALLAZGOS Y RECOMENDACIONES

### 6.1 Para el bloqueo crítico #1 (Verificar ToS CGR y legitimidad del scraping)

**Hallazgo confirmatorio:** El scraping del buscador CGR opera en zona gris legal. No existe autorización expresa, pero los dictamenes son documentos públicos bajo Ley 20.285.

**Recomendaciones:**

| Prioridad | Acción | Responsable | Plazo |
|---|---|---|---|
| CRÍTICA | Solicitar autorización письменная a CGR para uso comercial de dictámenes | Gestión institucional (INDUBIA) | Antes de MVP |
| ALTA | Auditar corpus para datos personales (RUT, nombres) | CLO + equipo legal | Antes de cualquier uso |
| ALTA | Investigar si CGR ofrece API oficial o acceso programático a dictamenes | CTO | Antes de MVP |
| MEDIA | Explorar alternativas: BCN (para leyes), portal datos abiertos (para統計) | CTO | Corto plazo |
| MEDIA | Evaluar migrar ingestion a fuentes oficiales (BCN para textos legales, portales abiertos para datos) | CTO | Mediano plazo |

### 6.2 Recomendación de continuidad para el MVP

**El dataset actual de dictamenes puede usarse para:**

- Desarrollo y pruebas internas
- Demostraciones no comerciales
- Investigación académica

**No debe usarse para:**

- Servicio comercial en producción
- Sin antes obtener autorización de CGR
- Sin auditoría de datos personales completa

**Recomendación para la plataforma legal:** Priorizar fuentes oficiales alternativas como BCN (`bcn.cl`) para el corpus normativo, y tratar los dictamenes CGR como un dataset de enriquecimiento sujeto a validación de legitimidad.

---

## 7. FUENTES CONSULTADAS

| Fuente | URL | Fecha consulta |
|---|---|---|
| robots.txt CGR | https://www.contraloria.cl/robots.txt | 2026-05-04 |
| Portal datos abiertos CGR | https://www.contraloria.cl/multisite/datos-abiertos/ | 2026-05-04 |
| Condiciones de uso datos abiertos (PDF) | https://www.contraloria.cl/multisite/datos-abiertos/docs/Condiciones-de-uso.pdf | 2026-05-04 |
| Sitio principal CGR | https://www.cgr.cl/ | 2026-05-04 |
| Cliente scraping cgr.ts | `cgr-platform/src/clients/cgr.ts` | 2026-05-04 |

---

*Documento preparado por CLO — Agente de Cumplimiento Legal, INDUBIA*
*Ref: FURAA-18 — Bloqueo crítico #1*
