# AUDITORÍA TÉCNICA Y LEGAL — Repositorio cgr (fermaf/cgr)
**FURAA-22 | CTO | Fecha: 2026-05-04**
**Auditado por:** CTO (agentePaperclip ID: 69466482-7130-4260-bcbe-d36e21afecbf)

---

## 1. IDENTIFICACIÓN DEL ACTIVO

| Dimensión | Detalle |
|---|---|
| Repositorio | `fermaf/cgr` — github.com/fermaf/cgr |
| Ruta local | `~/github/indubia/cgr/` |
| Propósito declarado | Plataforma serverless de gobernanza documental inteligente para jurisprudencia administrativa de la CGR Chile |
| Stack principal | Cloudflare Workers (Hono) + D1 + Vectorize + Workers AI + React/Vite (Pages) |
| Modelos LLM | Mistral AI (back-end), OpenAI (doctrinal metadata) |
| Almacenamiento | Cloudflare D1 (SQLite), KV (Cache/Raw), Vectorize (embeddings) |
| Estado general | Prototipo maduro con deuda técnica significativa y gaps de calidad |

---

## 2. VALOR LEGAL Y TÉCNICO ACTUAL

### 2.1 Valor Legal

| Dimensión | Puntuación (1-5) | Observación |
|---|---|---|
| Completitud del corpus CGR | 3 | ~86.000 dictámenes registrados; no se verifica cobertura real vs. total CGR |
| Enriquecimiento doctrinal | 4 | Metadata canónica calculada por pipeline LLM (materia, tema, rol, scores) |
| Clasificación temática | 3 | Descriptores y categorías LLM presentes; calidad variable según muestra |
| Relaciones entre dictámenes | 4 | Relation assertion model sofisticado; evidencia con confidence scores |
| Regímenes jurisprudenciales | 4 | Construcción de regímenes desdemetadata canónica (migrations 0009) |
| Metadata histórica | 4 | Scores de historic significance, currentness, shift intensity |
| Trazabilidad de cambios | 3 | Historial de cambios en tabla dedicada; auditoría de discrepancias documentada |

**Observaciones legales:**
- El activo constituye un repositorio de jurisprudencia administrativa de la CGR de alto valor potencial para una División Legal ministerial.
- La cobertura ~86K dictámenes es sustancial, pero no se puede asumir que sea exhaustiva ni que la metadata sea confiable para todos los registros sin validación.
- No se encontró en la auditoría actual ningún proceso de curación humana activa sobre la metadata LLM.

### 2.2 Valor Técnico

| Dimensión | Puntuación (1-5) | Observación |
|---|---|---|
| Arquitectura serverless | 5 | Cloudflare edge nativo; diseño escalable y costos predecibles |
| Diseño de base de datos | 4 | Schema D1 maduro; migrations versionadas; índices apropiados |
| Pipeline de ingestay enriquecimiento | 3 | Workflows Document, Enriquecimiento y Vectorización separados; automatización parcial |
| Búsqueda semántica | 4 | Vectorize + Workers AI + búsqueda híbrida (semántica + literal) |
| Runtime de agentes | 2 | Runtime TypeScript propio en `agents/`; obsoleto vs. OpenCode moderno |
| Documentación | 4 | `docs/`, `context/`, AGENTS.md, README.md exhaustivos |
| CI/CD y deploy | 4 | Wrangler nativo; scripts de migración disponibles |
| Calidad de código | 3 | monolith `index.ts` de 105KB — riesgo de mantenibilidad |

**Observaciones técnicas:**
- El `index.ts` de 105KB es un monolith que dificulta el mantenimiento y las pruebas.
- El runtime de agentes propio en `agents/` está desactualizado respecto al estándar OpenCode usado en el proyecto.
- Se encontraron archivos de debugging temporales en producción (`test_embed.ts`, `verify_pinecone.ts`, `test_kv_presence.ts`).

---

## 3. REUTILIZABILIDAD PARA LA PLATAFORMA FURAA/INDUBIA

### 3.1 Reutilización directa

| Componente | ¿Reutilizable? | Forma de integración |
|---|---|---|
| Schema D1 de jurisprudencia CGR | Sí, con adaptación | Replicar migrations en el D1 de FURAA; adaptar nombres de tablas |
| Pipeline de enriquecimiento doctrinal | Parcialmente | Los concepts de metadata canónica (materia, tema, rol) son reutilizables; requiere revisión del modelo LLM (Mistral → Workers AI) |
| Búsqueda híbrida semántica + literal | Sí | Exponer como skill/tool de Vectorize; migrar a Workers AI del modelo actual |
| Relation assertion model | Sí | Concepto de relaciones entre dictámenes reutilizable; necesita adaptación al dominio legal de FURAA |
| Regímenes jurisprudenciales | Sí | El framework de construcción de regímenes (`regimenBuilder.ts`, `regimenDiscovery.ts`) es generalizable |
| Runtime de agentes legacy (`agents/`) | No | Obsoleto; FURAA usa OpenCode y Paperclip. No integrar. |

