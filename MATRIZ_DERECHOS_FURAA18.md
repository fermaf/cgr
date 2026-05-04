# MATRIZ DE DERECHOS, LICENCIA Y PROVENIENCIA — Repositorio cgr
**FURAA-18 | CLO | Fecha: 2026-05-04**
**Estado: CONGELADO — No integrar al MVP hasta cerrar validacion**

---

## 1. HALLAZGO: ARCHIVOS LEGALES AUSENTES

| Archivo | Presente | Nunca existio en git |
|---|---|---|
| `LICENSE` | No | Confirmado — busqueda en historial git vacia |
| `NOTICE` | No | Confirmado |
| `PRIVACY` | No | Confirmado |
| `SECURITY` | No | Confirmado |

**Implicancia**: El repositorio no declara explicitamente terminos de uso, lo que impide determinar si la plataforma puede usarse, modificarse o redistribuirse legitimamente. Esta ausencia es un bloqueo legal para la integracion al MVP.

---

## 2. PROPIEDAD DEL CODIGO

| Aspecto | Detalle |
|---|---|
| Titular del repositorio | `fermaf` (cuenta GitHub personal) |
| URL remota | https://github.com/fermaf/cgr |
| Commits | 100% atribuibles a `fermaf` (commits via OpenCode/agentes) |
| Empresa constituida | No se evidencia — cuenta personal de desarrollador |
| Derechos de uso interno | Legitimo para el desarrollador (uso propio del codigo) |
| Derechos de integracion a plataforma comercial | **Indeterminado** — requiere autorizacion expresa del titular |

**Implicancia**: Integrar este codigo en una plataforma comercial de INDUBIA requiere verificar si el desarrollador tiene derechos plenos sobre cada componente o si hay cesiones a terceros (empleador, kontrata).

---

## 3. PROVENIENCIA DE LOS DATOS JURISPRUDENCIALES

### 3.1 Origen declarado

| Campo | Valor |
|---|---|
| Fuente primaria | CGR.cl — sitio oficial de la Contraloria General de la Republica de Chile |
| Metodo de adquisicion | Scraping/web crawling (pipeline `worker_cron_crawl`) |
| Origen historico | `mongoDb` (importacion masiva previa) |
| Volumen | ~86.000 dictamenes registrados en D1 |
| Cobertura | Snapshot estatico — no hay pipeline de actualizacion incremental |

### 3.2 Marco legal aplicable a la fuente

| Normativa | Relevancia |
|---|---|
| Ley 20.285 sobre Acceso a la Informacion Publica | Los dictamenes de la CGR son documentos publicos — su acceso esta amparado por esta ley |
| Ley 19.628 sobre Proteccion de la Vida Privada | Debe verificarse si los dictamenes contienen datos personales de terceros (rut, nombres,民事casos) que deban protegerse |
| Terminos de servicio de CGR.cl | **No se verificaron** — el scraping podria violar condiciones de uso del sitio oficial |
| Politica de datos del sitio CGR | **No se verificaron** |

**⚠️ RIESGO CRITICO (RL-06)**: No se ha verificado si el scraping de CGR.cl infringe los Terminos de Servicio del sitio. Esto podria constituir una violacion contractual o de la Ley 19.628 si se extrajeron datos personales sin consentimiento.

### 3.3 Embeddings y metadata generada por IA

| Componente | Provider | Condiciones |
|---|---|---|
| Metadata canonica (resumenes, descriptores, regimenes) | Mistral AI (historico) / Workers AI (en evaluacion) | Condiciones de servicio de Mistral AI — uso comercial permitted |
| Embeddings vectoriales | Pinecone (historico) / Vectorize (en evaluacion) | Pinecone: planes comerciales disponibles; Vectorize: parte de Cloudflare |
| Clasificacion LLM de jurisprudencia | Modelo no especificado en documentacion | Falta transparencia sobre el modelo usado |

**⚠️ RIESGO (RL-03)**: La calidad de la metadata LLM no ha sido validada por curacion humana. Usar esta metadata como source-of-truth para asesoria legal sin validacion constituye un riesgo de calidad y potencialmente legal.

---

## 4. RESTRICCIONES APLICABLES

### 4.1 Scraping, indexacion y embeddings

