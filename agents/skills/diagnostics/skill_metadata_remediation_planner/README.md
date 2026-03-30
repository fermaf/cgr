# skill_metadata_remediation_planner

Planner de saneamiento para metadata doctrinal.

## Qué hace

- reutiliza la auditoría viva de `skill_metadata_quality_audit`;
- propone batches priorizados;
- separa blockers, auto-normalización segura, revisión semántica y ruido diferible;
- no modifica datos.

## Buckets

- `critical_blockers`
- `auto_normalizable`
- `needs_semantic_review`
- `low_priority_noise`

## Cómo correrla

```bash
npm run agents:metadata:plan -- --mode quick --target-environment staging
```

Modo más amplio:

```bash
npm run agents:metadata:plan -- --mode standard --target-environment staging --max-suggested-batches 4
```

## Notas

- `first_fix_batch` prioriza registros con campos vacíos.
- `presentation_normalization_batch` solo aparece cuando hay evidencia conservadora de auto-fix seguro.
- `semantic_review_batch` existe para la deuda doctrinal que no conviene corregir automáticamente.