### 3.2 Reutilización indirecta (patrones)

| Patrón | Valor para FURAA |
|---|---|
| Arquitectura Cloudflare edge-first | Modelo de costos y diseño para servicio legal en borde |
| Pipeline de metadata canónica por LLM | Patrón para generar metadata legal estructurada sobre fuentes primarias |
| Separación Crawl → Enrich → Vectorize | workflow reusable para cualquier corpus documental legal |
| Doctrine-guided retrieval | Patrón para recuperación basada en líneas doctrinales — relevante para asistencia legal |

---

## 4. MÓDULOS CANDIDATOS A INTEGRACIÓN MVP

### 4.1 Alta prioridad de integración

| Módulo | Ubicación | Razón de prioridad | Complexity |
|---|---|---|---|
| **Skill de búsqueda semántica** | `cgr-platform/src/lib/doctrineGuided.ts` | Funcionalidad central de consulta jurisprudencial; reusable con nuevo corpus | Media |
| **Schema D1 + migrations** | `cgr-platform/migrations/` | Base de datos estructurada y versionada; adaptable a corpus legal FURAA | Baja |
| **Lib de regímenes jurisprudenciales** | `cgr-platform/src/lib/regimenBuilder.ts`, `regimenDiscovery.ts` | Frameworks de construcción de conocimiento doctrinal; generalizable | Alta |
| **Lib de metadata canónica** | `cgr-platform/src/lib/doctrinalMetadata.ts` | Pipeline de enrichment LLM; adaptable a otros tipos de documentos legales | Media |
| **Lib de tokenizer** | `cgr-platform/src/lib/tokenizer.ts` | Útil para cualquier procesamiento de texto legal en Workers AI | Baja |

### 4.2 Prioridad media

| Módulo | Ubicación | Razón | Complexity |
|---|---|---|---|
| Workflow de enriquecimiento | `cgr-platform/src/workflows/` | Diseños de workflow durable replicables | Media |
| Lib de relaciones canónicas | `cgr-platform/src/lib/relationsCanonical.ts` | Modelo de relaciones entre entidades legaless — extensible | Alta |
| Skills de validación D1 | `cgr-platform/src/skills/d1_remote_schema_verify.ts`, `check_d1_schema.ts` | Útiles para validación de integridad del corpus | Baja |

### 4.3 No integrar en MVP (técnico o alcance)

| Módulo | Razón de exclusión |
|---|---|
| `frontend/` completo | Requiere reconstrucción total para contexto FURAA; no es transferible directamente |
| Runtime `agents/` | Obsoleto; FURAA usa OpenCode y Paperclip |
| Scripts de migración `migracion/` | Scripts específicos para datos MongoDB originales |
| `cgr-platform/index.ts` monolith | Refactorizar antes de reutilizar — demasiado acoplado |

---

## 5. RIESGOS TÉCNICOS, LEGALES Y DE CALIDAD

### 5.1 Riesgos Técnicos

| ID | Riesgo | Severidad | Mitigación propuesta |
|---|---|---|---|
| RT-01 | Discrepancia D1 vs. KV: 981 dictámenes en D1 sin contenido KV y 976 en KV sin对应 D1 | **Alta** | Antes de usar como fuente, ejecutar proceso de reconciliación o marcar registros como huérfanos |
| RT-02 | `index.ts` de 105KB: monolith que dificulta debugging y testing | **Alta** | Refactorizar en módulos funcionales antes de integrar; no modificar el monolith directamente |
| RT-03 | Dependencia de Mistral AI externa (no Cloudflare) | **Alta** | Migrar a Workers AI para mantener todo en el borde de Cloudflare |
| RT-04 | Embeddings en Pinecone (vector DB externa) vs. Vectorize nativo | **Media** | Evaluar migración a Vectorize para consolidar en Cloudflare; costo y calidad a verificar |
| RT-05 | Archivos de debugging en producción (`test_*.ts`, `verify_*.ts`) | **Baja** | Limpiar antes de cualquier integración |
| RT-06 | No hay tests automatizados visibles para el pipeline core | **Media** | Implementar tests unitarios e integración antes de integrar al MVP |

