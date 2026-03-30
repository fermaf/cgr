# skill_metadata_auto_normalization_executor

Primera skill de remediación controlada para metadata doctrinal.

## Alcance

- solo `enriquecimiento.etiquetas_json`
- solo bucket `auto_normalizable`
- preview por defecto
- apply solo con `allowIds` explícito y lote pequeño

## Reglas permitidas

- `trim_whitespace`
- `collapse_whitespace`
- `snake_case_to_spaces`
- `dedupe_normalized_duplicates`

## Reglas excluidas

- materias narrativas
- títulos o resúmenes
- casing doctrinal interpretativo
- cambios semánticos de labels

## Cómo correrla

```bash
npm run agents:metadata:auto-normalize -- --mode preview --target-environment staging
```

Intento de apply preparado:

```bash
npm run agents:metadata:auto-normalize -- --mode apply --target-environment staging --dry-run false --allow-ids 000066N20,000087N21
```
