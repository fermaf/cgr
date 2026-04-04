import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const DEV_VARS_PATH = path.join(ROOT, '.dev.vars');
const DATASET_PATH = path.join(ROOT, 'scripts', 'dataset.json');
const OUTPUT_JSON_PATH = path.join(ROOT, 'benchmark_doctrinal_metadata_models.json');
const OUTPUT_MD_PATH = path.join(ROOT, 'benchmark_doctrinal_metadata_models.md');
const BACKEND_URL = 'https://cgr-platform.abogado.workers.dev';
const FRONTEND_URL = 'https://cgr-jurisprudencia-frontend.pages.dev';
const OPENROUTER_TITLE = 'Indubia';
const REQUEST_TIMEOUT_MS = 45000;

const REQUIRED_FIELDS = [
  'dictamen_id',
  'rol_principal',
  'roles_secundarios',
  'estado_intervencion_cgr',
  'estado_vigencia',
  'reading_role',
  'reading_weight',
  'currentness_score',
  'historical_significance_score',
  'doctrinal_centrality_score',
  'shift_intensity_score',
  'family_eligibility_score',
  'drift_risk_score',
  'supports_state_current',
  'signals_litigious_matter',
  'signals_abstention',
  'signals_competence_closure',
  'signals_operational_rule',
  'anchor_norma_principal',
  'anchor_dictamen_referido',
  'confidence_global',
  'evidencia_resumen'
];

const ROLE_ENUM = new Set([
  'nucleo_doctrinal',
  'aplicacion',
  'aclaracion',
  'complemento',
  'ajuste',
  'limitacion',
  'desplazamiento',
  'reactivacion',
  'cierre_competencial',
  'materia_litigiosa',
  'abstencion',
  'criterio_operativo_actual',
  'hito_historico',
  'contexto_no_central'
]);

const INTERVENTION_ENUM = new Set([
  'intervencion_normal',
  'intervencion_condicionada',
  'intervencion_residual',
  'abstencion_visible',
  'materia_litigiosa',
  'sin_senal_clara'
]);

const VALIDITY_ENUM = new Set([
  'vigente_visible',
  'vigente_tensionado',
  'vigente_en_revision',
  'desplazado_parcialmente',
  'desplazado',
  'valor_historico',
  'indeterminado'
]);

const READING_ENUM = new Set([
  'entrada_semantica',
  'entrada_doctrinal',
  'estado_actual',
  'ancla_historica',
  'pivote_de_cambio',
  'soporte_contextual'
]);

const SCORE_FIELDS = [
  'reading_weight',
  'currentness_score',
  'historical_significance_score',
  'doctrinal_centrality_score',
  'shift_intensity_score',
  'family_eligibility_score',
  'drift_risk_score',
  'confidence_global'
];

const MODELS = [
  {
    id: 'mistral-large-2411',
    label: 'Mistral Large 2411',
    provider: 'mistral',
    type: 'paid_control'
  },
  {
    id: 'arcee-ai/trinity-large-preview:free',
    label: 'Arcee Trinity Large Preview Free',
    provider: 'openrouter',
    type: 'free_candidate'
  },
  {
    id: 'openai/gpt-oss-120b:free',
    label: 'OpenAI gpt-oss-120b Free',
    provider: 'openrouter',
    type: 'free_candidate'
  }
];

function parseDevVars(content) {
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    env[key.trim()] = rest.join('=').replace(/^"(.*)"$/, '$1').trim();
  }
  return env;
}

function parseCommentedSecret(content, key, label) {
  const regex = new RegExp(`^\\s*#\\s*${key}="([^"]+)"\\s*#\\s*${label}\\s*$`, 'mi');
  const match = content.match(regex);
  return match?.[1] ?? null;
}

function unique(values) {
  return [...new Set(values)];
}

function clip(value, size) {
  const text = typeof value === 'string' ? value : '';
  if (text.length <= size) return text;
  return `${text.slice(0, size)}\n[TRUNCADO PARA BENCHMARK]`;
}

