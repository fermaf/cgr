# Prioridades Actuales

## Prioridad 1

Integrar la doctrina (Fase 1 y 2) en el servicio de Búsqueda principal.

Estado actual:
- Base de datos D1 ya contiene la tabla puente `regimen_dictamenes` (396 filas) y `problemas_juridicos_operativos` (extracción completada con Gemini).
- Workflow de metadata e ingestión operativos.

Próximo paso inmediato:
- Modificar el backend endpoint de public search (`GET /api/v1/buscar` / Pinecone integration) para inyectar la pregunta del PJO y la metadata del Régimen a cada dictamen devuelto que pertenezca a uno.

## Prioridad 2

Reflejar la madurez de la plataforma Indubia en el Frontend.

Esto incluye:
- crear un "PJO Badge" en la tarjeta de dictamen que muestre clara y visualmente la Pregunta y si el régimen está activo, en transición o desplazado.
- crear una "Página o Modal de Detalle de Régimen" que conecte cronológicamente los dictámenes y presente la evolución del problema jurídico resuelto (timeline y normas nucleares).

## Qué evitar

- staging completo artificial;
- metalenguaje excesivo en UI;
- pseudo-precisión jurídica;
- abrir cinco frentes a la vez;
- introducir arquitectura paralela innecesaria.
