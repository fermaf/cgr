# 📚 El Librero: Índice Maestro de Documentación (v2.0)

Bienvenido al centro de conocimiento de **CGR-Platform**. Esta documentación ha sido diseñada bajo el estándar de **El Librero**: técnica, exhaustiva, experta y siempre alineada con el código fuente.

---

## 🗺️ Mapa de Navegación (Diátaxis)

## 🗺️ Mapa de Navegación (Diátaxis)

### 🚀 [Tutoriales y Contexto Base](tutoriales/)
- **[00 - Guía de Estándares para Agentes LLM (El Librero)](00_guia_estandares_agentes_llm.md)**: El **CONTEXTO PRINCIPAL Y ÚNICO** de entrada para agentes autónomos. Define las reglas de interacción y arquitectura base.
- **[01 - Onboarding para Desarrolladores (Local)](tutoriales/01_onboarding_desarrollador_local.md)**: Configura tu Worker localmente con Wrangler y entiende el código fuente.
- **[02 - Tu Primer Skill (Gobernanza)](tutoriales/02_creando_tu_primer_skill.md)**: Cómo utilizar `Skillgen` para atrapar, normalizar y reportar incidentes en tu nuevo código.
- **[03 - Guía de Desarrollo Avanzada](tutoriales/03_guia_desarrollo_avanzada.md)**: Patrones críticos de programación para Workflows y archivos de incidentes pasados.

### 🛠️ [Guías de Tareas](guias_tareas/)
- **[01 - Operación de Workflows y Backfill](guias_tareas/01_operacion_workflows_y_backfill.md)**: Manejo de la recursividad del backfill y cómo forzar una "re-ingesta" (`/ingest/trigger`).
- **[02 - Reparación y Reprocesamiento de Nulos](guias_tareas/02_reparacion_y_reprocesamiento.md)**: Procedimiento para limpiar deuda técnica (`old_url`, `division_id`) usando Queues.
- **[03 - Monitoreo y Operaciones](guias_tareas/03_monitoreo_y_operaciones.md)**: Manual del administrador. Crons, resolución de problemas comunes en el Dashboard y Cache.
- **[04 - Entornos, Despliegue y Drift](guias_tareas/04_entornos_y_despliegue.md)**: Peligros de BBDD compartidas, comandos para Staging vs Producción y control de secretos.

### 🧠 [Explicación](explicacion/)
- **[01 - Arquitectura C4 y Flujos](explicacion/01_arquitectura_c4_y_flujos.md)**: Diagramas técnicos de contenedores, componentes y ciclos de vida de los datos (Ingest -> Enrich -> Vectorize).
- **[02 - Visión Ejecutiva y ROI](explicacion/02_vision_ejecutiva.md)**: Propuesta de valor, objetivos estratégicos y retorno de inversión de CGR.ai.
- **[03 - Estrategia de Inferencia AI (Mistral)](explicacion/03_analisis_mistral_y_prompts.md)**: Por qué el Mega-Prompt Consolidado V5 triunfa sobre el enfoque secuencial en Edge. Relación con Metadata V2 Pinecone.
- **[04 - Gobernanza y Estratigrafía de Datos](explicacion/04_gobernanza_y_estrategia.md)**: El modelo de capas (Bronce->Paso), y los algoritmos LIFO y normalización de IDs de CGR.
- **[05 - Roadmap Estratégico (2026-2027)](explicacion/05_roadmap_estrategico.md)**: Extensión conceptual hacia un "Buscador Analítico" y un Worker Predictivo de Compliance.
- **[06 - Arquitectura de Relaciones Jurídicas (Retro-Update)](explicacion/06_arquitectura_relaciones_juridicas.md)**: El Dependency Graph que sincroniza el ecosistema D1/KV/Pinecone.
- **[07 - Modelo Canónico de Relaciones entre Dictámenes](explicacion/07_modelo_canonico_relaciones_dictamenes.md)**: Propuesta evidence-first para separar evidencia, afirmaciones y proyecciones doctrinales.

### 📖 [Referencia](referencia/)
- **[01 - Referencia de API Completa](referencia/01_referencia_api_completa.md)**: Detalle técnico de todos los endpoints, parámetros y comandos CURL didácticos (Base y Avanzados).
- **[02 - Diccionario de Variables y Entorno](referencia/03_diccionario_variables_entorno.md)**: Configuración total de `wrangler.jsonc` y explicación de todos los secretos administrativos.
- **[04 - Manual de Usuario Frontend](referencia/04_manual_usuario_frontend.md)**: Explicación para usuarios analistas sobre los badges semánticos, búsqueda literal e Inteligencia Artificial en la interfaz web.

---

## 🕰️ [Histórico y Legado](historico/)
Documentación de etapas previas conservada para fines de auditoría y trazabilidad.
- **[Legacy v1](historico/legacy_v1/)**: Documentación de la fase inicial del proyecto.
- **[Skillgen](historico/skillgen/)**: Evolución del motor de gobernanza.
- **[Etapa 1: Insumos AI](historico/etapa1_insumos_ai/)**: Prompts y outputs de modelos previos.

---

> [!TIP]
> **Source of Truth**: Si encuentras discrepancias entre esta documentación y el código en `src/`, el código prevalece. Por favor, actualiza la documentación inmediatamente siguiendo los estándares de [El Librero](00_guia_estandares_agentes_llm.md).

**Última Gran Reestructuración**: 2026-03-18 (Refactorización Diátaxis Integral)
