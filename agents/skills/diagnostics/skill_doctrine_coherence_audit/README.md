# skill_doctrine_coherence_audit

Audita la coherencia doctrinal visible sin rehacer el pipeline, tanto sobre `doctrine-lines`
como sobre resultados concretos de `doctrine-search`.

## Qué revisa

- cohesión del cluster visible
- dispersión semántica
- probabilidad de outliers
- riesgo de fragmentación doctrinal
- duplicación visible entre líneas que responden a una misma consulta

## Qué entrega

- líneas fragmentadas o mixtas
- hallazgos accionables para corpus y producto
- candidate_actions para split, merge, reasignación o normalización
- una base mínima para decidir si una línea debe separarse, depurarse o revisarse

## Uso

```bash
npm run agents:doctrine:coherence -- --mode quick --query "contrata confianza legitima"
```
