import { mkdir, readFile, writeFile } from "node:fs/promises";

const BASE_URL = process.env.BASE_URL || "https://cgr-platform.abogado.workers.dev";
const QUERIES_PATH = new URL("../docs/evaluation/canonical_queries.json", import.meta.url);
const OUTPUT_PATH = new URL("../docs/analysis/possible_missing_relations.json", import.meta.url);

const MAX_LINES_PER_QUERY = 4;
const MAX_CANDIDATES = 120;
const FETCH_TIMEOUT_MS = 8000;

const ACTIVE_GRAPH_STATUSES = new Set(["criterio_en_evolucion", "criterio_en_revision"]);
const LIKELY_RESTRICTIVE_TERMS = [
  "excepto",
  "salvo",
  "solo",
  "únicamente",
  "unicamente",
  "siempre que",
  "a menos que",
  "distinto",
  "difiere",
  "distingue",
  "condición",
  "condicion",
  "restringe",
  "limita",
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return [...new Set(
    normalizeText(value)
      .split(/[^a-z0-9]+/g)
      .map((item) => item.trim())
      .filter((item) => item.length >= 4)
  )];
}

function simpleDate(value) {
  const match = String(value || "").match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function dateTs(value) {
  const ts = Date.parse(value || "");
  return Number.isFinite(ts) ? ts : 0;
}

function overlapRatio(left, right) {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  const shared = left.filter((item) => rightSet.has(item));
  return shared.length / Math.max(new Set([...left, ...right]).size, 1);
}

function pickTopNormKeys(fuentes) {
  const counts = new Map();
  for (const fuente of fuentes || []) {
    const tipo = normalizeText(fuente.tipo_norma);
    const numero = normalizeText(fuente.numero);
    const articulo = normalizeText(fuente.articulo);
    if (!tipo) continue;
    const base = numero ? `${tipo}:${numero}` : tipo;
    const key = articulo ? `${base}:art:${articulo}` : base;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([value]) => value);
}

function relationIndex(detail) {
  const meta = detail?.meta || {};
  const outbound = new Set((meta.relaciones_efecto || []).map((row) => row.destino_id || row.dictamen_relacionado_id));
  const inbound = new Set((meta.relaciones_causa || []).map((row) => row.origen_id || row.dictamen_relacionado_id));
  return { outbound, inbound };
}

function classifySuggestedRelation(params) {
  if (params.hasRestrictiveShift && params.normativeDelta) return "reconsiderado_parcialmente";
  if (params.semanticDelta >= 2 && params.normativeDelta) return "complementado";
  if (params.semanticDelta >= 1) return "aclarado";
  return "complementado";
}

function buildSemanticReason(params) {
  const parts = [];
  parts.push(`Ambos dictámenes aparecen dentro de la línea "${params.lineTitle}"`);
  if (params.sharedDescriptors.length > 0) {
    parts.push(`comparten descriptores como ${params.sharedDescriptors.slice(0, 3).join(", ")}`);
  }
  if (params.newDescriptors.length > 0) {
    parts.push(`el dictamen posterior agrega ${params.newDescriptors.slice(0, 3).join(", ")}`);
  }
  if (params.hasRestrictiveShift) {
    parts.push("el análisis posterior introduce condiciones o distinciones de alcance");
  }
  return parts.join("; ") + ".";
}

function buildNormReason(params) {
  if (params.sharedNorms.length === 0 && params.newNorms.length === 0) {
    return "No hay una señal normativa fuerte; la hipótesis se apoya principalmente en cercanía temática dentro de la misma línea.";
  }
  const parts = [];
  if (params.sharedNorms.length > 0) {
    parts.push(`ambos remiten a ${params.sharedNorms.slice(0, 2).join(", ")}`);
  }
  if (params.newNorms.length > 0) {
    parts.push(`el dictamen posterior introduce ${params.newNorms.slice(0, 2).join(", ")}`);
  }
  return parts.join("; ") + ".";
}

function confidenceLabel(score) {
  if (score >= 0.78) return "alta";
  if (score >= 0.6) return "media";
  return "baja";
}

async function getJson(pathname, params) {
  const url = new URL(pathname, BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const response = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url.toString()}`);
  }
  return response.json();
}

const queries = JSON.parse(await readFile(QUERIES_PATH, "utf8"));
const detailCache = new Map();
const lineMap = new Map();
const debugCounters = {
  totalPairs: 0,
  skippedExistingRelation: 0,
  skippedLowOverlap: 0,
  skippedNoSignal: 0,
  missingDetail: 0,
};

for (const query of queries) {
  const payload = await getJson("/api/v1/insights/doctrine-search", { q: query, limit: MAX_LINES_PER_QUERY });
  for (const line of payload.lines || []) {
    const status = line.graph_doctrinal_status?.status;
    if (!ACTIVE_GRAPH_STATUSES.has(status)) continue;
    const keyIds = (line.key_dictamenes || []).map((item) => item.id).filter(Boolean);
    if (keyIds.length < 2) continue;
    const signature = JSON.stringify({
      title: line.title,
      ids: [...keyIds].sort(),
    });
    const existing = lineMap.get(signature);
    if (existing) {
      existing.queries.add(query);
      continue;
    }
    lineMap.set(signature, {
      title: line.title,
      status,
      queries: new Set([query]),
      keyIds,
      keyDictamenes: line.key_dictamenes || [],
      semanticAnchor: line.semantic_anchor_dictamen?.id || null,
      representative: line.representative_dictamen_id || null,
      topDescriptors: line.top_descriptores_AI || [],
      topNorms: (line.top_fuentes_legales || []).map((f) => `${f.tipo_norma || ""} ${f.numero || ""}`.trim()).filter(Boolean),
    });
  }
}

const uniqueIds = [...new Set([...lineMap.values()].flatMap((line) => line.keyIds.slice(0, 5)))];
for (const id of uniqueIds) {
  try {
    const detail = await getJson(`/api/v1/dictamenes/${id}`);
    detailCache.set(id, detail);
  } catch (error) {
    console.error(`[warn] detail fetch failed for ${id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const candidates = [];

for (const line of lineMap.values()) {
  const detailed = line.keyIds
    .map((id) => {
      const detail = detailCache.get(id);
      if (!detail) {
        debugCounters.missingDetail += 1;
        return null;
      }
      const meta = detail?.meta || {};
      const enrichment = detail?.extrae_jurisprudencia || {};
      return {
        id,
        fecha: simpleDate(meta?.fecha_documento || meta?.fecha || ""),
        fechaTs: dateTs(meta?.fecha_documento || meta?.fecha || ""),
        titulo: enrichment.titulo || meta?.materia || "",
        analisis: enrichment.analisis || detail?.analisis || "",
        descriptores: (enrichment.etiquetas || detail?.descriptores_AI || []).map((item) => String(item).trim()).filter(Boolean),
        fuentes: meta?.fuentes_legales || [],
        relations: relationIndex(detail || {}),
      };
    })
    .filter(Boolean)
    .filter((item) => item.fechaTs > 0)
    .sort((a, b) => a.fechaTs - b.fechaTs || a.id.localeCompare(b.id));

  for (let i = 0; i < detailed.length; i += 1) {
    for (let j = i + 1; j < detailed.length; j += 1) {
      const earlier = detailed[i];
      const later = detailed[j];
      debugCounters.totalPairs += 1;

      if (later.relations.outbound.has(earlier.id) || earlier.relations.inbound.has(later.id)) {
        debugCounters.skippedExistingRelation += 1;
        continue;
      }

      const earlierDescriptors = earlier.descriptores.map(normalizeText).filter(Boolean);
      const laterDescriptors = later.descriptores.map(normalizeText).filter(Boolean);
      const sharedDescriptors = laterDescriptors.filter((item) => new Set(earlierDescriptors).has(item));
      const newDescriptors = laterDescriptors.filter((item) => !new Set(earlierDescriptors).has(item));
      const descriptorOverlap = overlapRatio(earlierDescriptors, laterDescriptors);

      const earlierTextTokens = tokenize([earlier.titulo, earlier.analisis, ...earlier.descriptores].join(" "));
      const laterTextTokens = tokenize([later.titulo, later.analisis, ...later.descriptores].join(" "));
      const sharedTextTokens = laterTextTokens.filter((item) => new Set(earlierTextTokens).has(item));
      const newTextTokens = laterTextTokens.filter((item) => !new Set(earlierTextTokens).has(item));
      const textOverlap = overlapRatio(earlierTextTokens, laterTextTokens);

      const earlierNorms = pickTopNormKeys(earlier.fuentes);
      const laterNorms = pickTopNormKeys(later.fuentes);
      const sharedNorms = laterNorms.filter((item) => new Set(earlierNorms).has(item));
      const newNorms = laterNorms.filter((item) => !new Set(earlierNorms).has(item));
      const normOverlap = overlapRatio(earlierNorms, laterNorms);

      const laterAnalysis = normalizeText(later.analisis);
      const hasRestrictiveShift = LIKELY_RESTRICTIVE_TERMS.some((term) => laterAnalysis.includes(term));
      const semanticDelta = Math.max(newDescriptors.length, Math.min(newTextTokens.length, 3)) + (hasRestrictiveShift ? 1 : 0);
      const normativeDelta = newNorms.length > 0;

      const sameAnchorFamily = line.semanticAnchor === later.id || line.semanticAnchor === earlier.id || line.representative === later.id || line.representative === earlier.id;
      const confidenceScore = (
        (descriptorOverlap * 0.45)
        + (textOverlap * 0.35)
        + (normOverlap * 0.25)
        + (sameAnchorFamily ? 0.1 : 0)
        + (semanticDelta > 0 ? 0.1 : 0)
        + (normativeDelta ? 0.05 : 0)
        + (line.status === "criterio_en_revision" ? 0.08 : 0.04)
      );

      if (descriptorOverlap < 0.1 && textOverlap < 0.12 && normOverlap < 0.1) {
        debugCounters.skippedLowOverlap += 1;
        continue;
      }
      if (semanticDelta === 0 && !normativeDelta && !sameAnchorFamily) {
        debugCounters.skippedNoSignal += 1;
        continue;
      }

      const tipo = classifySuggestedRelation({
        hasRestrictiveShift,
        normativeDelta,
        semanticDelta,
      });

      candidates.push({
        dictamen_origen: later.id,
        dictamen_destino: earlier.id,
        tipo_relacion_sugerida: tipo,
        nivel_confianza: confidenceLabel(confidenceScore),
        confidence_score: Number(confidenceScore.toFixed(2)),
        razon_semantica: buildSemanticReason({
          lineTitle: line.title,
          sharedDescriptors: sharedDescriptors.length > 0 ? sharedDescriptors : sharedTextTokens,
          newDescriptors: newDescriptors.length > 0 ? newDescriptors : newTextTokens,
          hasRestrictiveShift,
        }),
        razon_normativa: buildNormReason({
          sharedNorms,
          newNorms,
        }),
        line_title: line.title,
        line_status: line.status,
        source_queries: [...line.queries],
      });
    }
  }
}

const prioritized = candidates
  .sort((a, b) =>
    b.confidence_score - a.confidence_score
    || a.line_title.localeCompare(b.line_title)
    || a.dictamen_origen.localeCompare(b.dictamen_origen)
  )
  .slice(0, MAX_CANDIDATES);

await mkdir(new URL("../docs/analysis/", import.meta.url), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(prioritized, null, 2) + "\n", "utf8");

console.log(JSON.stringify({
  total_lines_considered: lineMap.size,
  unique_dictamenes_considered: uniqueIds.length,
  candidates_generated: prioritized.length,
  debug: debugCounters,
  output: OUTPUT_PATH.pathname,
  sample: prioritized.slice(0, 5),
}, null, 2));