### 5.2 Riesgos Legales y de Calidad del Dato

| ID | Riesgo | Severidad | Mitigación propuesta |
|---|---|---|---|
| RL-01 | Calidad variable de metadata LLM: no hay curación humana activa sobre clasificaciones | **Alta** | Implementar proceso de spot-check sobre metadata; no usar como source-of-truth sin validación |
| RL-02 | Origen de los dictámenes: `origen_importacion = 'mongoDb'` — trazabilidad de la fuente original parcial | **Media** | Documentar proceso de importación; verificar que no hay pérdida de información en migración |
| RL-03 | Embebidos jurisprudenciales: no se puede verificar la calidad de los embeddings sin acceso a Pinecone/Vectorize | **Alta** | Realizar evaluación de relevancia con queries de prueba antes de confiar en búsqueda semántica |
| RL-04 | Posibles duplicados o inconsistencias de numeración de dictámenes | **Media** | Ejecutar query de duplicados en D1 antes de usar como base |
| RL-05 | Vacíos de cobertura: no hay certeza de qué porcentaje del total de dictámenes CGR está incluido | **Alta** | Cruzar con estadísticas oficiales de la CGR sobre volumen total de dictámenes |

### 5.3 Riesgos de Integración con FURAA

| ID | Riesgo | Severidad | Mitigación propuesta |
|---|---|---|---|
| RI-01 | Conflicto de nombres de tablas si se usa el mismo D1 para ambos sistemas | **Media** | Prefijo de tablas o D1 separado para FURAA |
| RI-02 | Modelo de datos centrado en jurisprudencia CGR — no extensible directamente a otros dominios legales | **Media** | Diseñar capa de abstracción que permita cruzar jurisprudencia CGR con corpus FURAA |
| RI-03 | Skills Paperclip/OpenCode no son compatibles con el runtime de agentes propio de cgr | **Alta** | No intentar integrar el runtime; extraer solo las libs y concepts |

---

## 6. CONFIABILIDAD DE FUENTES, METADATA Y EMBEDDINGS

### 6.1 Fuentes

| Aspecto | Estado | Observación |
|---|---|---|
| Origen documental | Parcialmente trazable | Indicates `mongoDb` origin; no se documentó proceso de extracción |
| Oficialidad | Verificable | Jurisprudencia CGR es fuente oficial; los textos base deben provenir de BCN.cl o fuente CGR |
| Completitud | No verificable sin estadísticas oficiales | ~86K dictámenes; la CGR ha emitido más de 200K dictámenes históricamente |
| свежесть (actualización) | No se observó pipeline de actualización incremental | Todo parece ser snapshot estático |

### 6.2 Metadata

| Aspecto | Calidad observada |
|---|---|
| Título y resumen | Generados por LLM (Mistral); no verificados manualmente |
| Descriptores | Catálogo controlado en `cat_descriptores` + etiquetas libres LLM |
| Atributos jurídicos | Booleanos (es_nuevo, es_relevante, etc.) — generados por reglas o LLM |
| Metadata doctrinal canónica | Pipeline sofisticado con scores; calidad no validada抽样mente |
| Confianza global | Campo `confidence_global` disponible; rango esperado 0-1 |

### 6.3 Embeddings

| Aspecto | Estado |
|---|---|
| Provider actual | Pinecone (externo) — no Vectorize nativo |
| Dimensiones | No verificado en esta auditoría |
| Modelo de embedding | No especificado claramente en el código disponible |
| Relevancia en queries de prueba | No se pudo verificar sin acceso al índice Pinecone |

---

## 7. GAPS CRÍTICOS RESPECTO A NECESIDADES DE UNA DIVISIÓN LEGAL MINISTERIAL

### 7.1 Gap de cobertura funcional

| Necesidad FURAA | Cobertura en cgr | Gap |
|---|---|---|
| Consulta de jurisprudencia CGR | Parcial (solo Dictámenes) | No cubre leyes, reglamentos, tratados ni doctrina legal general |
| Búsqueda normativa | No presente | No hay índice de legislación chilena |
| Assistencia en procedimiento de cumplimiento de sentencias | No hay workflow | Sistema es solo de recuperación, no de asistencia procedimental |
| Cross-review de documentos legales | No hay agente de revisión | No hay pipeline de revisión de actos administrativos |
| Taxonomía regulatoria navegable | No hay | Falta estructura de navegación por orgánica del Estado |
| Plantillas de documentos legales | No hay | No hay generación de borradores de respuestas, oficios, resoluciones |

