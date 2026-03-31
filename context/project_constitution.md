# Constitución del Proyecto

## Qué es Indubia

Indubia es una plataforma doctrinal sobre jurisprudencia administrativa chilena centrada en dictámenes de la Contraloría General de la República.

No es:

- un chatbot jurídico genérico;
- un sistema de opinión legal libre;
- un frontend cosmético sobre embeddings.

Sí es:

- un sistema de búsqueda doctrinal;
- una capa de lectura jurídica;
- una infraestructura que mejora gradualmente la estructura del corpus;
- una plataforma operada por una sola persona, donde la simplicidad importa.

## Principios de producto

- La doctrina amplifica la búsqueda, no la reemplaza.
- La señal semántica manda; la organización doctrinal la ordena.
- La UI debe hablar en lenguaje jurídico claro, no en metalenguaje del sistema.
- La plataforma debe evitar pseudo-precisión.
- Si un detalle jurídico no es confiable, se muestra menos, no más.

## Principios de arquitectura

- Una sola línea principal del sistema.
- Sin staging decorativo como dependencia normal de trabajo.
- Sin ramas, entornos o subdominios paralelos innecesarios.
- Sin frameworks nuevos cuando una extensión directa del core basta.
- La capa agéntica ayuda a evolucionar el core; no lo congela ni lo reemplaza.

## Principios de cambio

- Documentación en español.
- Commits en español.
- Deploy cuando el cambio está listo y validado.
- No tocar producción de forma ciega.
- Preferir cambios pequeños pero reales sobre planes abstractos largos.

## Principios de calidad jurídica

- Priorizar vigencia doctrinal real.
- Reutilizar relaciones entre dictámenes cuando existan.
- Resolver duplicación y fragmentación doctrinal con criterio conservador.
- Tratar fuentes legales con nombres canónicos y confianza explícita.
