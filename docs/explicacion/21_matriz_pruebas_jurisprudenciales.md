# Matriz de pruebas jurisprudenciales

Fecha: 2026-04-11

La matriz ejecutable queda en:

- `docs/evaluation/jurisprudential_matrix.json`

## Proposito

Evitar que la mejora de una consulta rompa otra.

La matriz separa cuatro tipos de prueba:

- `pjo_esperado`: consultas que deberian activar un PJO/regimen conocido;
- `direct_hit_sin_pjo`: consultas donde basta con el dictamen directo correcto y no debe forzarse PJO;
- `trampa_deriva`: consultas que antes tendian a abrir familias jurisprudenciales ruidosas;
- `ambigua`: consultas donde la plataforma debe ser prudente y no inventar certeza.

## Casos iniciales

Incluye 20 consultas, entre ellas:

- `ley karin`;
- `acoso laboral`;
- `confianza legitima contrata`;
- `contratacion a honorarios funciones permanentes`;
- `incendio caso fortuito recepcion municipal`;
- `reconvencion`;
- `reconvencion llamado de atencion sumario administrativo`;
- `criterios evaluacion licitacion publica`;
- `plan regulador normas urbanisticas vias`.

## Regla de uso

Cada cambio que toque `doctrine-search`, PJO/regimenes o la UI principal debe revisar esta matriz antes de desplegar.

La evaluacion minima por consulta es:

- primer resultado esperado, si existe;
- regimen esperado, si existe;
- si el PJO se muestra solo cuando corresponde;
- si el sistema evita familias ruidosas;
- si el estado desplazado, tensionado o litigioso se muestra como tal.

## Deuda tecnica

El script actual `scripts/evaluate_queries.mjs` solo imprime top line y semantic anchor.

Siguiente mejora:

- adaptarlo para leer `docs/evaluation/jurisprudential_matrix.json`;
- validar `expected_top_id`;
- validar `expected_regimen_id`;
- marcar `PASS`, `WARN` o `FAIL`;
- producir un reporte JSON/Markdown por corrida.
