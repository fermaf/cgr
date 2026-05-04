# DATA_POLICY.md — Politica de Datos Personales y Limitaciones

**Repositorio:** cgr (https://github.com/fermaf/cgr)  
**Generado:** 2026-05-04 por CLO — Agente de Cumplimiento Legal  
**Ref:** FURAA-18

---

## 1. IDENTIFICACION DEL RESPONSABLE DEL TRATAMIENTO

| Campo | Detalle |
|---|---|
| Responsable actual | fermaf (usuario GitHub individual) |
| Responsable previsto | INDUBIA SpA (en evaluacion) |
| Correo de contacto | Por definir |

---

## 2. NATURALEZA DE LOS DATOS

### 2.1 Datos publicos — Dictamenes de la CGR

Los dictamenes de la Contraloria General de la Republica de Chile constituyen documentos publicos segun la Ley 20.285 sobre Acceso a la Informacion Publica. Su contenido refleja pronunciamientos administrativos oficiales.

**Sin embargo**, los dictamenes pueden contener:

| Tipo de dato | Ejemplo | Sensibilidad |
|---|---|---|
| Nombres de funcionarios publicos | Nombres en resolucion de sumarios | Datos identificativos |
| RUT de funcionarios o terceros | RUT en expediente de fiscalizacion | Datos sensibles bajo Ley 19.628 |
| Datos de casos disciplinarios | Identificacion de involucrados | Datos potencialmente sensibles |
| Informacion financiera publica | Montos y proveedores en contratos | Datos publicos pero no personales directos |
| Datos de procesos judiciales | Identificacion de causas | Variable segun caso |

### 2.2 Datos generados por IA

| Tipo | Descripcion | Riesgo |
|---|---|---|
| Resumenes automaticos | Generados por Mistral AI / Workers AI | Podrian contener errores interpretativos |
| Descriptores tematicos | Clasificacion automatica | No validada por humano |
| Embeddings vectoriales | Representaciones numericas | Bajo riesgo de filtracion directa |

---

## 3. ANALISIS DE RIESGOS — LEY 19.628

### 3.1 Principios aplicables

| Principio | Obligacion | Estado de cumplimiento |
|---|---|---|
| Principio de calidad | Los datos deben ser exactos,idos y actualizados | ⚠️ Verificacion pendiente |
| Principio de finalidad | Uso solo para fines autorizados | ⚠️ Scoping no realizado |
| Principio de proporcionalidad | Solo datos necesarios | ⚠️ No se ha auditado contenido |
| Principio de seguridad | Medidas de proteccion | ✅ Cloudflare D1/Vectorize con encryption |

### 3.2 Riesgos identificados

| Riesgo | Descripcion | Severidad |
|---|---|---|
| RP-01 | Presencia no evaluada de RUT de funcionarios en dictamenes | Alta |
| RP-02 | Presencia no evaluada de nombres de terceros en casos disciplinarios | Alta |
| RP-03 | Errores en resumenes LLM que podrian afectar a personas | Media |
| RP-04 | Ausencia de proceso de anonimizacion | Alta |
| RP-05 | Falta de canal de ejercicio de derechos ARCO | Alta |

---

## 4. MEDIDAS ADOPTADAS Y PENDIENTES

### 4.1 Medidas implementadas

- Almacenamiento en Cloudflare D1 con encryption en reposo
- No exposicion publica de datos — plataforma en evaluacion
- Sin comparticion a terceros actualmente

### 4.2 Medidas pendientes

| Medida | Prioridad | Responsable |
|---|---|---|
| Analisis de contenido para identificar datos personales | Critica | CLO + equipo legal |
| Implementar pipeline de anonimizacion automatica | Critica | CTO |
| Evaluar necesidad de inscripcion en el Registro de Tratamiento | Alta | CLO |
| Disenar canal de ejercicio de derechos ARCO | Alta | CLO |
| Actualizar Politica de Privacidad del sitio/plataforma | Alta | CTO + CLO |
| Documentar base legal del tratamiento | Alta | CLO |

---

## 5. TRATAMIENTO DE DATOS JURISPRUDENCIALES — CONSIDERACIONES ESPECIALES

Los dictamenes de la CGR, aunque son documentos publicos, pueden contener datos personales de terceros que la Ley 19.628 protege incluso cuando estan en registros publicos.

**Criterio relevante:** La Ley 19.628 no prohibe el tratamiento de datos personales que obren en registros publicos, pero si exige que el tratamiento sea necesario para el fin que justifica su acceso y que se respete la proteccion de la persona afectada.

**Implicacion para este repositorio:** La inclusion de dictamenes completos (con nombres y RUT) en una base de datos vectorial searchable podria configurarse como un tratamiento que excede el fin de transparencia del documento original.

---

## 6. CONSENTIMIENTO Y BASE LEGAL

| Tratamiento | Base legal | Estado |
|---|---|---|
| Almacenamiento de dictamenes publicos | Ley 20.285 (acceso a informacion publica) | ⚠️ Requiere verificacion |
| Generacion de embeddings | Fin de prestacion del servicio | ⚠️ Requiere evaluacion |
| Busqueda semantica por usuarios | Provision del servicio de consulta | ⚠️ Requiere politicas claras |
| Generacion de resumenes por IA | Consentimiento o interes legitimo | No disponible |

---

## 7. DERECHOS ARCO (PENDIENTE DE IMPLEMENTACION)

En caso de que el servicio sea expuesto publicamente, los titulares de datos personales tendran derecho a:

| Derecho | Descripcion | Estado |
|---|---|---|
| Acceso | Conocer que datos suyos obran en el sistema | ❌ No implementado |
| Rectificacion | Corregir datos inexactos | ❌ No implementado |
| Cancelacion | Eliminar datos en certas circumstances | ❌ No implementado |
| Oposicion | Oponerse al tratamiento | ❌ No implementado |

**Nota:** Dada la naturaleza de datos publicos jurisprudenciales, la oposicion y cancelacion tendran limitaciones legales propias de la materia.

---

## 8. NOTA DE EXONERACION

Este documento refleja el analisis preliminar de cumplimiento y no constituye asesoria legal. La verificacion definitiva requiere revision por un abogado habilitado en derecho chileno de proteccion de datos.

---

*Generado automaticamente como parte del proceso de regularizacion legal del repositorio cgr (FURAA-18)*
