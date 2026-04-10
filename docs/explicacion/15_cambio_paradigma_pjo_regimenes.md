# Arquitectura de Regímenes Jurisprudenciales — Indubia

## Propósito

Modelar el espacio de decisión administrativa de la CGR como **Regímenes Jurisprudenciales**: estructuras de estabilidad interpretativa descubiertas *bottom-up* desde el grafo real del corpus.

La unidad de organización no es el cluster semántico (demasiado amplio) ni el dictamen individual (demasiado atómico). Es el **Régimen**: una constelación de dictámenes que aplican un mismo criterio jurídico compartido.

> **Nota terminológica**: el sistema gestiona **jurisprudencia** administrativa (fuente vinculante del derecho administrativo chileno), no doctrina académica. La distinción es jurídicamente relevante y se mantiene en todos los nombres de tablas, endpoints y logs.

---

## Arquitectura de 4 capas

| Capa | Entidad | Tabla D1 | Descripción |
|------|---------|----------|-------------|
| 1 | Acto interpretado | `dictamenes` | Dictamen individual |
| 2 | Problema Jurídico Operativo (PJO) | `problemas_juridicos_operativos` | Pregunta jurídica concreta resuelta |
| 3 | Régimen Jurisprudencial | `regimenes_jurisprudenciales` | Estructura de estabilidad interpretativa |
| 4 | Topología normativa | `norma_regimen` | Normas que anclan el régimen |

---

## Principio de supremacía temporal

El dictamen **más reciente** dentro de un Régimen gobierna la lectura vigente.

- Si ese dictamen tiene `estado_vigencia = 'desplazado'`, el régimen se marca `estado = 'desplazado'` y toda la línea anterior degrada a antecedente histórico.
- Si hay alta proporción de reconsideraciones (> 30%), el régimen se marca `zona_litigiosa`.
- El `dictamen_rector_id` siempre apunta al dictamen que rige la lectura actual.

---

## Identidad normativa (buildNormaCanonicalKey)

La construcción de la clave canónica respeta la jerarquía del derecho chileno:

| Tipo | Identificación | Ejemplo de clave |
|------|---------------|-----------------|
| Ley | Solo número | `Ley\|18834\|10` |
| DL (Decreto Ley) | Solo número | `DL\|3500\|76` |
| LOCBGAE, LBPA, Ley Karin... | Alias → número | `Ley\|18575\|3` |
| Código del Trabajo, Civil... | Nombre canónico + artículo | `Código\|Código del Trabajo\|159` |
| DFL | Número + año + órgano (5 chars) | `DFL\|1\|2005\|salud\|4` |
| Decreto / Resolución | Número + año + órgano | `Decreto\|250\|2004\|hacie\|22` |
| CPR | Descartada (siempre transversal) | `null` |
| LOCBGAE sin artículo | Descartada (transversal) | `null` |

---

## Pipeline de descubrimiento (Fase 0 → Fase 1)

### Fase 0 — Exploración

```
GET /api/v1/pilot/regimenes/seeds
  → Lista 20 semillas de máxima centralidad jurisprudencial

GET /api/v1/pilot/regimenes?seedIndex=N
  → Expande la semilla N y devuelve la comunidad descubierta (no persiste)
```

### Fase 1 — Backfill persistente

```
POST /api/v1/pilot/regimenes/backfill
  → Dispara RegimenBackfillWorkflow (CF Workflows)
  → Procesa semillas 0..19 (o las especificadas en seedIndexes)
  → Cada semilla = un step.do() independiente con reintentos

GET /api/v1/regimenes?estado=activo&limit=50
  → Lista regímenes persistidos en D1

GET /api/v1/regimenes/:id
  → Detalle: régimen + normas nucleares + timeline
```

---

## Algoritmo de descubrimiento (regimenDiscovery.ts)

1. **Semilla**: dictamen de alta centralidad (`nucleo_doctrinal` o `criterio_operativo_actual`, score ≥ 0.7)
2. **Expansión por grafo**: 1 hop en `dictamen_relaciones_juridicas` (82K aristas), entrantes y salientes
3. **Normas compartidas**: busca en `dictamen_fuentes_legales` (152K referencias) normas que aparezcan en ≥ 2 miembros
4. **Filtrado canonical**: aplica `buildNormaCanonicalKey()` — descarta transversales (CPR, LOCBGAE sin art.), ambiguas (DFL sin año) y de relleno
5. **Metadata jurisprudencial**: enriquece con `dictamen_metadata_doctrinal` (rol, vigencia, scores)
6. **Señales de estado**: reconsideraciones, desplazamientos, proporción de acciones

---

## Estado en producción (D1 cgr-dictamenes)

| Tabla | Filas | Descripción |
|-------|-------|-------------|
| `regimenes_jurisprudenciales` | 6 (piloto) | Regímenes descubiertos |
| `norma_regimen` | 36 | Normas asociadas a cada régimen |
| `regimen_timeline` | 11 | Eventos de evolución temporal |
| `problemas_juridicos_operativos` | 0 | Pendiente Fase 2 |
| `pjo_dictamenes` | 0 | Pendiente Fase 2 |

### Regímenes del piloto

| Nombre | Estado | Estabilidad | Span temporal |
|--------|--------|-------------|---------------|
| Confianza legítima en contratas | activo | 0.91 | 2010–2024 |
| Contratación a honorarios | activo | 1.00 | 1987–2024 |
| Permiso de edificación y PRC | activo | 1.00 | 2008–2023 |
| Competencias alcaldes COVID-19 | activo | 1.00 | 1999–2021 |
| Reajuste remuneraciones 2016 | activo | 1.00 | 2007–2018 |
| Adjudicación licitación pública | **desplazado** | 0.55 | 2010–2023 |

---

## Archivos clave

| Archivo | Propósito |
|---------|-----------|
| `cgr-platform/src/lib/regimenDiscovery.ts` | Descubrimiento bottom-up (grafo + normas) |
| `cgr-platform/src/lib/regimenBuilder.ts` | Persistencia en D1 (upsert, normas, timeline) |
| `cgr-platform/src/workflows/regimenBackfillWorkflow.ts` | Workflow resiliente de backfill |
| `cgr-platform/migrations/0009_create_regimenes_jurisprudenciales.sql` | Migración D1 |

---

## Próximos pasos (Fase 2)

1. **PJOs (Problemas Jurídicos Operativos)**: extraer la pregunta jurídica concreta de cada régimen usando LLM ligero (gemini-flash)
2. **Integración con búsqueda**: asociar dictámenes recuperados por Pinecone con su Régimen jurisprudencial
3. **API pública**: exponer `GET /api/v1/regimenes` sin autenticación admin (datos de lectura)
4. **Frontend**: componente de timeline jurisprudencial que muestre la evolución del régimen
