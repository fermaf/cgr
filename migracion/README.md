# CGR Data Migration Sync: MongoDB to Cloudflare (Turbo Mode)

## 📌 Contexto
Este proyecto implementa un motor de migración de alto rendimiento para trasladar **84,973 dictámenes** (1.2GB de datos) desde volcados de MongoDB (`@mongoBackup`) hacia la infraestructura Serverless de **Cloudflare**.

El sistema no solo traslada datos, sino que los transforma de un esquema documental desestructurado a un modelo **Relacional Normalizado de 13 tablas** en **Cloudflare D1**, manteniendo una réplica de acceso rápido en **Cloudflare KV**.

## 🚀 Características Principales
- **Turbo Feeder**: Alimentador Node.js con pool de concurrencia (25 hilos) que satura el ingreso a la nube, optimizando el tiempo de carga.
- **AI Enrichment Integration**: El sistema consume datos previamente procesados por IA almacenados en el KV `DICTAMENES_PASO`. Estos registros enriquecidos (que incluyen títulos generados, resúmenes y análisis jurídico) se catalogan automáticamente en las tablas relacionales de D1 durante la migración.
- **Large Payload Overflow**: Sistema inteligente de desbordamiento que utiliza KV para procesar registros que exceden los 128KB de Cloudflare Queues.
- **Modelo Relacional (13 Tablas)**: Esquema SQL profesional con catálogos de abogados, divisiones, descriptores e historia de cambios.
- **Auditoría de Integridad**: Herramientas de reconciliación (`audit_missing.ts`) para garantizar que el 100% de los datos lleguen a su destino.

## � Muestras de Datos (Ejemplos Reales)
Se han extraído muestras de 33 registros de cada archivo de backup para referencia conceptual y técnica:
- [`sample_source_33.json`](samples/sample_source_33.json): Ejemplo de datos crudos (Source).
- [`sample_paso_33.json`](samples/sample_paso_33.json): Ejemplo de datos enriquecidos con IA (Paso), que incluye el análisis conceptual.

## �🛠️ Estructura del Proyecto
- `/src/index.ts`: Cloudflare Worker (Productor/Consumidor) con lógica de desbordamiento y mapeo D1.
- `/scripts/feeder.ts`: El motor de ingesta masiva (Turbo Mode).
- `/scripts/audit_missing.ts`: Herramienta de auditoría y reconciliación.
- `/scripts/test_feeder.ts`: Script de validación rápida (humo).

## 📄 Documentación Completa
- [📘 Arquitectura](ARCHITECTURE.md): Diagramas de flujo y stack tecnológico.
- [📙 Documento de Diseño](DESIGN_DOCUMENT.md): Detalle del esquema de 13 tablas y decisiones técnicas.
- [📖 Manual de Usuario](MANUAL_USUARIO.md): Guía paso a paso para despliegue y operación.
- [📝 Plan Detallado](PLAN_DETALLADO.md): Registro final de la ejecución.

## ⚙️ Instalación Rápida
1. Instalar dependencias: `npm install`
2. Desplegar Worker: `wrangler deploy`
3. Iniciar Migración: `npx tsx scripts/feeder.ts`

---
*Desarrollado para la CGR - 2026*
