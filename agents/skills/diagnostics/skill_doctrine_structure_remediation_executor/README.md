# skill_doctrine_structure_remediation_executor

Remediación estructural conservadora sobre líneas doctrinales duplicadas, ya sea en
`doctrine-lines` o en resultados visibles de `doctrine-search`.

## Qué hace

- toma el mejor `suggest_merge_clusters` visible;
- puede operar sobre una query semántica concreta;
- valida si es un merge de bajo riesgo;
- prepara before/after operable;
- en `apply`, persiste una regla derivada en `doctrine_structure_remediations`.

## Qué no hace

- no toca embeddings;
- no toca `dictamenes_source` ni `dictamenes_paso`;
- no reescribe textos doctrinales;
- no ejecuta múltiples merges por corrida.

## Uso

Preview:

```bash
npm run agents:doctrine:structure-remediate -- --mode preview --target-environment production
```

Preview sobre una query visible:

```bash
npm run agents:doctrine:structure-remediate -- --mode preview --target-environment production --query "contrata confianza legitima"
```

Apply:

```bash
npm run agents:doctrine:structure-remediate -- --mode apply --target-environment production --confirm-representative-id 000720N18 --confirm-representative-id 043518N17 --confirm-representative-id 001072N18 --confirm-representative-id 003086N18
```
