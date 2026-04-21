# Plan de avance del paradigma jurisprudencial PJO

## 1. Propósito

Este plan fija la ruta de trabajo para que Indubia deje de operar como un buscador semántico con adornos jurisprudenciales y pase a organizar la respuesta alrededor de problemas jurídicos reales, criterios vigentes y evolución temporal.

El **PJO offline auditor** es solo un paso de esta ruta. No es el paradigma completo ni debe convertirse en otro parche táctico.

## 2. Definición simple

Un **Problema Jurídico Operativo (PJO)** es la pregunta jurídica concreta que la Contraloría resuelve en uno o más dictámenes.

Ejemplo conceptual:

> ¿Puede mantenerse o pagarse un subsidio habitacional si la vivienda fue afectada por un incendio antes de completar la recepción o ejecución exigida?

Un PJO no es:

- una búsqueda textual;
- una etiqueta temática;
- una materia administrativa copiada del dictamen;
- un cluster de embeddings renombrado;
- una respuesta generada en caliente por un LLM.

Un PJO debe tener, como mínimo:

- una pregunta jurídica clara;
- una respuesta sintética jurídicamente prudente;
- un dictamen rector o pivote;
- dictámenes vinculados con roles diferenciados;
- normas nucleares cuando existan;
- estado temporal: vigente, histórico, desplazado, en transición, zona litigiosa o abstención.

## 3. Nuevo paradigma esperado

El paradigma no es “responder 20 preguntas”. Es construir una capa de representación del espacio de decisiones administrativas de la CGR.

La búsqueda semántica sigue cumpliendo su función:

> encontrar candidatos cercanos a la consulta.

La capa jurisprudencial debe cumplir otra función:

> decidir cómo leer esos candidatos y qué lugar ocupan en el criterio vigente.

La jerarquía esperada es:

1. Consulta concreta del usuario.
2. Foco directo de lectura, si existe.
3. PJO asociado, si el problema está modelado.
4. Régimen jurisprudencial, si hay estabilidad interpretativa.
5. Evolución temporal y dictamen rector.
6. Dictámenes complementarios o históricos.
7. Familias o líneas solo si superan coherencia jurídica suficiente.

Si no hay régimen o PJO suficientemente confiable, el sistema debe decirlo con sobriedad. Es mejor mostrar un dictamen directo correcto que inventar una línea jurisprudencial débil.

## 4. Riesgo que este plan controla

Una línea jurisprudencial puede estar muy bien armada y aun así quedar destruida por un dictamen posterior que cambia el criterio.

Por eso el PJO no puede validarse solo por similitud temática. Debe controlar:

- si hay un dictamen más reciente dentro del mismo problema;
- si ese dictamen reconsidera, limita, complementa o desplaza el criterio;
- si la CGR dejó de intervenir;
- si la materia pasó a ser litigiosa;
- si la respuesta del PJO todavía representa el estado vigente.

## 5. Fase 0 — Inventario y auditoría de lo existente

Objetivo: saber qué se hizo realmente y qué puede usarse sin seguir iterando a ciegas.

Entregables:

- reporte de todos los regímenes jurisprudenciales existentes;
- reporte de todos los PJOs existentes;
- relación entre `regimenes_jurisprudenciales`, `problemas_juridicos_operativos`, `regimen_dictamenes`, normas y timeline;
- clasificación por estado:
  - publicable;
  - útil pero incompleto;
  - sospechoso;
  - no publicable;
- lista de brechas:
  - PJO sin dictamen rector;
  - régimen sin PJO;
  - dictamen rector no incluido como miembro;
  - miembro más reciente que contradice o desplaza el criterio;
  - normas nucleares débiles o demasiado transversales;
  - respuesta sintética demasiado tajante.

Quién lo hace:

- código determinístico: detecta inconsistencias estructurales y temporales;
- LLM: propone lectura jurídica, pregunta y respuesta cuando falten o estén débiles;
- humano: aprueba inicialmente los casos de mayor impacto y los casos dudosos.

Criterio de salida:

- ningún PJO se considera activo para UI principal sin pasar por esta auditoría mínima.

## 6. Fase 1 — Matriz de pruebas jurisprudenciales

Objetivo: dejar de probar solo con ejemplos sueltos.

La matriz debe tener cuatro grupos:

- casos canónicos con PJO esperado;
- casos con dictamen directo fuerte pero sin PJO;
- trampas de deriva temática donde no debe forzarse una línea;
- consultas ambiguas donde el sistema debe mostrar alternativas o pedir lectura más precisa.

Ejemplos iniciales:

