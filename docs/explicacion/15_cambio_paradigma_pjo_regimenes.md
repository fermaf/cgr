# Cambio de Paradigma: del Clustering Semántico a Regímenes Jurisprudenciales

## 1. Contexto

Múltiples iteraciones del core dejaron una conclusión estable:

- el retrieval semántico encuentra buenos candidatos;
- la organización posterior degrada la calidad jurídica visible;
- el problema no se resuelve con más ranking, scoring o penalizaciones;
- la unidad de organización (cluster semántico) es conceptualmente incorrecta.

## 2. Distinción fundamental: jurisprudencia vs. doctrina

La plataforma organiza **jurisprudencia administrativa**, no doctrina.

- **Jurisprudencia**: criterios establecidos por la CGR a través de sus dictámenes. Son vinculantes dentro del ámbito de competencia de la Contraloría.
- **Doctrina**: opinión de juristas y académicos sobre el derecho. No es vinculante.

Esta distinción debe reflejarse en:

- naming de código (no `doctrine-*` sino `jurisprudencia-*` donde corresponda);
- textos de UI (el usuario lee "jurisprudencia", no "doctrina");
- documentación interna.

Nota: la migración de naming en código existente será gradual. El código nuevo debe usar el naming correcto desde el inicio.

## 3. Principio de supremacía temporal

Un solo dictamen reciente puede destruir una línea jurisprudencial completa.

Ejemplo:

- La CGR sostuvo durante 10 años que X era procedente.
- Un dictamen de 2024 cambia el criterio: X ya no es procedente.
- Toda la línea anterior queda como antecedente histórico, no como verdad jurídica.

El sistema debe detectar esto naturalmente:

- El dictamen más reciente dentro de un Régimen hereda el peso máximo.
- Si ese dictamen contradice o desplaza el criterio previo, el Régimen cambia de estado.
- La línea anterior se degrada a contexto histórico, no se elimina.

Regla operativa: **fecha + tipo_accion > cualquier score heurístico**.

## 4. Arquitectura de 4 capas

| Capa | Concepto | Unidad |
|------|----------|--------|
| 1 | Acto interpretado | Dictamen individual |
| 2 | Operación jurídica | Problema Jurídico Operativo (PJO) |
| 3 | Régimen jurisprudencial | Agrupación estable de PJOs |
| 4 | Topología normativa | Norma ↔ PJO ↔ Régimen |

### Capa 1: ya existe

`dictamenes` + `enriquecimiento` + `atributos_juridicos` + `dictamen_metadata_doctrinal`.

### Capa 2: PJO

Un PJO es una pregunta jurídica concreta que la CGR ha resuelto, está resolviendo, o dejó de resolver.

Un PJO NO es:

- una materia amplia;
- un descriptor semántico;
- un fact pattern (incendio ≠ inundación, pero ambos pueden ser "fuerza mayor").

### Capa 3: Régimen jurisprudencial

Un Régimen agrupa PJOs que comparten estructura normativa y evolución jurisprudencial.

Se descubre bottom-up desde:

1. cadenas de relaciones jurídicas (grafo de 82K aristas);
2. normas compartidas (152K referencias, 5K normas únicas);
3. metadata jurisprudencial existente (17K registros).

El LLM solo nombra y formula preguntas. No descubre estructura.

### Capa 4: topología normativa

Conecta normas con Regímenes y PJOs. Permite detectar qué normas participan en múltiples regímenes y cuáles son genéricas (deben penalizarse como señal).

## 5. Supremacía temporal en el Régimen

Cada Régimen tiene un timeline:

- fundación: primer dictamen que estableció el criterio;
- consolidación: dictámenes que aplicaron y confirmaron;
- ajuste: dictámenes que modificaron parcialmente;
- desplazamiento: dictamen que cambió el criterio;
- abstención: dictamen que declaró que la CGR ya no interviene.

El dictamen más reciente gobierna. Si cambia el criterio, todo lo anterior es antecedente histórico.

## 6. Plan de implementación

### Fase 0: prueba conceptual manual

Crear un script que expanda comunidades desde dictámenes de alta centralidad y genere candidatos a Régimen para evaluación manual.

### Fase 1: pipeline de descubrimiento

Automatizar la detección de Regímenes sobre todo el corpus vectorizado.

### Fase 2: integración en búsqueda

La búsqueda devuelve Regímenes y PJOs, no clusters semánticos.

### Fase 3: frontend

La experiencia visible habla de jurisprudencia, no de doctrina ni de metalenguaje del sistema.

## 7. Relación con el core existente

- `doctrine-search` y `doctrine-lines` siguen operando como fallback;
- el nuevo flujo se activa progresivamente;
- la metadata jurisprudencial existente se reutiliza íntegramente;
- los embeddings siguen siendo la puerta de entrada para retrieval.
