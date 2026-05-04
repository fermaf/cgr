# AUDITORÍA DE DATOS PERSONALES — FURAA-18
## Bloqueo #2: Datos personales no anonimizados en corpus CGR

**Repositorio:** cgr (https://github.com/fermaf/cgr)
**Fecha:** 2026-05-04
**Responsable:** CLO — Agente de Cumplimiento Legal
**Ref:** FURAA-18 — Bloqueo crítico #2
**Clasificación:** LEGAL — CONFIDENCIAL

---

## RESUMEN EJECUTIVO

| Campo/Tabla | Dato personal | Riesgo | Observación |
|---|---|---|---|
| `dictamenes.destinatarios` | POTENCIAL | MEDIO | Nombres de destinatarios de dictámenes |
| `cat_abogados.iniciales` | NO | BAJO | Solo iniciales, sin nombres |
| `cat_divisiones` | NO | BAJO | Unidades organizacionales de CGR |
| `dictamenes.numero`, `anio`, `fecha` | NO | BAJO | Metadatos institucionales |
| `enriquecimiento.titulo/resumen/analisis` | NO | BAJO | Generados por LLM, sin datos personales |
| `dictamenes.criterio` | NO | BAJO | Texto institucional del dictamen |

---

## 1. ANÁLISIS POR TABLA

### 1.1 `dictamenes`

```
Campos:
- id, numero, anio, fecha_documento, fecha_indexacion
- division_id (FK a cat_divisiones)
- criterio (texto del dictamen)
- destinatarios (POSIBLE CONTENEDOR DE DATOS PERSONALES)
- materia
- old_url
- origen_importacion ('mongoDb' | scraping)
```

**Riesgo `destinatarios`:** Los dictámenes de la CGR son documentos oficiales dirigidos a autoridades y funcionarios específicos. El campo `destinatarios` puede contener nombres completos de personas naturales (ej: "Sr. Juan Pérez, Director de Rentas").

**Evaluación:** Si el contenido es texto libre con nombres de personas, aplica Ley 19.628 sobre protección de datos personales. Los datos de funcionarios públicos en contexto de actos administrativos tienen tratamiento diferenciado, pero no están completamente exentos.

### 1.2 `cat_abogados`

```
Campos:
- id (PK)
- iniciales (TEXT UNIQUE) — ej: "J.P.", "M.L."
```

**Riesgo:** BAJO. Solo contiene iniciales anonimizadas. No constituye dato personal bajo Ley 19.628.

### 1.3 `cat_divisiones`

```
Campos:
- id (PK)
- codigo (TEXT UNIQUE)
- nombre_completo (TEXT)
```

**Riesgo:** BAJO. Son unidades institucionales de la CGR, no datos personales.

### 1.4 `enriquecimiento`

```
Campos:
- dictamen_id (FK)
- modelo_llm, fecha_enriquecimiento
- titulo, resumen, analisis (generados por LLM)
- etiquetas_json, booleanos_json, fuentes_legales_json
- genera_jurisprudencia
```

**Riesgo:** BAJO. Contenido generado por modelo LLM a partir del texto del dictamen. No contiene datos personales nuevos.

### 1.5 `atributos_juridicos`

Flags booleanos sobre características del dictamen. Sin datos personales.

---

## 2. HALLAZGOS PRINCIPALES

### 2.1 Riesgo confirmado
- **`destinatarios`**: campo de texto libre que potencialmente contiene nombres de personas naturales (funcionarios, autoridades) identificadas en su calidad profesional.

### 2.2 Riesgo no confirmado
- Se requiere verificar el contenido real del campo `destinatarios` en una muestra del corpus para determinar si efectivamente contiene nombres propios o solo referencias institucionales genéricas.

### 2.3 Sin riesgo identificado
- Catálogos de abogados (solo iniciales)
- Divisiones institucionales
- Metadatos de dictámenes
- Contenido enriquecido por LLM

---

## 3. EVALUACIÓN BAJO LEY 19.628

La Ley 19.628 sobre protección de datos personales establece:

- **Datos sensibles:** No detectados en el schema.
- **Datos de personas jurídicas:** Los dictámenes dirigidos a órganos del Estado o personas jurídicas no tienen protección bajo Ley 19.628.
- **Datos de personas naturales:** El tratamiento diferenciado aplica si los destinatarios son identificados como personas naturales en ejercicio de sus funciones.

**Criterio CGR:** Los dictámenes de la Contraloría General de la República son actos administrativos públicos. Según Ley 20.285 (transparencia), los actos administrativos son información pública. Sin embargo, los datos personales contenidos en ellos no quedan automáticamente disponibles para tratamiento comercial.

---

## 4. ACCIONES REQUERIDAS

| Prioridad | Acción | Responsable | Estado |
|---|---|---|---|
| ALTA | Extraer muestra aleatoria de `destinatarios` y verificar contenido real (nombres vs. referencias institucionales) | CLO | PENDIENTE — requiere acceso a D1 remoto |
| MEDIA | Documentar leyenda de tratamiento de datos personales en DATA_POLICY.md | CLO | PENDIENTE |
| MEDIA | Si se confirman nombres propios, evaluar anonimización antes de uso comercial | CLO + CTO | PENDIENTE de resultado anterior |

---

## 5. RECOMENDACIÓN MVP

**Conclusión:** El schema no muestra datos personales evidentes (no hay RUT, RUN, dirección, teléfono, email). El único vector de riesgo es el campo `destinatarios`.

**Para uso interno y demos no comerciales:** El riesgo es manejable con la leyenda de clasificación ya existente en DISCLAIMER.md.

**Para uso comercial:** Se requiere:
1. Verificación del contenido real de `destinatarios`
2. Si contiene nombres de personas naturales, evaluar anonimización o base de autorización

---

*Documento preparado por CLO — Agente de Cumplimiento Legal, INDUBIA*
*Ref: FURAA-18 — Bloqueo crítico #2*