- `ley karin`;
- `acoso laboral`;
- `reconvención`;
- `incendio caso fortuito recepción municipal`;
- `confianza legítima contrata`;
- `invalidación administrativa plazo`;
- `caso fortuito pago subsidio incendio forestal`;
- `responsabilidad administrativa sumario`.

La matriz no debe limitarse a casos canónicos. Los casos canónicos sirven para confirmar que la capa funciona; los casos difíciles sirven para confirmar que no inventa certeza.

Criterio de salida:

- cada cambio de backend o frontend que toque búsqueda jurisprudencial debe evaluarse contra esta matriz antes de desplegarse.

## 7. Fase 2 — Backfill y robustecimiento PJO

Objetivo: alimentar el paradigma, no solo mostrar los PJOs ya existentes.

Proceso recomendado:

1. elegir semillas desde señales fuertes:
   - dictámenes con alta centralidad jurisprudencial;
   - dictámenes recientes con señales de cambio de criterio;
   - dictámenes con rol de criterio operativo actual;
   - regímenes con normas nucleares compartidas;
   - consultas reales frecuentes o dolorosas;
2. expandir por grafo jurídico y normas compartidas;
3. proponer PJO y régimen con LLM offline;
4. verificar temporalidad y relaciones de desplazamiento;
5. persistir solo si supera umbrales estructurales;
6. marcar como revisión humana si hay duda jurídica relevante.

El LLM no debe decidir solo. Debe actuar como asistente de lectura, no como fuente de verdad.

Criterio de salida:

- crecimiento controlado de PJOs publicables, con trazabilidad de evidencia y estado de revisión.

## 8. Fase 3 — Integración al backend de búsqueda

Objetivo: que el PJO gobierne la respuesta cuando corresponde, sin matar la búsqueda semántica.

Reglas:

- si hay PJO publicable asociado al foco directo, se promueve como respuesta principal;
- si hay foco directo fuerte pero no hay PJO confiable, se muestra el dictamen directo y se evita forzar una familia;
- si hay PJO desplazado o histórico, se muestra como antecedente, no como estado vigente;
- si hay dictamen posterior que cambia el criterio, el PJO debe degradarse o actualizarse;
- el fallback léxico puede mostrar material útil, pero no debe inventar régimen jurisprudencial.

Criterio de salida:

- las consultas de la matriz deben devolver una jerarquía estable: foco directo, PJO si existe, régimen si corresponde y auxiliares solo si aportan.

## 9. Fase 4 — Integración al frontend

Objetivo: que el usuario vea jurisprudencia, no maquinaria interna.

Reglas de UX:

- usar “jurisprudencia” y “criterio jurisprudencial”, no “doctrina” cuando pueda confundirse con doctrina académica;
- el PJO debe aparecer como respuesta principal cuando esté validado;
- el dictamen rector debe ser evidente;
- la vigencia debe ser visible;
- lo histórico debe verse como antecedente, no como verdad actual;
- no mostrar familias amplias si degradan el hallazgo directo.

Criterio de salida:

- el usuario puede entender qué leer primero, qué está vigente y qué quedó como contexto histórico.

## 10. Fase 5 — Operación continua

Objetivo: mantener vivo el modelo.

Cada nuevo lote de dictámenes debe pasar por:

- enrichment;
- relaciones jurídicas;
- metadata jurisprudencial;
- detección de impacto sobre regímenes existentes;
- detección de nuevos PJOs;
- auditoría de cambios temporales.

La pregunta operativa recurrente es:

> ¿Este nuevo dictamen confirma, ajusta, desplaza o destruye un PJO existente?

Si la respuesta es incierta, el caso queda marcado para revisión y no debe promocionarse como criterio vigente.

## 11. Qué se espera antes de optimizar

Antes de seguir optimizando ranking, diseño visual o prompts de búsqueda, deben existir:

- inventario real de PJOs y regímenes;
- auditoría mínima de publicabilidad;
- matriz de pruebas;
- reglas de promoción y degradación;
- primer backfill controlado;
- medición de regresiones con consultas reales.

Optimizar antes de eso vuelve al mismo problema: arreglar un caso y romper otro.

## 12. Trabajo inmediato

La próxima ejecución debe producir estos tres artefactos:

1. **Auditor offline PJO/regímenes**: reporte estructural y temporal de lo ya persistido.
2. **Matriz de pruebas jurisprudenciales**: consultas, expectativa y tipo de riesgo.
3. **Plan de backfill PJO**: primeras semillas y criterios de aprobación.

Con esos tres artefactos, recién corresponde robustecer el pipeline de producción con menos incertidumbre.
