# SOURCES.md — Origen de Datos y Metodo de Adquisicion

**Repositorio:** cgr (https://github.com/fermaf/cgr)  
**Generado:** 2026-05-04 por CLO — Agente de Cumplimiento Legal  
**Ref:** FURAA-18

---

## 1. DATOS JURISPRUDENCIALES

### 1.1 Fuente Primaria

| Campo | Detalle |
|---|---|
| Organismo emisor | Contraloria General de la Republica de Chile (CGR) |
| Sitio web | https://www.cgr.cl |
| Tipo de contenido | Dictamenes, resoluciones, criterios de fiscalizacion |
| Volumen en base de datos | Aproximadamente 86.000 dictamenes |
| Formato almacenado | Texto completo + metadata estructurada en D1 |
| Cobertura temporal | Snapshot estatico (sin actualizacion incremental activa) |

### 1.2 Metodo de Adquisicion

| Aspecto | Descripcion |
|---|---|
| Tecnica | Scraping web automatizado via `worker_cron_crawl` (Cloudflare Workers) |
| Pipeline de extraccion | HTTP requests + parsing HTML + normalizacion a JSON |
| Dataset historico | Importacion previa desde MongoDB |
| Frecuencia de actualizacion | Ninguna — snapshot congelado |
| Responsable del pipeline | fermaf (propietario del repositorio) |

### 1.3 Verificacion de Legitimidad

| Verificacion | Estado |
|---|---|
| Terminos de Servicio de CGR.cl | ❌ **NO VERIFICADO** |
| Politica de privacidad de CGR.cl | ❌ **NO VERIFICADO** |
| Licitud bajo Ley 20.285 (transparencia) | ⚠️ Parcial — dictgenes son documentos publicos, pero el metodo de extraccion automatizada requiere verificacion |
| Compatibilidad con Ley 19.628 (datos personales) | ⚠️ Parcial — no se ha analizado presencia de RUT, nombres u otros datos personales en el corpus |

---

## 2. DATOS NORMATIVOS (LEGISLACION CHILENA)

| Fuente | Tipo | Disponibilidad |
|---|---|---|
| BCN (Biblioteca del Congreso Nacional) | Textos legales oficiales | https://www.bcn.cl — abierta |
| Diario Oficial | Publicacion de normas | https://www.diariooficial.interior.gob.cl — abierta |
| Biblioteca Digital CNR | Jurisprudencia judicial | https://bcn.cl — abierta |

**Nota:** Los textos de leyes y reglamentaciones publicados en este repositorio fueron obtenidos de fuentes abiertas del Estado chileno. Para cites oficiales, verificar siempre los textos vigentes en BCN.cl.

---

## 3. METADATA DOCTRINAL GENERADA POR IA

### 3.1 Resumenes y Descriptores

| Aspecto | Detalle |
|---|---|
| Provider historico | Mistral AI (servicio terceros) |
| Provider en evaluacion | Cloudflare Workers AI |
| Proceso | Generacion automatica de resumenes, descriptores tematicos y regimenes aplicables por modelo LLM |
| Curacion humana | **NO VALIDADA** — la metadata no ha sido objeto de revision por un operador juridico humano |
| Confiabilidad | Baja hasta que se valide — no usar como unica fuente para asesoria legal |

### 3.2 Embeddings Vectoriales

| Aspecto | Detalle |
|---|---|
| Provider historico | Pinecone (servicio comercial) |
| Provider en evaluacion | Cloudflare Vectorize |
| Uso | Busqueda semantica de dictamenes |
| Contenido vectorizado | Texto completo de dictamenes + metadata generada |

---

## 4. CODIGO Y COMPONENTES TECNICOS

| Componente | Tipo | Fuente |
|---|---|---|
| Cloudflare Workers | Runtime serverless | Propietario — este repositorio |
| Cloudflare D1 | Base de datos serverless | Propietario — este repositorio |
| Cloudflare Vectorize | Base de vectores | Propietario — este repositorio |
| Cloudflare Workers AI | Inference IA | Proveedor Cloudflare |
| Hono | Framework Node.js | Open-source (Apache 2.0) |
| React + Vite | Frontend | Open-source (MIT) |

---

## 5. FLUJO DE DATOS (DATA FLOW)

```
CGR.cl (sitio oficial)
    ↓ scraping automatizado (worker_cron_crawl)
Cloudflare Workers
    ↓ almacenamiento
Cloudflare D1 (dictamenes + metadata)
    ↓ indexacion
Cloudflare Vectorize (embeddings)
    ↓ generacion
Mistral AI / Workers AI (resumenes, descriptores)
    ↓ consulta
Usuario final (interfaz de busqueda jurisprudencial)
```

---

## 6. MATRIZ DE CONFIANZA POR TIPO DE DATO

| Tipo de dato | Nivel de confianza | Requiere verificacion humana |
|---|---|---|
| Texto completo de dictamenes CGR | Medio | Si — el texto puede contener errores de scraping |
| Metadata doctrinal (resumenes, regimenes) | Bajo | SI — nunca usar como fuente unica |
| Clasificacion automatica | Bajo | SI — nunca usar como fuente unica |
| Embeddings vectoriales | Medio-bajo | Solo como pomoc vectorial, no como cite |
| Codigo fuente ( Workers, frontend) | Alto | Code review basico |

---

## 7. ACCIONES PENDIENTES

- [ ] Verificar Terminos de Servicio de CGR.cl
- [ ] Evaluar presencia de datos personales (RUT, nombres) en el corpus
- [ ] Implementar pipeline de curacion humana para metadata LLM
- [ ] Documentar acuerdo de uso con Cloudflare Workers AI
- [ ] Evaluar migracion completa a Cloudflare Workers AI

---

*Generado automaticamente como parte del proceso de regularizacion legal del repositorio cgr (FURAA-18)*
