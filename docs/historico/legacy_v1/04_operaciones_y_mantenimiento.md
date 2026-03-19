# 04 - Operación y Mantenimiento: Manual del Administrador

Este manual detalla los procedimientos para la operación, monitoreo y resolución de problemas en el ecosistema **CGR-Platform**. Está diseñado para ingenieros de plataforma que necesitan asegurar la continuidad del servicio y la integridad del Gold Standard (v2).

---

## 📅 Automatización y Orquestación

### Programación de Crons
El sistema cuenta con un trigger programado en `wrangler.jsonc` que dispara el `IngestWorkflow` diariamente.
- **Horario**: `05 3 * * *` (3:05 AM hora servidor, ajustado para procesar dictámenes del día anterior publicados en la madrugada).
- **Lógica**: Utiliza el parámetro `lookbackDays` (definido en variables de entorno, default: 3) para asegurar que no se pierdan dictámenes por fallas en la red de la CGR.

### Gestión de Workflows (Deep Dive)
Cada instancia de Workflow puede monitorearse desde el dashboard de Cloudflare:
- **IngestWorkflow**: Escaneo y carga inicial.
- **BackfillWorkflow**: Procesamiento pesado con LLM. Implementa **Batching** para evitar timeouts de CPU (50 registros por lote con 500ms de retardo).
- **Control de Estado**: Si un Workflow falla, mantiene el estado de los pasos completados (`step.do`), lo que permite que el reintento continúe exactamente donde se detuvo sin duplicar costos de IA.

---

## 🛡 Gobernanza Determinista: El Sistema de Skills

Cuando ocurre una excepción en un proceso crítico, el sistema activa el **Clasificador de Incidentes**. No es un simple log de errores; es un sistema de soporte a la decisión.

### 1. El Ciclo de Vida del Incidente
1. **Captura**: `lib/incident.ts` captura el error y le asigna un `IncidentSeverity` (LOW, MEDIUM, HIGH, CRITICAL).
2. **Ruteo**: `lib/incidentRouter.ts` compara el error contra patrones conocidos (ej: `D1_ERROR`, `MISTRAL_OFFLINE`).
3. **Ejecución de Skill**: Se invoca una función de diagnóstico.
4. **Persistencia SQL**: Los resultados se guardan en la tabla `skill_events` para análisis post-mortem.

### 2. Catálogo de Skills Actuales
Para una comprensión profunda de cómo el sistema diagnostica y recupera errores, consulta los siguientes recursos de **Skillgen**:
- **[Manual de Skillgen](file:///home/fermaf/github/cgr/docs/skillgen/README.md)**: Visión general del motor.
- **[Runbook de Producción](file:///home/fermaf/github/cgr/docs/skillgen/41_runbook_etapa1_produccion.md)**: Pasos críticos ante fallos en el worker.
- **[Variables de Configuración](file:///home/fermaf/github/cgr/docs/skillgen/42_config_vars_prod.md)**: Variables específicas para el motor de gobernanza.
- **[Paradigmas de Diseño](file:///home/fermaf/github/cgr/docs/skillgen/10_paradigma_a_proyecto_aislado.md)**: Filosofía determinista aplicada.

| Skill | Función de Diagnóstico |
| :--- | :--- |
| `check_env_sanity` | Verifica que todas las variables de entorno y secretos estén presentes. |
| `check_d1_schema` | Compara la estructura actual de D1 contra el `schema_prod.sql` esperado. |
| `mistral_timeout_triage` | Prueba la conectividad manual con el AI Gateway para descartar bloqueos de red. |
| `cgr_network_verify` | Realiza un `fetch` simple a la CGR para detectar si hubo cambios en su API o firewall. |

---

## 🤖 Inteligencia Artificial (Mistral AI)

El motor de enriquecimiento y análisis doctrinal de la plataforma se basa en modelos de Mistral AI.

### Modelo de Referencia Actual
- **MISTRAL_MODEL**: `mistral-large-2512` (Actualización v2.5 - Febrero 2026).
- **Justificación**: Provee una mejor adherencia a principios de derecho administrativo y razonamiento lógico superior en la extracción de jurisprudencia comparado con versiones anteriores (2411).
- **Configuración**: Se define en `wrangler.jsonc`. Cualquier cambio requiere regenerar tipos con `npx wrangler types`.

### Trazabilidad y Metadata
Cada enriquecimiento guarda el modelo utilizado en:
1. **D1**: Tabla `enriquecimiento`, columna `modelo_llm`.
2. **Pinecone**: Metadata del vector, campo `model`.

---

## 🛠 Guía de Troubleshooting Avanzado

### Problema: "Mis dictámenes no se ven en el Dashboard"
1. **Verificar Estado en D1**: Ejecuta `SELECT estado, count(*) FROM dictamenes GROUP BY estado`.
2. **Analizar Skills**: Si hay muchos en estado `ingested` pero no avanzan a `enriched`, revisa `SELECT * FROM skill_events ORDER BY created_at DESC`.
3. **Acción**: Si el error es de Mistral, revisa la cuota del Cloudflare AI Gateway.

### Problema: "Falla de Sincronización Pinecone (v1 vs v2)"
Si notas que los filtros por "materia" o "abogado" no funcionan en el frontend para dictámenes antiguos:
- **Causa**: Están en metadata v1 (formato antiguo).
- **Acción**: Ejecuta el endpoint de **Sync Vector Mass** con un límite de 100:
  ```bash
  curl -X POST "https://platform.cgr.cl/api/v1/dictamenes/sync-vector-mass" \
    -d '{"limit": 100}' -H "x-admin-token: ..."
  ```

### Problema: Atributos Nulos (old_url, division_id) que trancan Migration RAG
- **Causa**: Registros insertados antiguamente o en migraciones previas que no portaron identificadores para el front o catálogo.
- **Acción**: Ejecutar el script batch en local que hace solicitudes de parche asíncronas de manera segura (con límite reducido para evitar timeouts 502 de Cloudflare):
  ```bash
  # En el directorio cgr-platform:
  node scripts/repair_nulls.js
  ```
  El script consume internamente el endpoint `/api/v1/jobs/repair-nulls`.

---

## 📈 Monitoreo de Costos y Rendimiento
- **Analytics Engine**: El Worker envía eventos a un dataset de Analytics. Puedes consultarlo vía SQL en Cloudflare para ver el tiempo promedio de respuesta de Mistral vs Pinecone.
- **D1 Statistics**: La tabla `registro_ejecucion` (si existe en tu versión) o los logs de `skill_runs` totalizan el tiempo de ejecución y consumo de recursos por cada lote de procesamiento.
