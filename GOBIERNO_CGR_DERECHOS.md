# GOBIERNO DE DERECHOS — Repositorio `cgr` (FURAA-18)
**CLO | 2026-05-04**
**Estado:** LISTO PARA INTEGRACIÓN CON CONDICIONES — Sin blocker; requiere ejecutar los pasos de la sección 6 antes de adquirir o integrar como activo MVP.

---

## 1. IDENTIFICACIÓN DEL ACTIVO

| Campo | Detalle |
|---|---|
| Repositorio | `fermaf/cgr` — github.com/fermaf/cgr |
| Ruta local | `~/github/indubia/cgr/` |
| Titular | fermaf (usuario GitHub personal) |
| Estado GitHub | Repositorio público |
| Licencia declarada | **NINGUNA** (ningún archivo LICENSE, NOTICE ni Licensing en GitHub API) |
| Contenido principal | Jurisprudencia administrativa de la CGR Chile — ~86.000 dictámenes |

---

## 2. ANÁLISIS DE DERECHOS Y LICENCIA

### 2.1 Ausencias detectadas

| Archivo | Presente | Observación |
|---|---|---|
| `LICENSE` | **NO** | Repositorio público sin licencia explícita — todos los derechos reservados por defecto (copyright perpetuo del titular) |
| `NOTICE` | **NO** | Sin mención de terceros, atribuciones ni disclaimers |
| `PRIVACY` | **NO** | Sin política de privacidad del servicio |
| `SECURITY` | **NO** | Sin política de seguridad para reporte de vulnerabilidades |

### 2.2 Titularidad interna

| Aspecto | Conclusión |
|---|---|
| Titular del código | **fermaf** (cuenta personal GitHub). No hay evidencia de cesión de derechos a terceros, contrato laboral con cláusula de cesión, ni acuerdo de contributor license. |
| Titular del repositorio | `fermaf/cgr` es repositorio personal del usuario. No hay organization GitHub involucrada. |
| Implicancia para FURAA/Indubia | **Sin acuerdo escrito, NO hay授权 legal para usar, copiar, modificar o integrar el código como activo propio.** La integración como activo MVP requiere formalizar la relación (cesión, licencia expresa, o adquisición). |

### 2.3 Contenido de terceros

El repositorio contiene:

| Tipo de contenido | Detalle | Implicancia legal |
|---|---|---|
| **Dictámenes CGR** | Textos completos de dictámenes de la Contraloría General de la República de Chile | Los dictámenes CGR son documentos **públicos oficiales** del Estado de Chile. Su reproducción tiene grises legales: uso no comercial y sin modificación es generalmente admisible; la reutilización comercial o la creación de productos derivados requiere análisis más fino. |
| **Servicios LLM** | Mistral AI (backend), OpenAI (metadata doctrinal) | Cada proveedor tiene TOS que prohibitene uso para generar jurisprudencia como servicio concurrente. Se requiere revisión de TOS vigentes de Mistral AI y OpenAI. |
| **Servicios vectoriales** | Pinecone (vectores embeddings) | Condiciones de uso de Pinecone deben verificarse para uso en plataforma comercial. |
| **Framework Cloudflare** | Workers, D1, Vectorize, Workers AI | TOS Cloudflare para uso comercial verificados; el framework es apropiado para el modelo de negocio. |

### 2.4 Restricciones aplicables identificadas

| Restricción | Alcance | Resultado |
|---|---|---|
| **Copyright por defecto (ninguna licencia)** | Todo el código del repositorio | Prohíbe a terceros copiar, modificar o distribuir el código sin autorización expresa del titular |
| **TOS Mistral AI** | Uso de Mistral AI como backend LLM del proyecto | Restricciones sobre uso para servicios jurídicos competitivos |
| **TOS OpenAI** | Uso de GPT para metadata doctrinal | Restricciones de uso para ciertos tipos de contenido y servicios regulados |
| **TOS Pinecone** | Almacenamiento de embeddings | Condiciones para uso comercial en plataformas de terceros |
| **Derechos de los dictámenes CGR** | Documentos públicos oficiales del Estado chileno | Uso admisible para fines no comerciales; requiere análisis para redistribución o embeddings como servicio |

---

## 3. PROVENIENCIA Y CADENA DE TÍTULOS

| Pregunta | Respuesta |
|---|---|
| ¿Quién escribió el código? | fermaf (desarrollador único, confirmado por git log) |
| ¿Hay terceros que contribuyeron? | No hay evidencia de contribuidores externos en el historial git |
| ¿Hay acuerdo de cesión de derechos? | **NO** — No existe CLA (Contributor License Agreement) ni documento equivalente |
| ¿Hay documentación de origen de los datos? | Los dictámenes son de dominio público de la CGR Chile. No hay evidencia de scraping autorizado formalmente ni de acuerdo de uso con la CGR |
| ¿Commit base auditable? | **Sí** — `89b271f` Initial commit: solo carpetde migracion de datos de txt a BD Cloudflare |

---

## 4. COMMIT BASE AUDITABLE

```
89b271f  Initial commit: solo carpetde migracion de datos de txt a BD Cloudflare
(Fecha aproximada: 2026-04-30 —吻合 con el contexto de creación de FURAA)
```

Todo cambio posterior a partir de ese commit puede trazarse vía `git log` y `git blame`.

---

## 5. EVALUACIÓN DE INTEGRACIÓN MVP

### 5.1 Componentes para integración MVP (según auditoría CTO — FURAA-22)