function parseJsonFromText(content) {
  if (!content || typeof content !== 'string') return { parsed: null, error: 'EMPTY_CONTENT' };
  try {
    return { parsed: JSON.parse(content), error: null };
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return { parsed: JSON.parse(content.slice(start, end + 1)), error: null };
      } catch (innerError) {
        return { parsed: null, error: innerError instanceof Error ? innerError.message : String(innerError) };
      }
    }
    return { parsed: null, error: 'NO_JSON_OBJECT_FOUND' };
  }
}

function isBoolean(value) {
  return typeof value === 'boolean';
}

function isScore(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function buildPrompt(detail) {
  const incoming = Array.isArray(detail?.meta?.relaciones_causa) ? detail.meta.relaciones_causa.slice(0, 8) : [];
  const outgoing = Array.isArray(detail?.meta?.relaciones_efecto) ? detail.meta.relaciones_efecto.slice(0, 8) : [];
  const fuentes = Array.isArray(detail?.meta?.fuentes_legales) ? detail.meta.fuentes_legales.slice(0, 6) : [];
  const rawSource = detail?.raw?._source ?? detail?.raw?.source ?? detail?.raw?.raw_data ?? detail?.raw ?? {};
  const rawText = clip(
    String(rawSource.documento_completo ?? rawSource.texto_espaniol_procesado ?? rawSource.materia ?? detail?.meta?.materia ?? ''),
    14000
  );

  const input = {
    meta: {
      id: detail?.meta?.id ?? null,
      numero: detail?.meta?.numero ?? null,
      anio: detail?.meta?.anio ?? null,
      fecha_documento: detail?.meta?.fecha_documento ?? null,
      materia: detail?.meta?.materia ?? null
    },
    enrichment_existente: detail?.extrae_jurisprudencia
      ? {
          titulo: detail.extrae_jurisprudencia.titulo ?? null,
          resumen: detail.extrae_jurisprudencia.resumen ?? null,
          analisis: clip(detail.extrae_jurisprudencia.analisis ?? '', 5000),
          etiquetas: normalizeArray(detail.extrae_jurisprudencia.etiquetas)
        }
      : null,
    relaciones_causa: incoming,
    relaciones_efecto: outgoing,
    fuentes_legales: fuentes,
    raw_texto_relevante: rawText
  };

  return `Eres un abogado experto en jurisprudencia administrativa chilena.

Tu tarea es inferir metadata doctrinal OPERATIVA para un solo dictamen.
No inventes evidencia. Si la señal es débil, usa valores conservadores.
No reemplaces la búsqueda semántica; solo clasifica el rol doctrinal del dictamen.

Responde SOLO con JSON válido, sin markdown.

Enums permitidos:
- rol_principal: ${[...ROLE_ENUM].join(', ')}
- estado_intervencion_cgr: ${[...INTERVENTION_ENUM].join(', ')}
- estado_vigencia: ${[...VALIDITY_ENUM].join(', ')}
- reading_role: ${[...READING_ENUM].join(', ')}

Reglas:
- roles_secundarios debe ser un array de 0 a 4 strings del enum de roles.
- Todos los scores deben ir entre 0 y 1.
- Las señales booleanas deben ser true o false.
- evidencia_resumen debe ser breve, concreta y trazable.

JSON esperado:
{
  "dictamen_id": "string",
  "rol_principal": "enum",
  "roles_secundarios": ["enum"],
  "estado_intervencion_cgr": "enum",
  "estado_vigencia": "enum",
  "reading_role": "enum",
  "reading_weight": 0.0,
  "currentness_score": 0.0,
  "historical_significance_score": 0.0,
  "doctrinal_centrality_score": 0.0,
  "shift_intensity_score": 0.0,
  "family_eligibility_score": 0.0,
  "drift_risk_score": 0.0,
  "supports_state_current": false,
  "signals_litigious_matter": false,
  "signals_abstention": false,
  "signals_competence_closure": false,
  "signals_operational_rule": false,
  "anchor_norma_principal": "string|null",
  "anchor_dictamen_referido": "string|null",
  "confidence_global": 0.0,
  "evidencia_resumen": "string"
}

Input:
${JSON.stringify(input, null, 2)}`;
}

async function fetchDictamenDetail(id) {
  const response = await fetch(`${BACKEND_URL}/api/v1/dictamenes/${encodeURIComponent(id)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new Error(`DICTAMEN_FETCH_FAILED ${id} ${response.status}`);
  }
  return response.json();
}

async function callMistral(apiKey, prompt) {
  const startedAt = Date.now();
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'mistral-large-2411',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const payload = await response.json();
  return {
    ok: response.ok,
    status: response.status,
    latencyMs: Date.now() - startedAt,
    content: payload?.choices?.[0]?.message?.content ?? '',
    usage: payload?.usage ?? null,
    error: response.ok ? null : JSON.stringify(payload)
  };
}

async function callOpenRouter(apiKey, model, prompt) {
  const startedAt = Date.now();
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': FRONTEND_URL,
      'X-OpenRouter-Title': OPENROUTER_TITLE,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const payload = await response.json();
  return {
    ok: response.ok,
    status: response.status,
    latencyMs: Date.now() - startedAt,
    content: payload?.choices?.[0]?.message?.content ?? '',
    usage: payload?.usage ?? null,
    error: response.ok ? null : JSON.stringify(payload)
  };
}

function evaluateResponse(dictamenId, parsed) {
  const issues = [];
  const warnings = [];
  let score = 100;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      score: 0,
      issues: ['Respuesta no parseable como objeto JSON'],
      warnings,
      summary: 'JSON inválido'
    };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in parsed)) {
      issues.push(`Falta campo requerido: ${field}`);
      score -= 5;
    }
  }

  if (parsed.dictamen_id !== dictamenId) {
    issues.push(`dictamen_id no coincide con ${dictamenId}`);
    score -= 6;
  }

  if (!ROLE_ENUM.has(parsed.rol_principal)) {
    issues.push(`rol_principal inválido: ${String(parsed.rol_principal)}`);
    score -= 8;
  }
  if (!INTERVENTION_ENUM.has(parsed.estado_intervencion_cgr)) {
    issues.push(`estado_intervencion_cgr inválido: ${String(parsed.estado_intervencion_cgr)}`);
    score -= 8;
  }
  if (!VALIDITY_ENUM.has(parsed.estado_vigencia)) {
    issues.push(`estado_vigencia inválido: ${String(parsed.estado_vigencia)}`);
    score -= 8;
  }
  if (!READING_ENUM.has(parsed.reading_role)) {
    issues.push(`reading_role inválido: ${String(parsed.reading_role)}`);
    score -= 8;
  }

  const rolesSecundarios = normalizeArray(parsed.roles_secundarios);
  if (!Array.isArray(parsed.roles_secundarios)) {
    issues.push('roles_secundarios no es array');
    score -= 6;
  } else if (rolesSecundarios.some((role) => !ROLE_ENUM.has(role))) {
    issues.push('roles_secundarios contiene valores fuera del enum');
    score -= 6;
  }

  for (const field of SCORE_FIELDS) {
    if (!isScore(parsed[field])) {
      issues.push(`${field} fuera de rango [0,1]`);
      score -= 5;
    }
  }

  for (const field of [
    'supports_state_current',
    'signals_litigious_matter',
    'signals_abstention',
    'signals_competence_closure',
    'signals_operational_rule'
  ]) {
    if (!isBoolean(parsed[field])) {
      issues.push(`${field} no es boolean`);
      score -= 5;
    }
  }

  if (typeof parsed.evidencia_resumen !== 'string' || parsed.evidencia_resumen.trim().length < 20) {
    warnings.push('evidencia_resumen demasiado breve');
    score -= 4;
  }

  if (parsed.rol_principal === 'abstencion' && parsed.signals_abstention !== true) {
    issues.push('rol abstencion sin signals_abstention=true');
    score -= 7;
  }
  if (parsed.rol_principal === 'materia_litigiosa' && parsed.signals_litigious_matter !== true) {
    issues.push('rol materia_litigiosa sin signals_litigious_matter=true');
    score -= 7;
  }
  if (parsed.rol_principal === 'cierre_competencial' && parsed.signals_competence_closure !== true) {
    issues.push('rol cierre_competencial sin signals_competence_closure=true');
    score -= 7;
  }
  if (parsed.estado_intervencion_cgr === 'abstencion_visible' && parsed.signals_abstention !== true) {
    issues.push('estado_intervencion_cgr abstencion_visible sin señal de abstención');
    score -= 7;
  }
  if (parsed.estado_intervencion_cgr === 'materia_litigiosa' && parsed.signals_litigious_matter !== true) {
    issues.push('estado_intervencion_cgr materia_litigiosa sin señal litigiosa');
    score -= 7;
  }
  if (parsed.reading_role === 'estado_actual' && parsed.supports_state_current !== true) {
    warnings.push('reading_role estado_actual sin supports_state_current=true');
    score -= 3;
  }
  if (
    typeof parsed.currentness_score === 'number'
    && typeof parsed.reading_weight === 'number'
    && parsed.currentness_score < 0.25
    && parsed.reading_role === 'estado_actual'
  ) {
    warnings.push('reading_role estado_actual con currentness_score muy bajo');
    score -= 3;
  }

  return {
    valid: issues.length === 0,
    score: Math.max(0, Math.round(score)),
    issues,
    warnings,
    summary: issues.length === 0
      ? 'Salida estructuralmente válida'
      : `Salida con ${issues.length} problemas estructurales`
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Benchmark doctrinal de modelos');
  lines.push('');
  lines.push(`Fecha: ${report.generated_at}`);
  lines.push('');
  lines.push('## Resumen');
  lines.push('');
  lines.push('| Modelo | Tipo | Casos | Válidos | Score promedio | Latencia promedio ms |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const model of report.summary.models) {
    lines.push(`| ${model.label} | ${model.type} | ${model.total_cases} | ${model.valid_cases} | ${model.average_score} | ${model.average_latency_ms} |`);
  }
  lines.push('');
  lines.push('## Hallazgos');
  lines.push('');
  for (const finding of report.summary.findings) {
    lines.push(`- ${finding}`);
  }
  lines.push('');
  lines.push('## Detalle por dictamen');
  lines.push('');
  for (const item of report.results) {
    lines.push(`### ${item.dictamen_id}`);
    lines.push('');
    lines.push(`- Materia: ${item.materia}`);
    lines.push(`- Fecha: ${item.fecha_documento ?? 'sin fecha'}`);
    for (const model of item.models) {
      lines.push(`- ${model.label}: score ${model.evaluation.score}, válido ${model.evaluation.valid ? 'sí' : 'no'}, latencia ${model.latency_ms} ms`);
      if (model.evaluation.issues.length > 0) {
        lines.push(`  Issues: ${model.evaluation.issues.join(' | ')}`);
      }
      if (model.output && typeof model.output === 'object') {
        lines.push(`  Rol: ${model.output.rol_principal} | Vigencia: ${model.output.estado_vigencia} | Intervención: ${model.output.estado_intervencion_cgr} | Reading: ${model.output.reading_role}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function run() {
  const devVarsContent = fs.readFileSync(DEV_VARS_PATH, 'utf8');
  const env = parseDevVars(devVarsContent);
  const mistralOlgaKey = parseCommentedSecret(devVarsContent, 'MISTRAL_API_KEY', 'Olga');
  if (!mistralOlgaKey) {
    throw new Error('No se encontró la clave de Olga en .dev.vars');
  }
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('No se encontró OPENROUTER_API_KEY activa en .dev.vars');
  }

  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
  const seedIds = Array.isArray(dataset) ? dataset.map((item) => item.id).filter(Boolean) : [];
  const benchmarkIdsAll = unique([
    ...seedIds,
    '045157N16',
    'E200011N25'
  ]);
  const requestedLimit = Number.parseInt(process.env.BENCHMARK_LIMIT ?? '', 10);
  const benchmarkIds = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? benchmarkIdsAll.slice(0, requestedLimit)
    : benchmarkIdsAll;

  const results = [];

  for (const dictamenId of benchmarkIds) {
    console.log(`[benchmark] dictamen ${dictamenId}`);
    const detail = await fetchDictamenDetail(dictamenId);
    const prompt = buildPrompt(detail);
    const modelResults = [];

    for (const model of MODELS) {
      console.log(`[benchmark]  -> ${model.label}`);
      let response;
      try {
        if (model.provider === 'mistral') {
          response = await callMistral(mistralOlgaKey, prompt);
        } else {
          response = await callOpenRouter(env.OPENROUTER_API_KEY, model.id, prompt);
        }
      } catch (error) {
        response = {
          ok: false,
          status: 599,
          latencyMs: REQUEST_TIMEOUT_MS,
          content: '',
          usage: null,
          error: error instanceof Error ? error.message : String(error)
        };
      }

      const { parsed, error } = parseJsonFromText(response.content);
      const evaluation = response.ok
        ? evaluateResponse(dictamenId, parsed)
        : {
            valid: false,
            score: 0,
            issues: [response.error ?? `HTTP ${response.status}`],
            warnings: [],
            summary: 'Fallo de invocación'
          };

      modelResults.push({
        model_id: model.id,
        label: model.label,
        type: model.type,
        provider: model.provider,
        http_ok: response.ok,
        status: response.status,
        latency_ms: response.latencyMs,
        usage: response.usage,
        parse_error: error,
        evaluation,
        output: parsed
      });

      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    results.push({
      dictamen_id: dictamenId,
      materia: detail?.meta?.materia ?? 'Sin materia',
      fecha_documento: detail?.meta?.fecha_documento ?? null,
      models: modelResults
    });
  }

  const modelSummary = MODELS.map((model) => {
    const entries = results.flatMap((item) => item.models.filter((candidate) => candidate.model_id === model.id));
    const totalCases = entries.length;
    const validCases = entries.filter((entry) => entry.evaluation.valid).length;
    const averageScore = totalCases > 0
      ? Number((entries.reduce((acc, entry) => acc + entry.evaluation.score, 0) / totalCases).toFixed(2))
      : 0;
    const averageLatencyMs = totalCases > 0
      ? Number((entries.reduce((acc, entry) => acc + entry.latency_ms, 0) / totalCases).toFixed(2))
      : 0;
    return {
      model_id: model.id,
      label: model.label,
      type: model.type,
      total_cases: totalCases,
      valid_cases: validCases,
      average_score: averageScore,
      average_latency_ms: averageLatencyMs
    };
  }).sort((left, right) => right.average_score - left.average_score || left.average_latency_ms - right.average_latency_ms);

  const findings = [];
  const winner = modelSummary[0];
  if (winner) {
    findings.push(`Mejor score promedio: ${winner.label} con ${winner.average_score}.`);
  }
  const bestFree = modelSummary.find((item) => item.type === 'free_candidate') ?? null;
  if (bestFree) {
    findings.push(`Mejor candidato gratuito: ${bestFree.label} con ${bestFree.average_score} y ${bestFree.valid_cases}/${bestFree.total_cases} salidas válidas.`);
  }
  const mistral = modelSummary.find((item) => item.model_id === 'mistral-large-2411') ?? null;
  if (mistral && bestFree) {
    const delta = Number((bestFree.average_score - mistral.average_score).toFixed(2));
    findings.push(`Diferencia contra Mistral Large 2411: ${delta >= 0 ? '+' : ''}${delta} puntos para ${bestFree.label}.`);
  }

  const report = {
    generated_at: new Date().toISOString(),
    benchmark_ids: benchmarkIds,
    summary: {
      models: modelSummary,
      findings
    },
    results
  };

  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(report, null, 2));
  fs.writeFileSync(OUTPUT_MD_PATH, renderMarkdown(report));

  console.log(JSON.stringify({
    ok: true,
    output_json: OUTPUT_JSON_PATH,
    output_md: OUTPUT_MD_PATH,
    models: modelSummary
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
