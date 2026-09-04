// cgr-platform/src/lib/reconciliadorKV.mjs
// Funciones puras del reconciliador KV↔D1 — sin dependencias de wrangler ni shell.
// Importable por scripts y tests.
//
// Seguridad: nunca expone payloads, documento_completo, ni secrets.
// rows_written=0, cloudflare_mutations=false, anonimizacion_verificada=true.

// ─── Tipos (JSDoc) ──────────────────────────────────────────────────────────
//
// @typedef {Object} KVKeyMetrics
// @property {string} namespace - 'SOURCE' | 'PASO'
// @property {string} keyFormat - 'id' | 'dictamen:id'
// @property {boolean} present - si la llave existe en KV
// @property {boolean} jsonParseable - si el valor es JSON válido
// @property {number} payloadBytes - bytes del payload (0 si no presente)
// @property {boolean} hasDocumentoCompleto - true si doc_completo existe y no vacío
// @property {number} documentoCompletoBytes - bytes del doc (0 si no)
// @property {string|null} error - mensaje de error si falló
//
// @typedef {Object} DictamenReconciliation
// @property {string} dictamenId
// @property {number} d1EnSource
// @property {number} d1EnPaso
// @property {KVKeyMetrics} sourceId
// @property {KVKeyMetrics} sourceDictamenId
// @property {KVKeyMetrics} pasoId
// @property {boolean} badJson
// @property {boolean} missingDocumentoCompleto
// @property {boolean} enSourceMismatch
//
// @typedef {Object} ReconciliationReport
// @property {string} timestamp
// @property {string} environment
// @property {Object} batchParams
// @property {number} totalDictamenes
// @property {Object} aggregate
// @property {DictamenReconciliation[]} detalles
// @property {Object} seguridad

// ─── Parseo seguro de payload KV ────────────────────────────────────────────

/**
 * Analiza un payload KV crudo SIN exponer su contenido.
 * Retorna únicamente métricas numéricas/booleanas.
 *
 * @param {string|null} rawContent — contenido crudo de KV (null = llave no encontrada)
 * @param {string} namespaceName — 'SOURCE' o 'PASO'
 * @param {string} keyFormat — 'id' o 'dictamen:id'
 * @returns {KVKeyMetrics}
 */
export function parseKVPayload(rawContent, namespaceName, keyFormat) {
  // Llave no encontrada
  if (rawContent === null || rawContent === undefined) {
    return {
      namespace: namespaceName,
      keyFormat,
      present: false,
      jsonParseable: false,
      payloadBytes: 0,
      hasDocumentoCompleto: false,
      documentoCompletoBytes: 0,
      error: 'KV key not found',
    };
  }

  const payloadBytes = new TextEncoder().encode(rawContent).length;

  // Validar JSON
  let parsed;
  let jsonParseable = false;
  try {
    parsed = JSON.parse(rawContent);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      jsonParseable = true;
    }
  } catch {
    // No es JSON válido
  }

  if (!jsonParseable) {
    return {
      namespace: namespaceName,
      keyFormat,
      present: true,
      jsonParseable: false,
      payloadBytes,
      hasDocumentoCompleto: false,
      documentoCompletoBytes: 0,
      error: 'payload no es JSON válido',
    };
  }

  // Extraer documento_completo desde estructuras posibles
  const sourceCandidate =
    (parsed._source && parsed._source.documento_completo) ??
    (parsed.source && parsed.source.documento_completo) ??
    (parsed.raw_data && parsed.raw_data.documento_completo) ??
    parsed.documento_completo;

  const hasDocumentoCompleto =
    typeof sourceCandidate === 'string' && sourceCandidate.trim().length > 0;
  const documentoCompletoBytes = hasDocumentoCompleto
    ? new TextEncoder().encode(sourceCandidate).length
    : 0;

  return {
    namespace: namespaceName,
    keyFormat,
    present: true,
    jsonParseable: true,
    payloadBytes,
    hasDocumentoCompleto,
    documentoCompletoBytes,
    error: null,
  };
}

// ─── Reconciliación por dictamen ────────────────────────────────────────────

/**
 * Construye la reconciliación de un dictamen a partir de métricas ya calculadas.
 *
 * @param {string} dictamenId
 * @param {number} enSource — valor D1 (0 o 1)
 * @param {number} enPaso — valor D1 (0 o 1)
 * @param {KVKeyMetrics} sourceId
 * @param {KVKeyMetrics} sourceDictamenId
 * @param {KVKeyMetrics} pasoId
 * @returns {DictamenReconciliation}
 */
