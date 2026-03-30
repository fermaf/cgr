# skill_metadata_blocker_regeneration_executor

Primera skill de tratamiento controlado para blockers críticos de metadata doctrinal.

## Alcance

- solo bucket `critical_blockers`
- detecta campos doctrinales vacíos exactos
- clasifica estrategia por registro
- preview por defecto
- apply solo con `allowIds` explícito y lote pequeño

## Estrategias

- `regenerate_from_source`
- `regenerate_from_existing_metadata`
- `needs_manual_semantic_review`
- `skip_until_environment_safe`

## Cómo correrla

```bash
npm run agents:metadata:blockers -- --mode preview --target-environment staging
```

Intento de apply preparado:

```bash
npm run agents:metadata:blockers -- --mode apply --target-environment staging --dry-run false --allow-ids 007157N20,009548N20
```
