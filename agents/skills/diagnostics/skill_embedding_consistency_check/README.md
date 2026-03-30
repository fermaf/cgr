# skill_embedding_consistency_check

Primera skill doctrinal diagnóstica real de Indubia.

## Qué revisa

- consistencia entre `dictamenes` / `enriquecimiento` en D1 y el namespace activo de Pinecone;
- drift entre cohorte `mistral-large-2411` y `mistral-large-2512`;
- metadata doctrinal mínima necesaria para `doctrine-search` y `doctrine-lines`;
- salud básica del retrieval vía una búsqueda textual de prueba.

## Qué no hace

- no modifica D1;
- no modifica Pinecone;
- no dispara workflows;
- no repara automáticamente hallazgos.

## Modos

- `quick`: sample pequeño y validación rápida.
- `standard`: sample más amplio y mejor cobertura diagnóstica.

## Ejecución recomendada

Desde la raíz del repo:

```bash
npm run agents:embedding:check -- --mode quick --target-environment staging
```

Con sample mayor:

```bash
npm run agents:embedding:check -- --mode standard --sample-size 100 --target-environment staging
```

## Dependencias operativas

- `cgr-platform/wrangler.jsonc`
- `cgr-platform/.dev.vars`
- `CLOUDFLARE_API_TOKEN`
- `PINECONE_API_KEY`

## Salida

Devuelve un JSON estructurado con:

- `summary`
- `findings[]`
- `stats`
- `severity`
- `recommended_actions[]`

## Hallazgos típicos

- `namespace_vector_count_mismatch`
- `sample_vector_missing_in_active_namespace`
- `sample_vector_metadata_insufficient`
- `legacy_2411_corpus_drift`
- `doctrinal_metadata_debt`
- `retrieval_probe_failed`