| Restriccion | Estado |
|---|---|
| Prohibicion de scraping de CGR.cl | **No verificado** — requiere revision de ToS |
| Permisividad de indexacion para embeddings | **Indeterminado** — depende de ToS de CGR.cl |
| Uso de robots de busqueda | No aplica (uso interno/no publico en principio) |
| Redifusion de dictamenes | Los dictamenes son documentos publicos chilenos — su reproduccion en plataforma de consulta podria ser legitima bajo Ley 20.285, pero requiere analisis juridico especifico |

### 4.2 Datos personales en el corpus

| Aspecto | Hallazgo |
|---|---|
| Posible contenido de RUT, nombres, datos judiciales | Los dictamenes administrativos pueden contener datos de particulares involucrados en procedimientos |
| Evaluacion de anonimizacion | **No se evidencia proceso de anonimizacion** en el pipeline actual |
| Compatibilidad con Ley 19.628 | **Indeterminado** — requiere evaluacion de un abogado |

**⚠️ RIESGO ALTO (RL-07)**: Si el corpus contiene datos personales no anonimizados y se usa como base para RAG o embeddings en una plataforma comercial, podria infringirse la Ley 19.628.

### 4.3 Uso comercial del corpus

| Escenario | Analisis preliminar |
|---|---|
| Plataforma de consulta para Division Legal (uso interno gubernamental) | Probablemente legitimo si se enmarca como acceso a jurisprudencia publica |
| Plataforma comercial de asesoria legal | Requiere claridad sobre derechos de uso del corpus y metadata |
| Uso como training data para fine-tuning de modelos | **Problematico** — requiere autorizacion de titulares de los datos |

---

## 5. ANALISIS DE COMPONENTES DE TERCEROS

### 5.1 Codigo (deps npm + runtime)

| Componente | Licencia tipica | Estado |
|---|---|---|
| Cloudflare Workers/Hono/D1/Vectorize | Cloudflare SLA comercial | ✅ Uso legitimo |
| React + Vite | MIT | ✅ Uso legitimo |
| Biblioteca de scraping (si existe) | Verificar individualmente | ⚠️ Requiere auditoria |
| Mistral AI | Mistral AI Terms of Service | ✅ Compatible con uso comercial |
| Pinecone | Pinecone Terms of Service | ✅ Uso comercial disponible |

### 5.2 Datos jurisprudenciales

| Componente | Titular | Implicancia |
|---|---|---|
| Texto de dictamenes CGR | Contraloria General de la Republica (organismo publico chileno) | Documentos publicos — acceso legitimo bajo Ley 20.285, pero uso comercial requiere verificacion |
| Metadata canonica generada por IA | Fermaf (como operador del sistema) | Fermaf tiene derechos sobre la metadata que su sistema genero |
| Embeddings vectoriales | Fermaf (como operador del sistema) | Mismo analisis que metadata |

---

## 6. COMMIT BASE AUDITABLE

| Dato | Valor |
|---|---|
| Commit base recomendado | `b01bed4` ("feat(backend): migra consumidores secundarios de derivativas a lectura canonica") |
| Fecha aproximada | 2026-04-30 |
| Razon de seleccion | Ultimo commit estable antes de optimizaciones de performance que podrian haber alterado logica de lectura canonica |
| Commit actual (head) | `f977eb2` ("feat(opencode): subir entorno completo agent-first OpenCode") |

---

## 7. POLITICA MINIMA DE CAMBIOS PARA MVP

1. **No modificar la estructura de datos original** de los dictamenes sin dejar trazabilidad en logs.
2. **No redistribuir** el corpus de dictamenes fuera de la plataforma sin autorizacion.
3. **Documentar toda modificacion** de metadata canonica con fecha, motivo y autor.
4. **No usar embeddings** como unica fuente de verdad — siempre cruzar con texto normativo oficial (BCN).
5. **Registrar cada acceso** al corpus con identificacion de usuario/servicio para auditoria.
6. **No exponer endpoints de scraping** publicamente — deben ser internos y protegidos.

---

## 8. SET MINIMO DE DOCUMENTOS DE GOBERNANZA RECOMENDADO

### 8.1 Documentos a crear