### 7.2 Gap de calidad y gobernanza

| Aspecto | Gap |
|---|---|
| Auditoría de calidad de metadata | No existe proceso de validación humana periódica |
| Versionado de criterios CGR | No hay tracking de cambios de criterio de la CGR en el tiempo |
| Alertas de nuevos dictámenes | No hay sistema de notificaciones |
| Trazabilidad de fuente original | La importación desde MongoDb no está documentada completamente |

---

## 8. PLAN DE MEJORAS PRIORIZADO

### Inmediato (0-2 semanas)

1. **Reconciliar D1 vs. KV** (RT-01): proceso de limpieza de registros huérfanos
2. **Limpiar archivos de debug** (RT-05): eliminar `test_*.ts`, `verify_*.ts` del código productivo
3. **Documentar schema y migrations**: generar diagrama ER y documentación del schema para equipo FURAA

### Corto plazo (2-6 semanas)

4. **Refactorizar `index.ts`** (RT-02): extraer módulos funcionales (routing, storage, skills)
5. **Migrar Mistral AI → Workers AI** (RT-03): consolidar todos los LLM en Cloudflare
6. **Migrar Pinecone → Vectorize** (RT-04): evaluar costo/calidad; consolidar en ecosistema Cloudflare
7. **Implementar tests** (RT-06): cobertura mínima para pipeline de enriquecimiento

### Medio plazo (1-3 meses)

8. **Validar calidad de metadata**: proceso de spot-check con legal experts sobre clasificaciones LLM
9. **Cruzar con estadísticas CGR**: verificar cobertura real vs. total de dictámenes emitidos
10. **Añadir pipeline de actualizaciones incrementales**: no puede ser snapshot estático para uso productivo

---

## 9. MÓDULOS CANDIDATOS A INTEGRACIÓN — LISTA FINAL

| # | Módulo | Archivo(s) | Prioridad | Tipo de integración |
|---|---|---|---|---|
| 1 | Búsqueda semántica híbrida | `src/lib/doctrineGuided.ts`, `src/lib/relations.ts` | Alta | Tool/skill de retrieval jurisprudencial |
| 2 | Schema y migrations D1 | `migrations/*.sql`, `schema_prod.sql` | Alta | Base de datos base adaptable |
| 3 | Framework de regímenes jurisprudenciales | `src/lib/regimenBuilder.ts`, `regimenDiscovery.ts`, `derivedCatalogs.ts` | Alta | Concepto reutilizable para taxonomía legal |
| 4 | Pipeline de metadata canónica | `src/lib/doctrinalMetadata.ts`, `src/lib/doctrineLines.ts` | Alta | Librería de enrichment |
| 5 | Lib de tokenizer | `src/lib/tokenizer.ts` | Media | Utility reusable |
| 6 | Skills de validación D1 | `src/skills/d1_remote_schema_verify.ts`, `check_d1_schema.ts` | Media | Herramientas de operación |
| 7 | Workflows duraderos | `src/workflows/` | Media | Patrón de workflow replicable |
| 8 | Modelos de relaciones canónicas | `src/lib/relationsCanonical.ts` | Baja-Alta | Concepto extensible; complejidad alta |

---

## 10. CONCLUSIÓN

El repositorio `cgr` de fermaf constituye un **activo estratégico de alto valor** para la plataforma FURAA, tanto por su corpus de jurisprudencia CGR (~86K dictámenes con metadata enriquecida) como por sus patrones técnicos de arquitectura serverless edge-first sobre Cloudflare.

Sin embargo, el activo **no está listo para uso productivo sin calificación**. Los riesgos principales son:

1. **Calidad no validada de metadata LLM** — no puede usarse como fuente de verdad sin un proceso de curación.
2. **Discrepancias D1 vs. KV** — 981+981 registros con inconsistencia que deben reconciliarse.
3. **Debt técnica significativa** — monolith, runtime de agentes obsoleto, y scripts de debug en producción.
4. **Cobertura incompleta del universo CGR** — no hay certeza de representatividad.

**Recomendación del CTO:** Integrar los **módulos técnicos reutilizables** (búsqueda semántica, schema, framework de regímenes) como base del servicio de jurisprudencia de FURAA, pero invertir en paralelo en la **validación de calidad del corpus** y en un **pipeline de actualizaciones incrementales**. El frontend completo NO es reutilizable y debe construirse desde cero para el contexto de FURAA.

---

*Informe elaborado por CTO — Agente Paperclip FURAA | 2026-05-04*
*Repositorio auditado: `~/github/indubia/cgr/` (commit actual del filesystem)*
