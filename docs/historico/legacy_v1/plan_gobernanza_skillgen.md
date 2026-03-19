# Plan de Trabajo: Gobernanza de Skillgen (El Libro de Novedades)

## 1. Visión Ejecutiva y Rol de Skillgen
La visión estratégica para Skillgen evoluciona de ser un simple "Log de Errores" (receptor de fallos tipo HTTP 500) a convertirse en el administrador central de los eventos de crecimiento y cambio en el ecosistema de datos. Bajo esta filosofía del "Librero", Skillgen firma el acta cada vez que se detecta algo nuevo en la bodega de datos. 

El objetivo primordial es proveer visibilidad sobre el vasto conjunto de registros (ej. 86,000 dictámenes), destacando únicamente las "novedades diarias" (hallazgos de gobernanza) sin requerir inspección manual masiva.

## 2. Eventos de Gobernanza a Auditar
Se han detectado cuatro hitos clave que Skillgen debe capturar:

### A. Expansión de Catálogo (`CATALOG_AUTO_EXPANSION`)
*   **Contexto:** Cuando la función `getOrInsertDivisionId` o similares encuentran una sigla/categoría nueva (ej. "DPA").
*   **Auditoría:** En lugar de una inserción silenciosa en la base de datos relacional (D1), Skillgen registra un evento claro: *"El sistema detectó 'DPA'; se creó la categoría automática ID [X] provocada por el Dictamen [ID]"*.

### B. Descubrimiento de Entidades (`NEW_ENTITY_DETECTED`)
*   **Contexto:** Un nuevo abogado, firmante o entidad aparece en los campos de extracción (ej. `_source.abogados`, `_source.firmantes`).
*   **Auditoría:** Permite detectar variaciones de nombres (ej. *J. Perez* vs *Juan Perez*) alertando proactivamente antes de que ensucien las analíticas globales.

### C. Alerta de Estructura / Schema Drift (`DATA_STRUCTURE_ANOMALY`)
*   **Contexto:** El Crawler recibe un JSON de CGR con campos nuevos, tipos de datos inesperados, o nombres de atributos que han mutado (ej. de `caracter` a `caracter_nuevo`).
*   **Auditoría:** Skillgen genera una alerta proactiva indicando el cambio en el esquema para que el código (tipos o lógica de extracción) se ajuste a tiempo, mitigando el riesgo de pérdida masiva de datos por error de mapeo.

### D. Auditoría de Juicio IA (`AI_LOW_CONFIDENCE`)
*   **Contexto:** Cuando el modelo de lenguaje (ej. Mistral 2512) infiere metadatos importantes (como marcar un dictamen "Relevante" o extraer un tema complejo) pero con un score de confianza (*confidence score*) bajo.
*   **Auditoría:** Se crea una tarea automática en el Dashboard de Skillgen para que un supervisor humano valide la decisión limítrofe de la IA.

## 3. Arquitectura Requerida vs. Actual

### Lo que ya tenemos:
*   Un sistema persistente de incidentes robusto basado en **D1**.
*   Una función `persistIncident` (en `src/storage/incident_d1.ts`) plenamente operativa para enrutar los eventos desde los Workers.
*   Lógica de mapeo dinámico y resolución en los catálogos.

### Lo que falta desarrollar (Plan de Acción):
1.  **Ampliación del Esquema de Tipos (Event Types):**
    *   Modificar el sistema de normalización de incidentes (`src/lib/incident.ts` y tipos base) para aceptar "Notificaciones de Gobernanza" adicionales a los "Errores Críticos". Integrar los 4 tipos de eventos mencionados.
2.  **Flujo de Persistencia Especializada:**
    *   Ajustar `persistIncident` o crear un wrapper específico (ej. `persistGovernanceEvent`) para que estas "novedades" sean tipificadas y priorizadas correctamente. Deben almacenarse de forma que no se mezclen ni saturen la bandeja de errores fatales e infraestructura.
3.  **Dashboard Visual (Feed de Novedades):**
    *   Crear una sección dedicada en el panel de Administración (Admin Dashboard UI).
    *   Este espacio consumirá específicamente los eventos de gobernanza, presentándolos como un *feed* cronológico, amigable y accionable.
4.  **Sistema de Notificaciones / Alertas Dinámicas:**
    *   Construir la capacidad de que Skillgen genere y envíe un resumen estructurado (diario o al finalizar un lote de ingesta grande) destacando los "Hallazgos de Gobernanza".

## 4. Próximos Pasos Recomendados (Por Definir con el Usuario)
*   **Opción 1:** Comenzar definiendo los nuevos tipos en el código (`types.ts`, `incident.ts`) y adaptar la función base para que separe Novedades vs Errores fatales.
*   **Opción 2:** Desplegar primero el diseño o la vista del "Dashboard de Novedades" usando datos mockeados para visualizar la interfaz resultante.
*   **Opción 3:** Inyectar directamente el disparo de un evento específico (como `CATALOG_AUTO_EXPANSION`) en `getOrInsertDivisionId` para trazar el flujo end-to-end con un caso de uso real.