# 6. Feedback, Deudas Técnicas y Roadmap

## 6.1 Deudas Técnicas Identificadas

### Backend

| Prioridad | Deuda | Descripción |
|---|---|---|
| 🔴 Alta | **Cron no enriquece** | El cron solo hace ingesta (`ingested`). Los pendientes requieren `batch-enrich` manual. Solución: agregar llamada a `BACKFILL_WORKFLOW` en el handler `scheduled`. |
| 🔴 Alta | **Sin autenticación API** | Los endpoints POST administrativos (`re-process`, `batch-enrich`, `crawl/range`) no requieren autenticación. Cualquiera con la URL puede ejecutarlos. |
| 🟡 Media | **Sin paginación en batch-enrich** | Requiere múltiples invocaciones manuales para procesar todos los pendientes. Solución: script bash externo o GitHub Action. |
| 🟡 Media | **Duplicados en enrichment** | Cada `re-process` crea una nueva fila en `enrichment` sin eliminar la anterior. `getLatestEnrichment` siempre trae la última, pero los datos crecen. |
| 🟢 Baja | **Limpieza de legacy** | Los directorios `borrame/` y `migracion/` contaminan el repositorio. Moverlos a repos archivados. |

### Frontend

| Prioridad | Deuda | Descripción |
|---|---|---|
| 🟡 Media | **Componentes monolíticos** | `SearchResults.tsx` maneja filtros, resultados y paginación en un solo componente. Factorizar `FiltersSidebar.tsx`. |
| 🟡 Media | **Skeleton loading** | Actualmente usa spinner básico. Implementar skeleton loading para mejor percepción de velocidad. |
| 🟢 Baja | **Accesibilidad WCAG 2.1** | Algunos contrastes grises (`text-slate-500`) son bajos para lectura extendida. Subir a `text-slate-600`. |
| 🟢 Baja | **Logo institucional** | Falta isotipo/imagotipo profesional que transmita autoridad institucional + disrupción tecnológica. |

---

## 6.2 Mejoras Propuestas

### Búsqueda Mejorada
- **Full-Text Search (FTS5)**: D1 soporta FTS5 nativamente. El fallback SQL podría usar `MATCH` en lugar de `LIKE %query%` para resultados mucho más relevantes cuando Pinecone no está disponible.
- **Búsqueda por filtros combinados**: Permitir filtrar por año, materia y booleanos (`genera_jurisprudencia`, `relevante`, `boletin`) directamente en la API.
- **Caché de queries frecuentes**: Cloudflare AI Gateway ya soporta caché. Activarlo para queries repetidas a Mistral y Pinecone.

### Procesamiento Automatizado
- **Auto-enrich post-ingesta**: Que el cron lance automáticamente un `BackfillWorkflow` después de la ingesta.
- **GitHub Actions para batch masivo**: Un workflow que invoque `/batch-enrich` cada 30 minutos hasta agotar los pendientes.
- **Alertas por correo**: Notificar cuando un batch falla o cuando la cantidad de `error` supere un umbral.

### Modelo de IA
- **Evaluación de Mistral Nemo vs Large**: Para dictámenes simples, el modelo Nemo (más barato y rápido) podría ser suficiente. Evaluar calidad de extracción.
- **Prompts versionados**: Guardar la versión del prompt usado en cada enrichment para poder comparar calidad entre versiones.

### Infraestructura
- **Rate limiting en API**: Agregar middleware de rate limiting en Hono para proteger endpoints administrativos.
- **Webhook de Pinecone**: Recibir notificación cuando el upsert completa la inferencia, en lugar de asumir éxito.
- **Backup automatizado de D1**: Script periódico que exporta la base D1 para recuperación ante desastres.

---

## 6.3 Roadmap

### Fase 1 — Estabilización (Actual)
- [x] Pipeline ingesta → enrichment → vectorización funcional
- [x] Búsqueda semántica con fallback a SQL
- [x] Frontend con badges y detalle de dictamen
- [x] Cron automático cada 6 horas
- [x] Observabilidad con logs en workflows
- [ ] Procesar los ~94 dictámenes `ingested` pendientes
- [ ] Resolver los 2 dictámenes `enriched` atascados

### Fase 2 — Automatización
- [ ] Auto-enrich post-ingesta en el cron
- [ ] Autenticación en endpoints administrativos
- [ ] FTS5 como fallback mejorado
- [ ] Alertas operativas

### Fase 3 — Escala
- [ ] Crawl masivo de años históricos (2015-2024)
- [ ] Evaluación de modelos IA para optimizar costos
- [ ] Dashboard administrador con gráficos
- [ ] API pública documentada (OpenAPI/Swagger)