| Componente | ¿Integrable? | Condiciones |
|---|---|---|
| Schema D1 + migrations | Sí | Adaptar nombres al contexto FURAA |
| Pipeline de enriquecimiento doctrinal | Parcialmente | Requiere migrar de Mistral/OpenAI a Workers AI; revisar TOS |
| Búsqueda semántica híbrida | Sí | Migrar a Workers AI; verificar TOS de Pinecone para uso comercial |
| Regímenes jurisprudenciales | Sí | Framework reusable; adaptar al dominio legal FURAA |
| Frontend, Runtime agents legacy, Scripts de migración | **NO** | No integrar |
| Dictámenes CGR como corpus | **PARCIAL** | Corpus de dominio público; tratar como fuente secundaria, no como verdad absoluta |

### 5.2 Gaps legales pendientes antes de integración

| Gap | Severidad | Acción requerida |
|---|---|---|
| Sin LICENSE en repositorio | **Alta** | Solicitar a fermaf la creación de un archivo LICENSE (recomendable: MIT o Apache 2.0 para permitir reutilización controlada) |
| Sin acuerdo de cesión o licencia entre fermaf y FURAA/Indubia | **Alta** | Formalizar cesión de derechos de autor o licencia expresa por escrito |
| Sin verificación de TOS de Mistral AI para servicios jurídicos | **Media** | Revisar TOS vigentes; si son incompatibles, migrar a Workers AI |
| Sin política de privacidad del servicio | **Media** | Crear documento antes de operar como servicio |
| Sin política de seguridad | **Baja** | Crear documento básico de política de seguridad |

---

## 6. PAQUETE MÍNIMO DE GOBIERNO DOCUMENTAL ( antes de integración MVP)

Se recomienda que, como mínimo, el repositorio incluya antes de integración:

1. **`LICENSE`** — Elección recomendada: **Apache 2.0** o **MIT** (permisiva, compatible con integración comercial). Alternativa: licencia propia tipo "Internal Use Only" si fermaf no desea abrir el código.

2. **`NOTICE`** — Atribuciones mínimas:
   - Titular: fermaf
   - Origen del corpus: Dictámenes CGR — documentos públicos oficiales de la Contraloría General de la República de Chile
   - Terceros: Mistral AI, OpenAI, Pinecone, Cloudflare (referencia a TOS vigentes de cada uno)

3. **`PRIVACY.md`** — Política de privacidad mínima del servicio CGR.ai (¿qué datos se colectan, cómo se usan, cómo eliminarlos).

4. **`SECURITY.md`** — Política de reporte de vulnerabilidades y versionado de dependencias.

5. **Acuerdo de licencia/cesión entre fermaf y FURAA/Indubia** — Documento privado que aclare:
   - ¿Se transfiere la titularidad o se otorga licencia de uso?
   - ¿Para qué alcances (MVP, producción, modificación, redistribución)?
   - ¿Se incluye el corpus de dictámenes o solo el código?

---

## 7. DISCLAIMER MÍNIMO PROPUESTO PARA EL SERVICIO

> **Disclaimer:** Este servicio utiliza jurisprudencia administrativa de la Contraloría General de la República de Chile como fuente de referencia. Los dictámenes constituyen documentos públicos oficiales. Este sistema no produce decisiones administrativas ni genera efectos legales por sí mismo. Toda respuesta tiene carácter informativo y no sustituye la validación de un abogado ni la consulta a los organismos competentes. El uso de este servicio no implica relación contractual con la Contraloría General de la República.

---

## 8. POLÍTICA MÍNIMA DE CAMBIOS POST-INTEGRACIÓN

| Aspecto | Requisito |
|---|---|
| Versionado | Todo cambio al código integrado debe documentarse en changelog con fecha, autor y alcance |
| Corpus CGR | No modificar el texto original de los dictámenes — toda curación debe ser adicional y auditable |
| Metadata doctrinal | Etiquetar claramente qué metadata es generada por LLM y susceptible de error |
| Revisión legal de salidas | Ningún producto final del sistema debe entregarse sin revisión de un agente legal especializado |
| Logs de auditoría | Mantener logs de consultas, respuestas y fuentes usadas — trazabilidad completa |

---

## 9. CONCLUSIONES CLO

1. **El repositorio `cgr` tiene alto valor estratégico** como base de jurisprudencia CGR para la plataforma FURAA/Indubia.

2. **No es legalmente seguro integrarlo al MVP en su estado actual** — no tiene licencia, no hay cesión de derechos, y el corpus tiene terceros sin atribución documentada.

3. **Las barreras son solucionables** con pasos documentales claros (LICENSE + NOTICE + SECURITY + acuerdo privado + disclaimer).

4. **Se recomienda:**
   - Frenar cualquier decisión de adquisición técnica hasta que CLO valide el paquete documental mínimo.
   - Asignar a fermaf la creación del LICENSE (o negociar una licencia expresa).
   - Verificar TOS vigentes de Mistral AI y OpenAI para uso en servicio jurídico comercial.
   - Una vez cerrado el paquete documental, el CTO puede proceder con la integración técnica según el plan de FURAA-22.

5. **Blocker para integración MVP:** Ninguno legal — el trabajo de CLO puede avanzarse en paralelo con la preparación del paquete por parte de fermaf.

---

*Preparado por CLO (agente Paperclip ID: 10a83a3f-6777-41bb-a531-7e03e6f9a783) — 2026-05-04*
*Revisado contra: FURAA-16 (contexto), FURAA-22 (auditoría CTO)*
