# Documentación CGR.ai

Esta carpeta concentra la documentación funcional, técnica y operativa del sistema.

## Cómo usar esta documentación

Ruta recomendada para nuevos integrantes:

1. Leer [01_negocio_y_estrategia.md](./01_negocio_y_estrategia.md)
2. Entender [02_arquitectura.md](./02_arquitectura.md)
3. Preparar entorno con [03_guia_desarrollo.md](./03_guia_desarrollo.md)
4. Operar producción con [04_operacion_y_mantenimiento.md](./04_operacion_y_mantenimiento.md)

## Índice

| # | Documento | Propósito |
|---|---|---|
| 01 | [Negocio y Estrategia](./01_negocio_y_estrategia.md) | Contexto del producto y valor público |
| 02 | [Arquitectura](./02_arquitectura.md) | Diseño técnico y flujos de datos |
| 03 | [Guía de Desarrollo](./03_guia_desarrollo.md) | Onboarding, entorno local, estándares |
| 04 | [Operación y Mantenimiento](./04_operacion_y_mantenimiento.md) | Runbooks, endpoints, troubleshooting real |
| 05 | [Manual de Usuario](./05_manual_usuario.md) | Uso funcional del frontend |
| 06 | [Feedback y Roadmap](./06_feedback_y_roadmap.md) | Deuda técnica y evolución |
| 07 | [Auditoría de llaves KV](./07_auditoria_llaves_kv.md) | Historial de saneamiento de claves |
| 08 | [Ingeniería inversa API CGR](./08_ingenieria_inversa_api_cgr.md) | Detalles de integración con CGR |
| 09 | [Guía avanzada API CGR](./09_guia_uso_avanzado_api_CGR.md) | Filtros y consultas avanzadas |
| 11 | [ToDo Frontend](./11_ToDo_servicio_frontend.md) | Plan de evolución UI/UX |
| 99 | [Briefing Agente Experto](./99_briefing_agente_experto.md) | Contexto operativo para agentes LLM |

## Convenciones de verdad

- Fuente primaria de comportamiento: `cgr-platform/src` y `frontend/src`.
- Fuente primaria de estado productivo: comandos `wrangler ... --remote`.
- Si hay discrepancia entre documento y código, prevalece el código.
- Si hay discrepancia entre documento y producción, prevalece producción.

## Actualizaciones mínimas exigidas

Cada cambio relevante en backend debe reflejarse en:

- este índice (si agrega o retira documentos)
- [03_guia_desarrollo.md](./03_guia_desarrollo.md) (si cambia forma de desarrollar)
- [04_operacion_y_mantenimiento.md](./04_operacion_y_mantenimiento.md) (si cambia forma de operar)