| # | Documento | Proposito | Prioridad |
|---|---|---|---|
| 1 | `LICENSE` | Declarar licencia de codigo (recomendado: MIT o Apache 2.0 para codigo propio) | Alta |
| 2 | `NOTICE` | Listar componentes de terceros y sus licencias | Alta |
| 3 | `SOURCES.md` | Documentar origen de cada fuente de datos, metodo de adquisicion y restricciones aplicables | Alta |
| 4 | `DATA_POLICY.md` | Politica de uso de datos jurisprudenciales, proteccion de datos personales, y limites de responsabilidad | Alta |
| 5 | `DISCLAIMER.md` | Disclaimer legal estandar: "Este sistema no constituye asesoria juridica y no reemplaza la validacion de un abogado" | Alta |
| 6 | `SECURITY.md` | Politica de reporte de vulnerabilidades y configuracion de seguridad | Media |

### 8.2 Contenido minimo de NOTICE (propuesta)

```
CGR.ai Platform — Third-Party Components
========================================

Codigo propietario: © fermaf
URL: https://github.com/fermaf/cgr

Third-party software:
- Cloudflare Workers, D1, Vectorize, Workers AI (Cloudflare, Inc.)
- Hono (Array Architects, MIT License)
- React (Meta Platforms, MIT License)
- Vite (Vite Team, MIT License)
- Mistral AI (Mistral AI SAS) — para metadata canonica

Data sources:
- Dictamenes de la Contraloria General de la Republica de Chile (CGR.cl)
  Documentos publicos bajo Ley 20.285; acceso legitimo verificado por CLO.
  Origen: scraping de cgr.cl [URL]; metodo: worker_cron_crawl.
  AVISO: Terminos de servicio de CGR.cl no verificados — ver SOURCES.md.

Advertencia: La metadata canonica y embeddings fueron generados por IA y no han sido validados
por curacion humana. Ver DATA_POLICY.md para limitaciones de uso.
```

---

## 9. CRITERIOS DE ACEPTACION — ESTADO

| Criterio | Estado | Observacion |
|---|---|---|
| Identificar titularidad interna/externa del codigo | ✅ Parcial | Titular = fermaf (cuenta personal). Derechos de integracion comercial indeterminados. |
| Verificar restricciones aplicables a fuentes | ⚠️ Parcial | Scraping de CGR.cl — ToS no verificados. Datos personales — no hay proceso de anonimizacion documentado. |
| Documentar commit base auditable | ✅ Listo | `b01bed4` como base recomendada |
| Proponer set minimo de documentos de gobierno | ✅ Listo | 6 documentos propuestos (seccion 8) |

**Acciones pendientes antes de integracion MVP:**
1. [ ] Verificar ToS de CGR.cl y legitimidad del scraping
2. [ ] Evaluar presencia de datos personales no anonimizados en el corpus
3. [ ] Obtener confirmacion de fermaf sobre derechos plenos del codigo para integracion comercial
4. [ ] Crear documentos: LICENSE, NOTICE, SOURCES.md, DATA_POLICY.md, DISCLAIMER.md, SECURITY.md
5. [ ] Implementar proceso de curacion humana spot-check sobre metadata LLM
6. [ ] Congelar cualquier decision de adquisicion o integracion

---

## 10. RECOMENDACION CLO

**CONGELAR la integracion del repositorio `cgr` al MVP hasta que se cierren los items pendientes de la seccion 9.**

La ausencia de archivos legales no es un defecto menor — es un indicador de que el proyecto no ha sido disenado considerando los requisitos de gobernanza legal de una plataforma comercial de servicios legales al Estado.

El valor estrategico del activo es alto (~86K dictamenes, arquitectura Cloudflare), pero los riesgos legales pendientes (scraping sin ToS verificados, datos personales, ausencia de disclaimer, metadata no curada) superan el beneficio de integracion inmediata.

**Acciones inmediatas (esta semana):**
1. CTO: Solicitar a fermaf confirmacion de derechos plenos sobre el codigo.
2. CLO: Verificar ToS de CGR.cl y evaluar implicancias de proteccion de datos.
3. CTO: Implementar pipeline de anonimizacion antes de cualquier uso del corpus.
4. CTO/CLO: Crear el set minimo de documentos de gobernanza (seccion 8.1).
