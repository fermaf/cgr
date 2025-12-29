# CGR · Capa de Datos + Vision de Producto

Este README es el unico insumo inicial para un agente LLM que coordinara el proyecto. No es solo contexto: es la **brujula**. Define proposito, potencial y camino. Lo que existe hoy es **capa de datos y operaciones**; lo que se debe construir es una **plataforma de alto valor** para busqueda, analisis y confianza juridica.

## 0) TL;DR (lo que se busca de verdad)

- **Producto final**: plataforma de jurisprudencia administrativa con UX premium, IA explicable y trazabilidad legal.
- **Valor**: convertir miles de dictamenes en decisiones accionables, con evidencia, contexto y alertas.
- **Capa actual**: ingesta + normalizacion + enrichment + embeddings. Es la base, no el destino.
- **Infra**: Cloudflare (Workers, D1, KV, Queues) + LLMs + Pinecone. Escalable, low-ops, state of the art.

## 1) Que hay en este repo (capa inicial, no el producto)

**Directorio principal**: `workers-cgr/` (data + pipeline)

- Worker en Cloudflare: ingesta, cola, enrichment, vectorizacion.
- D1 (SQL): catalogo de dictamenes + run_log.
- KV: RAW JSON de dictamenes + estado.
- Queue: pipeline `crawl -> enrich -> fuentes -> vectorize`.

**Otro directorio**: `mongoBackup/` (insumo historico)

- Backup local de dumps/insumos Mongo.

## 2) Estado actual (resumen operativo)

- Ingesta diaria desde CGR (cron + crawl).
- RAW en KV, metadata en D1.
- Enrichment con LLM (Mistral).
- Vectorizacion en Pinecone.
- Dashboard usado para operaciones, no para usuarios finales.

## 3) La vision: el “universo de valor agregado”

Esto es lo que el agente LLM debe construir sobre la base de datos:

- **Busqueda profunda** (keyword + semantica) con filtros potentes y resultados explicables.
- **Vista dictamen** con resumen dual (ciudadano vs tecnico), citas directas y cambios de criterio.
- **Comparadores**: dictamen vs dictamen, tema vs tema, linea de tiempo.
- **Alertas**: cambios en criterios, nuevas publicaciones relevantes, monitoreo de materias.
- **Reportes**: exportables con citas verificables (PDF/DOCX).
- **Confianza**: cada afirmacion debe apuntar al texto original y mostrar el hash canonical.
- **Personalizacion**: colecciones, notas, tags, equipos y permisos.

En corto: no es un dashboard. Es un producto con **impacto real** en decisiones legales.

## 4) Arquitectura a alto nivel (y por que es potente)

**Cloudflare como “substrato vivo”**
- Workers: ejecucion global, latencia baja, APIs sin servidores.
- D1: SQL ligero para catalogo y auditoria.
- KV: RAW inmortal (fuente de verdad).
- Queues: pipeline asincrono estable.
- Cron: ingesta diaria.

**LLMs + Vector DB**
- Mistral/otros LLMs: analisis, resumen, clasificacion.
- Pinecone: busqueda semantica de alta precision.

Esto permite: escalabilidad, baja mantencion y velocidad para construir UX rica.

## 5) Documentacion clave (leer en este orden)

1) `workers-cgr/docs/INDEX.md`
2) `workers-cgr/docs/ARCHITECTURE.md`
3) `workers-cgr/docs/DATA_MODEL.md`
4) `workers-cgr/docs/ENDPOINTS.md`
5) `workers-cgr/docs/MANUAL_OPERACION.md`
6) `workers-cgr/docs/CGR_SEARCH.md`
7) `workers-cgr/docs/TESTS_CGR.md`
8) `workers-cgr/docs/Pasos_siguientes_PRO_version.md` (vision)

## 6) Flujo de datos (simplificado)

1) **Crawl** (CGR) -> inserta/actualiza dictamen + RAW en KV.
2) **Enrich** -> genera resumen, analisis, etiquetas.
3) **Fuentes** -> estructura fuentes legales.
4) **Vectorize** -> embeddings en Pinecone.

Estado final esperado: `dictamen.estado = vectorized`.

## 7) Canonical hash (control de cambios)

- Canonico = payload ordenado y normalizado (ver `DATA_MODEL.md`).
- Se calcula con el mismo algoritmo en **Mongo import** y **CGR crawl**.
- Usado para detectar cambios y evitar reprocesos innecesarios.

## 8) Endpoints operativos (internos)

- `/stats`, `/runs`, `/dictamenes` (lectura)
- `/internal/crawl-range` (crawl manual)
- `/internal/import` y `/internal/import-mongo`
- `/internal/process`, `/internal/vectorize`, `/internal/recover`
- `/internal/backfill-canonical`, `/internal/backfill-documento-missing`

Detalles: `workers-cgr/docs/ENDPOINTS.md`

## 9) Dashboard actual (operativo)

- Pensado para mantenimiento: crawl, recover, backfills.
- No es el producto final. Es herramienta interna.

## 10) Riesgos y lecciones aprendidas

- Si el dictamen existe pero falta RAW, el crawl puede saltarlo por hash canonico. Se ajusto para reingestar cuando falta `raw_ref`.
- `run_log` puede perder detalle si no se conserva `detail_json`.
- `missing_raw` suele indicar falta de RAW en KV o inconsistencia de ingesta.

## 11) Lineamientos de producto (no negociables)

- **Trazabilidad**: cada respuesta de IA debe citar dictamen y snippet exacto.
- **Versionado**: todo analisis debe mostrar modelo + fecha.
- **Confiabilidad**: si falta evidencia, no responder.
- **Neutralidad**: no aconsejar legalmente, solo informar.
- **Claridad**: dualidad de lenguaje (tecnico vs ciudadano).

## 12) Vision y roadmap (inspiracion + plan)

Ver `workers-cgr/docs/Pasos_siguientes_PRO_version.md`. Define fases, modulos IA y entregables UX.

## 13) Como ejecutar pruebas rapidas

Ver `workers-cgr/docs/TESTS_CGR.md`.

## 14) Principio rector para el agente LLM

Tu mision: transformar esta base de datos en un **sistema de inteligencia juridica vivo**.
No es un panel interno. Es una plataforma que debe ayudar a millones a tomar decisiones correctas.

**Magia esperada**
- UX premium.
- IA explicable y confiable.
- Alertas y reportes.
- Citas verificables y auditoria.
- Acceso por roles y equipos.

La capa de datos ya existe. Ahora debes **crear el universo** encima.
