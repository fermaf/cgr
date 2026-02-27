# 📚 Documentación CGR.ai

Bienvenido al repositorio central de inteligencia de **CGR-Platform**. Este sistema está documentado bajo la metodología **"El Librero"**: detallada, experta y didáctica.

---

## 🚀 Documentación Vigente (Oficial)

Toda la documentación operativa, técnica y de negocio actual se encuentra en el directorio **`docs/v2/platform/`**.

> [!IMPORTANT]
> **Punto de Entrada Maestro**: [**v2/platform/index.md**](v2/platform/index.md)
> 
> Si eres un desarrollador, agente LLM o auditor, este es el único índice que debes seguir para entender la arquitectura actual del sistema.

### Estructura de Navegación v2
1. **[Estrategia y Negocio](v2/platform/01_vision_ejecutiva.md)**: ¿Por qué existe CGR.ai?
2. **[Arquitectura C4](v2/platform/02_arquitectura_c4.md)**: Diagramas de flujo e ingeniería inversa de CGR.
3. **[Referencia API](v2/platform/03_referencia_api.md)**: Especificación técnica total de los 14 endpoints.
4. **[Operaciones y Mantenimiento](v2/platform/04_operaciones_y_mantenimiento.md)**: Guía de Skills y Troubleshooting.
5. **[Casos de Uso](v2/platform/05_casos_de_uso.md)**: Trazas JSON y ejemplos reales.
6. **[Gestión de Entornos](v2/platform/06_entornos_y_despliegue.md)**: Auditoría de riesgos Prod vs Staging.
7. **[Gobernanza de Datos](v2/platform/07_gobernanza_y_estratigrafia_datos.md)**: Alquimia de IDs y capas de datos.
8. **[Roadmap y Monetización](v2/platform/08_roadmap.md)**: Plan ejecutivo de explotación de grafos normativos.

> [!TIP]
> **Estado de ejecución actual del roadmap**:
> - Fase 1 implementada (analytics + snapshots + cache).
> - Fase 2 bootstrap implementada (`/api/v1/dictamenes/:id/lineage`).
> - Fase 3 pendiente.

---

## 🛠 Módulos Especializados
- **Skillgen**: [Guía de Gobernanza Determinista](skillgen/README.md)
    - Documentación sobre el diseño de Skills y orquestación de incidentes.

---

## 📂 Archivo Histórico (Legacy)
Los materiales antiguos (versiones 2024-2025) han sido depurados y movidos a:
- [**docs/historico/legacy_v1/**](historico/legacy_v1/): Documentos originales de la fase de prototipado.

---
**Fecha de última revisión mayor**: 2026-02-27
**Estándar de Calidad**: El Librero v2 (Expert Audit Ready)