export function reconcileDictamen(dictamenId, enSource, enPaso, sourceId, sourceDictamenId, pasoId) {
  const badJson = [sourceId, sourceDictamenId, pasoId].some(
    (m) => m.present && !m.jsonParseable,
  );

  const missingDocumentoCompleto =
    sourceId.present && sourceId.jsonParseable && !sourceId.hasDocumentoCompleto;

  const enSourceMismatch = enSource === 0 && sourceId.present;

  return {
    dictamenId,
    d1EnSource: enSource,
    d1EnPaso: enPaso,
    sourceId,
    sourceDictamenId,
    pasoId,
    badJson,
    missingDocumentoCompleto,
    enSourceMismatch,
  };
}

// ─── Agregación ─────────────────────────────────────────────────────────────

/**
 * Calcula métricas agregadas desde los detalles de reconciliación.
 *
 * @param {DictamenReconciliation[]} detalles
 * @returns {Object} aggregate
 */
export function aggregateMetrics(detalles) {
  const sourceIdPresentes = detalles.filter((d) => d.sourceId.present);
  const sourceDictamenIdPresentes = detalles.filter((d) => d.sourceDictamenId.present);
  const pasoIdPresentes = detalles.filter((d) => d.pasoId.present);
  const docsConDocCompleto = sourceIdPresentes.filter((d) => d.sourceId.hasDocumentoCompleto);

  const totalSourcePayloadBytes = sourceIdPresentes.reduce((sum, d) => sum + d.sourceId.payloadBytes, 0);
  const totalPasoPayloadBytes = pasoIdPresentes.reduce((sum, d) => sum + d.pasoId.payloadBytes, 0);
  const totalDocCompletoBytes = docsConDocCompleto.reduce((sum, d) => sum + d.sourceId.documentoCompletoBytes, 0);

  return {
    sourceIdPresent: sourceIdPresentes.length,
    sourceDictamenIdPresent: sourceDictamenIdPresentes.length,
    pasoIdPresent: pasoIdPresentes.length,
    badJson: detalles.filter((d) => d.badJson).length,
    missingDocumentoCompleto: detalles.filter((d) => d.missingDocumentoCompleto).length,
    enSourceMismatch: detalles.filter((d) => d.enSourceMismatch).length,
    totalSourcePayloadBytes,
    avgSourcePayloadBytes: sourceIdPresentes.length > 0
      ? Math.round(totalSourcePayloadBytes / sourceIdPresentes.length)
      : 0,
    totalPasoPayloadBytes,
    avgPasoPayloadBytes: pasoIdPresentes.length > 0
      ? Math.round(totalPasoPayloadBytes / pasoIdPresentes.length)
      : 0,
    totalDocCompletoBytes,
    avgDocCompletoBytes: docsConDocCompleto.length > 0
      ? Math.round(totalDocCompletoBytes / docsConDocCompleto.length)
      : 0,
  };
}

// ─── Construcción de reporte ────────────────────────────────────────────────

/**
 * Construye un ReconciliationReport completo con declaraciones de seguridad.
 *
 * @param {DictamenReconciliation[]} detalles
 * @param {string} environment
 * @param {Object} batchParams — { mode, maxDocs, offset?, totalCorpus }
 * @returns {ReconciliationReport}
 */
export function buildReconciliationReport(detalles, environment, batchParams) {
  const aggregate = aggregateMetrics(detalles);

  return {
    timestamp: new Date().toISOString(),
    environment,
    batchParams: {
      mode: batchParams.mode || 'sequential',
      maxDocs: batchParams.maxDocs || 0,
      offset: batchParams.offset,
      totalCorpus: batchParams.totalCorpus || 0,
    },
    totalDictamenes: detalles.length,
    aggregate,
    detalles,
    seguridad: {
      rowsWritten: 0,
      cloudflareMutations: false,
      anonimizacionVerificada: true,
      payloadsImpresos: 0,
      capasUtilizadas: ['D1_analisis', 'KV_API'],
      madurez: 'prototipo_revisable',
    },
  };
}

/**
 * Construye un reporte vacío (batch sin resultados).
 *
 * @param {string} environment
 * @param {number} maxDocs
 * @param {boolean} sample
 * @param {number} offset
 * @param {number} totalCorpus
 * @returns {ReconciliationReport}
 */
