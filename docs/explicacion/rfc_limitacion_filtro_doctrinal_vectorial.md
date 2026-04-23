# RFC: Limitación de Filtro Doctrinal en Búsqueda Vectorial

## Status
**DOCUMENTADO** - 2026-04-23

## Hallazgo

Durante la corrección de los bloqueantes identificados por el auditor externo, se descubrió una limitación arquitectónica que no puede resolverse sin cambios en la infraestructura de Pinecone.

## Limitación

El filtro por metadata doctrinal (`estado_vigencia`, `reading_role`, `rol_principal`, `min_confidence`, `min_currentness`, `supports_state_current`) se aplica **POST-paginación** en el flujo de búsqueda vectorial (Pinecone).

### Flujo actual (vectorial)

```
1. Query Pinecone → obtiene hasta (limit * 2) resultados
2. Se aplica paginación SQL: .slice(0, limit)
3. SE APLICA FILTRO DOCTRINAL (post-paginación)
4. total = resultados sobrevivientes
```

### Problema

Si el universo filtrado excede `limit`, resultados válidos en otras páginas quedan fuera. El `total` returned refleja solo lo sobreviviente en la página actual, no el universo real filtrado.

### Causa

Pinecone no tiene los campos de metadata doctrinal (`estado_vigencia`, `reading_role`, etc.) en su schema de vectores. Por lo tanto, no puede filtrar en el vector store.

## Comportamiento por Escenario

| Escenario | Comportamiento | Estado |
|---|---|---|
| **SQL fallback** | Filtro ANTES de paginación ✅ | Funciona correctamente |
| **Búsqueda vectorial** | Filtro POST-paginación ⚠️ | Limitación arquitectónica |

## Solución Completa (requiere FASE 7)

La solución definitiva requiere incluir la metadata doctrinal en el schema de Pinecone:

```typescript
interface DictamenVectorRecord {
  id: string;
  values: number[];  // embedding
  metadata: {
    // ... campos existentes ...
    // NUEVOS - metadata doctrinal
    estado_vigencia?: string;
    reading_role?: string;
    reading_weight?: number;
    currentness_score?: number;
    confidence_global?: number;
    rol_principal?: string;
  };
}
```

Con esto, el filtro podría aplicarse en el vector store con `$eq`, `$in`, `$gte`, etc.

## Implementación SQL Fallback (Fix 2026-04-23)

El filtro doctrinal en el path SQL fallback se construye como una subquery:

```sql
condition += ` AND d.id IN (
  SELECT m2.dictamen_id
  FROM dictamen_metadata_doctrinal m2
  WHERE ${mdCondition}
)`;
```

Donde `mdCondition` usa el alias `m2` consistentemente para todas las columnas (`m2.estado_vigencia`, `m2.reading_role`, etc.).

**Nota:** La tabla `dictamen_metadata_doctrinal` tiene PK compuesta por `(dictamen_id, pipeline_version)`. La query actual no filtra por `pipeline_version` ni ordena por `updated_at/computed_at`, lo que podría devolver resultados no determinísticos si coexistieran múltiples versiones para un mismo dictamen. Este es un riesgo menor ya que típicamente existe una sola versión activa.

## Decisión de No Implementar Ahora

1. **Filtrar en Pinecone requiere re-vectorizar** todo el corpus con los nuevos campos de metadata
2. **Costo/beneficio**: El path SQL fallback maneja correctamente la mayoría de consultas estructuradas (filtros por año, materia, etiquetas, división)
3. **Los filtros doctrinales típicamente se usan en conjunto** con otros parámetros que disparan el fallback SQL

## Acción Requerida

**No bloqueante para el fix actual.** El filtro funciona correctamente para búsquedas SQL fallback.

Para el caso vectorial, se documenta la limitación en este RFC y en `docs/explicacion/rfc_metadata_doctrinal_conectividad.md` como FASE 7 pendiente.

## Referencias

- RFC original: `docs/explicacion/rfc_metadata_doctrinal_conectividad.md` (FASE 7)
- Fix SQL fallback: `cgr-platform/src/index.ts` líneas ~933-985
- Fix endpoint detalle: `cgr-platform/src/index.ts` líneas ~1243-1267
- Fix vectorial post-filter: `cgr-platform/src/index.ts` líneas ~1055-1125