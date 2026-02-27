# CGR.ai: Plataforma de Gobernanza Documental Inteligente

CGR.ai es un ecosistema *serverless* diseñado para la ingesta, análisis jurídico y búsqueda semántica de la jurisprudencia administrativa de la **Contraloría General de la República de Chile**. 

Ejecutada integralmente sobre el borde (edge) de Cloudflare, la plataforma transforma documentos complejos en un **Activo de Datos Monetizable** mediante el uso de Inteligencia Artificial (Mistral), Bases de Datos Vectoriales (Pinecone) y Orquestación Durable (Workflows).

---

## 🏛 Estructura del Monorepo (Higiene Documental)

El repositorio está organizado como un sistema modular optimizado para el despliegue escalable:

- **[`cgr-platform/`](cgr-platform/)**: Backend productivo. Un Cloudflare Worker (Hono) que orquesta el ciclo de vida del dato (Crawl -> Enrich -> Vectorize).
- **[`frontend/`](frontend/)**: Aplicación de usuario final construida en React + Vite, desplegada en Cloudflare Pages con soporte para búsqueda semántica y literal.
- **[`docs/`](docs/)**: El cerebro del proyecto. Contribuye al estándar **"El Librero v2"**: exhaustivo, experto y auditable.
- **[`skillgen/`](skillgen/)**: Módulo de gobernanza determinista y diseño de "Skills" para el manejo de incidentes y lógica de negocio compleja.
- **[`scripts/`](scripts/)**: Utilidades de mantenimiento para D1 y disparadores de procesos batch.

---

## 🚀 Inicio Rápido para Desarrolladores

### 1. Requisitos
- Node.js & npm.
- [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/install-upgrading/) instalado globalmente.

### 2. Levantar el Backend
```bash
cd cgr-platform
npm install
npm run dev
```

### 3. Levantar el Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 📚 Documentación Maestra (El Librero v2)

Toda la inteligencia técnica y estratégica ha sido consolidada en la versión 2.

> [!IMPORTANT]
> **Punto de Entrada Maestro**: [**docs/README.md**](docs/README.md) -> [**docs/v2/platform/index.md**](docs/v2/platform/index.md)

### Atajos Estratégicos
- **[Visión Ejecutiva](docs/v2/platform/01_vision_ejecutiva.md)**: Valor de negocio y ROI.
- **[Arquitectura C4](docs/v2/platform/02_arquitectura_c4.md)**: Flujos de datos e ingeniería inversa de CGR.
- **[Referencia de API](docs/v2/platform/03_referencia_api.md)**: Guía total de los 14 endpoints productivos.
- **[Roadmap 2026-2027](docs/v2/platform/08_roadmap.md)**: Fases de explotación de grafos normativos.

> [!TIP]
> **Roadmap en ejecución (2026-02-27)**:
> - Fase 1 ejecutada: endpoints analytics + snapshots D1 + cache KV.
> - Fase 2 bootstrap ejecutada: endpoint de linaje jurisprudencial.
> - Fase 3 pendiente.

---

## 🛡 Gobernanza y Operación

La plataforma se auto-mantiene mediante procesos de **Higiene de Datos** y **Gobernanza Determinista**:
- **Workflows**: Ingesta diaria resiliente ante fallos de red o API.
- **Audit Ready**: Cada cambio en el dataset es trazable mediante la tabla `historial_cambios` en D1.
- **Integrated Inference**: Pinecone maneja la vectorización atómica evitando discrepancias entre modelos.

---
**Fecha de Actualización**: 2026-02-27  
**Estado del Repositorio**: Producción / Expert Audit Ready
