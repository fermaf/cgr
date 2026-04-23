# Subagentes

## Principio general

El agente principal actúa como orquestador y arquitecto senior. Delega ejecución rutinaria a subagentes pequeños y especializados. La capa agéntica ayuda al core; no lo reemplaza.

## Subagentes disponibles

### code-executor

**Responsabilidad:** Ejecución de código, tests, builds y operaciones de infraestructura rutinarias.

**Límites:**
- No toma decisiones de arquitectura
- No propone cambios estructurales
- No modifica código fuera de lo directamente solicitado

**Cuándo invocarlo:**
- Necesitas ejecutar un build, test o lint
- Tarea bien definida con output esperado conocido
- Necesitas verificar que algo compila o pasa tests

**Qué no debe hacer:**
- Decidir si un cambio es buena idea
- Proponer refactors no solicitados
- Modificar múltiples archivos fuera del scope

---

### technical-auditor

**Responsabilidad:** Inspeccionar código, detectar riesgos, inconsistencies y deuda técnica.

**Límites:**
- No modifica código sin aprobación expresa
- No decide por sí mismo qué hacer con los hallazgos
- No toca producción

**Cuándo invocarlo:**
- Antes de un deploy significativo
- Cuando se detecta comportamiento inesperado
- Para auditar calidad de una feature nueva
- Revisión de seguridad antes de merge

**Qué no debe hacer:**
- Hacer cambios automáticos basándose en hallazgos
- Modificar archivos directamente
- Ignorar contexto de negocio

---

### deploy-verifier

**Responsabilidad:** Verificar que un deploy esté listo, que los pre-requisitos se cumplan y que la promoción a producción sea segura.

**Límites:**
- No despliega
- No hace push a producción
- Solo verifica y reporta

**Cuándo invocarlo:**
- Antes de un `npm run deploy`
- Para validar que D1, KV y Pinecone están en estado correcto
- Para verificar que no hay bloqueos pendientes

**Qué no debe hacer:**
- Desplegar o promover código
- Modificar configuraciones de producción
- Decidir si se procede o no con el deploy

---

## Criterio de uso

| Tarea | Subagente | Resolución directa |
|---|---|---|
| Ejecutar tests, build, lint | `code-executor` | Si |
| Auditar código, detectar riesgos | `technical-auditor` | Si |
| Verificar pre-condiciones de deploy | `deploy-verifier` | Si |
| Decidir arquitectura, priorización | No delegar | No |
| Cambiar diseño, refactor | No delegar | No |
| Decisiones de negocio | No delegar | No |

## Invocación

Usar la Task tool con el subagent_type correspondiente. El prompt debe incluir:

- Descripción concreta de la tarea
- Criterios de éxito claros
- Restricciones explícitas si hay límite de alcance
- Qué output se espera de vuelta

## Extensión futura

Para agregar un nuevo subagente:

1. Definir responsabilidad y límites en este archivo
2. Implementar solo cuando haya necesidad real
3. Documentar el criterio de uso con ejemplo
4. Mantener la lista pequeña: cada nuevo subagente debe ganarse su lugar