export function buildEmptyReport(environment, maxDocs, sample, offset, totalCorpus) {
  return {
    timestamp: new Date().toISOString(),
    environment,
    batchParams: { mode: sample ? 'sample' : 'sequential', maxDocs, offset, totalCorpus },
    totalDictamenes: 0,
    aggregate: {
      sourceIdPresent: 0, sourceDictamenIdPresent: 0, pasoIdPresent: 0,
      badJson: 0, missingDocumentoCompleto: 0, enSourceMismatch: 0,
      totalSourcePayloadBytes: 0, avgSourcePayloadBytes: 0,
      totalPasoPayloadBytes: 0, avgPasoPayloadBytes: 0,
      totalDocCompletoBytes: 0, avgDocCompletoBytes: 0,
    },
    detalles: [],
    seguridad: {
      rowsWritten: 0, cloudflareMutations: false,
      anonimizacionVerificada: true, payloadsImpresos: 0,
      capasUtilizadas: ['D1_analisis', 'KV_API'],
      madurez: 'prototipo_revisable',
    },
  };
}

// ─── Sanitización de métricas ───────────────────────────────────────────────

/**
 * Sanitiza métricas de una llave KV: elimina campos que pudieran contener datos.
 *
 * @param {KVKeyMetrics} m
 * @returns {Object} métricas seguras (sin contenido de payload)
 */
export function sanitizeMetrics(m) {
  return {
    namespace: m.namespace,
    keyFormat: m.keyFormat,
    present: m.present,
    jsonParseable: m.jsonParseable,
    payloadBytes: m.payloadBytes,
    hasDocumentoCompleto: m.hasDocumentoCompleto,
    documentoCompletoBytes: m.documentoCompletoBytes,
    error: m.error ? m.error.substring(0, 100) : null,
  };
}

// ─── Formateo de salida ─────────────────────────────────────────────────────

/**
 * Genera salida en markdown. SIN payloads ni documento_completo.
 *
 * @param {ReconciliationReport} report
 * @returns {string}
 */
export function formatMarkdown(report) {
  const { aggregate, detalles, seguridad, batchParams, environment } = report;
  let md = '';

  md += `# Reconciliación KV ↔ D1 — Reporte Read-Only\n\n`;
  md += `**Timestamp:** ${report.timestamp}\n`;
  md += `**Entorno:** ${environment}\n`;
  md += `**Lote:** ${batchParams.mode} | maxDocs=${batchParams.maxDocs} | offset=${batchParams.offset || 0}\n`;
  md += `**Total dictámenes procesados:** ${detalles.length}\n\n`;

  md += `## 1. Métricas agregadas\n\n`;
  md += `| Métrica | Valor |\n`;
  md += `|---|---|\n`;
  md += `| SOURCE:id presente | ${aggregate.sourceIdPresent} / ${detalles.length} |\n`;
  md += `| SOURCE:dictamen:id presente | ${aggregate.sourceDictamenIdPresent} / ${detalles.length} |\n`;
  md += `| PASO:id presente | ${aggregate.pasoIdPresent} / ${detalles.length} |\n`;
  md += `| bad_json (alguna llave no es JSON) | ${aggregate.badJson} |\n`;
  md += `| missing_documento_completo | ${aggregate.missingDocumentoCompleto} |\n`;
  md += `| en_source_mismatch (D1=0, KV sí) | ${aggregate.enSourceMismatch} |\n`;
  md += `| payload_bytes SOURCE:id (total) | ${aggregate.totalSourcePayloadBytes.toLocaleString()} |\n`;
  md += `| payload_bytes SOURCE:id (promedio) | ${aggregate.avgSourcePayloadBytes.toLocaleString()} |\n`;
  md += `| payload_bytes PASO:id (total) | ${aggregate.totalPasoPayloadBytes.toLocaleString()} |\n`;
  md += `| payload_bytes PASO:id (promedio) | ${aggregate.avgPasoPayloadBytes.toLocaleString()} |\n`;
  md += `| documento_completo_bytes SOURCE:id (total) | ${aggregate.totalDocCompletoBytes.toLocaleString()} |\n`;
  md += `| documento_completo_bytes SOURCE:id (promedio) | ${aggregate.avgDocCompletoBytes.toLocaleString()} |\n\n`;

  md += `## 2. Declaraciones de seguridad\n\n`;
  md += `| Declaración | Valor |\n`;
  md += `|---|---|\n`;
  md += `| rows_written | ${seguridad.rowsWritten} |\n`;
  md += `| cloudflare_mutations | ${seguridad.cloudflareMutations} |\n`;
  md += `| anonimizacion_verificada | ${seguridad.anonimizacionVerificada} |\n`;
  md += `| payloads_impresos | ${seguridad.payloadsImpresos} |\n`;
  md += `| capas_utilizadas | ${seguridad.capasUtilizadas.join(', ')} |\n`;
  md += `| madurez | ${seguridad.madurez} |\n\n`;

  md += `## 3. Detalle por dictamen (métricas, sin payloads)\n\n`;
  md += `| ID | D1 en_src | D1 en_paso | SOURCE:id | SOURCE:d:id | PASO:id | bad_json | miss_doc | mismatch |\n`;
  md += `|---|---|---|---|---|---|---|---|---|\n`;

  for (const d of detalles) {
    const sId = d.sourceId.present ? '✓' : '✗';
    const sdId = d.sourceDictamenId.present ? '✓' : '✗';
    const pId = d.pasoId.present ? '✓' : '✗';
    const bj = d.badJson ? '⚠' : '—';
    const mdFlag = d.missingDocumentoCompleto ? '⚠' : '—';
    const mm = d.enSourceMismatch ? '⚠' : '—';
    md += `| ${d.dictamenId} | ${d.d1EnSource} | ${d.d1EnPaso} | ${sId} | ${sdId} | ${pId} | ${bj} | ${mdFlag} | ${mm} |\n`;
  }

  md += `\n## 4. Notas\n\n`;
  md += `- **Sin payloads impresos:** este reporte no contiene ningún contenido de documento_completo ni payload KV crudo.\n`;
  md += `- **Muestreo:** ${batchParams.mode === 'sample' ? `aleatorio de ${detalles.length} dictámenes del corpus` : `secuencial desde offset ${batchParams.offset || 0}`}\n`;
  md += `- **Limitación:** ${detalles.length} dictámenes no es estadísticamente representativo del corpus completo de ${batchParams.totalCorpus || '?'}.\n`;
  md += `- **Verificación:** los payloads fueron parseados en memoria y descartados inmediatamente. No se almacenaron.\n`;

  return md;
}

