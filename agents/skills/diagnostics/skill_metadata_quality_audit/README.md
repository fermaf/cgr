# skill_metadata_quality_audit

Audita la calidad doctrinal de la metadata almacenada en D1 y la traduce a un mapa de deuda accionable.

## Qué revisa

- `materia` vacía, larga, narrativa o con verbos de resolución.
- labels vacíos, genéricos o con formato inconsistente.
- `titulo`, `resumen` y `analisis` vacíos o demasiado débiles para UX doctrinal.
- desalineación entre `materia` y labels doctrinales.
- impacto estimado sobre `doctrine-search`, `doctrine-lines`, `query_match_reason`, `key_dictamenes` y títulos visibles.

## Qué produce

- `findings[]` con severidad, evidencia, áreas de impacto y recomendación.
- `remediation_buckets[]` para separar:
  - `product_blocking_noise`
  - `needs_semantic_review`
  - `auto_normalizable`
  - `low_priority_noise`

## Cómo correrla

```bash
npm run agents:metadata:audit -- --mode quick --target-environment staging
```

Modo más amplio:

```bash
npm run agents:metadata:audit -- --mode standard --sample-size 250 --target-environment staging
```

## Notas operativas

- Es una skill diagnóstica y no destructiva.
- No usa LLM ni escribe en D1.
- `targetEnvironment=local` solo es seguro si existe snapshot aislado; hoy el camino soportado es `staging` read-only.