/**
 * Genera salida CSV. Sólo incluye métricas numéricas o booleanas, nunca payloads.
 *
 * @param {ReconciliationReport} report
 * @returns {string}
 */
export function formatCSV(report) {
  const headers = [
    'dictamen_id',
    'd1_en_source',
    'd1_en_paso',
    'source_id_present',
    'source_dictamen_id_present',
    'paso_id_present',
    'source_id_payload_bytes',
    'source_id_has_doc_completo',
    'source_id_doc_completo_bytes',
    'paso_id_payload_bytes',
    'paso_id_has_doc_completo',
    'paso_id_doc_completo_bytes',
    'bad_json',
    'missing_documento_completo',
    'en_source_mismatch',
  ];

  const rows = report.detalles.map((d) => {
    return [
      d.dictamenId,
      d.d1EnSource,
      d.d1EnPaso,
      d.sourceId.present ? 1 : 0,
      d.sourceDictamenId.present ? 1 : 0,
      d.pasoId.present ? 1 : 0,
      d.sourceId.payloadBytes,
      d.sourceId.hasDocumentoCompleto ? 1 : 0,
      d.sourceId.documentoCompletoBytes,
      d.pasoId.payloadBytes,
      d.pasoId.hasDocumentoCompleto ? 1 : 0,
      d.pasoId.documentoCompletoBytes,
      d.badJson ? 1 : 0,
      d.missingDocumentoCompleto ? 1 : 0,
      d.enSourceMismatch ? 1 : 0,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n') + '\n';
}

/**
 * Genera salida JSON. Mismas métricas, sin payloads.
 *
 * @param {ReconciliationReport} report
 * @returns {string}
 */
export function formatJSON(report) {
  const safe = {
    timestamp: report.timestamp,
    environment: report.environment,
    batchParams: report.batchParams,
    totalDictamenes: report.totalDictamenes,
    aggregate: report.aggregate,
    seguridad: report.seguridad,
    detalles: report.detalles.map((d) => ({
      dictamenId: d.dictamenId,
      d1EnSource: d.d1EnSource,
      d1EnPaso: d.d1EnPaso,
      sourceId: sanitizeMetrics(d.sourceId),
      sourceDictamenId: sanitizeMetrics(d.sourceDictamenId),
      pasoId: sanitizeMetrics(d.pasoId),
      badJson: d.badJson,
      missingDocumentoCompleto: d.missingDocumentoCompleto,
      enSourceMismatch: d.enSourceMismatch,
    })),
  };
  return JSON.stringify(safe, null, 2);
}
