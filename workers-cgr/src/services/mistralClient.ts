// Cliente Mistral: genera analisis y parsea fuentes legales.
import type { DictamenRaw, DictamenSource } from '../types/dictamen';
const MISTRAL_RATE_KEY = "mistral:last_call";
const MISTRAL_429_COUNT_KEY = "mistral:429_count";
const MISTRAL_429_BACKOFF_KEY = "mistral:429_backoff_until";
async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
function getMistralSettings(env: Env) {
  const retryMaxRaw = Number(env.MISTRAL_RETRY_MAX ?? 3);
  const retryBaseRaw = Number(env.MISTRAL_RETRY_BASE_MS ?? 500);
  const minIntervalRaw = Number(env.MISTRAL_MIN_INTERVAL_MS ?? 6e3);
  const backoffMsRaw = Number(env.MISTRAL_429_BACKOFF_MS ?? 3e4);
  const backoffThresholdRaw = Number(env.MISTRAL_429_THRESHOLD ?? 2);
  return {
    retryMax: Number.isFinite(retryMaxRaw) ? Math.max(0, retryMaxRaw) : 3,
    retryBaseMs: Number.isFinite(retryBaseRaw) ? Math.max(100, retryBaseRaw) : 500,
    minIntervalMs: Number.isFinite(minIntervalRaw) ? Math.max(0, minIntervalRaw) : 6e3,
    backoffMs: Number.isFinite(backoffMsRaw) ? Math.max(0, backoffMsRaw) : 3e4,
    backoffThreshold: Number.isFinite(backoffThresholdRaw) ? Math.max(1, backoffThresholdRaw) : 2
  };
}
async function rateLimitMistral(env: Env) {
  try {
    const settings = getMistralSettings(env);
    const backoffUntilRaw = await env.STATE_KV.get(MISTRAL_429_BACKOFF_KEY);
    const backoffUntil = backoffUntilRaw ? Number(backoffUntilRaw) : 0;
    if (Number.isFinite(backoffUntil) && backoffUntil > Date.now()) {
      await sleep(backoffUntil - Date.now());
    }
    const raw = await env.STATE_KV.get(MISTRAL_RATE_KEY);
    const last = raw ? Number(raw) : 0;
    const now = Date.now();
    const wait = Number.isFinite(last) ? Math.max(0, settings.minIntervalMs - (now - last)) : 0;
    if (wait > 0) await sleep(wait);
    await env.STATE_KV.put(MISTRAL_RATE_KEY, String(Date.now()));
  } catch {
  }
}
async function recordMistral429(env: Env) {
  try {
    const settings = getMistralSettings(env);
    const raw = await env.STATE_KV.get(MISTRAL_429_COUNT_KEY);
    const count = raw ? Number(raw) : 0;
    const nextCount = Number.isFinite(count) ? count + 1 : 1;
    await env.STATE_KV.put(MISTRAL_429_COUNT_KEY, String(nextCount));
    if (nextCount >= settings.backoffThreshold) {
      const until = Date.now() + settings.backoffMs;
      await env.STATE_KV.put(MISTRAL_429_BACKOFF_KEY, String(until));
      await env.STATE_KV.put(MISTRAL_429_COUNT_KEY, "0");
    }
  } catch {
  }
}
async function resetMistral429(env: Env) {
  try {
    await env.STATE_KV.put(MISTRAL_429_COUNT_KEY, "0");
    await env.STATE_KV.delete(MISTRAL_429_BACKOFF_KEY);
  } catch {
  }
}
function getRawSource(raw: DictamenRaw): DictamenSource {
  return (raw._source ?? raw.source ?? (raw as any).raw_data ?? raw) as DictamenSource;
}
function buildPrompt(raw: DictamenRaw) {
  const source = getRawSource(raw);
  const documento = source.documento_completo ?? "";
  return [
    "Eres un abogado, eminencia en derecho administrativo en Chile. Te gusta estudiar dict\xE1menes de la Controlar\xEDa General de la Rep\xFAblica y analizar la jurisprudencia que nace de \xE9sta.",
    "Tu entrada <web-scraping>, es un dictamen.",
    "Respondes estrictamente de forma estructurada, con estas propiedades:",
    "-titulo: Efectiva descripci\xF3n del dictamen, hecho en menos de 66 caracteres,",
    "-resumen: Una brillante narraci\xF3n jurisprudencial del dictamen. En menos de 246 caracteres",
    '-an\xE1lisis: narrativa jurisprudencial, se\xF1alando el contexto jur\xEDdico desde los hechos, el razonamiento y la  fundamentaci\xF3n empleada, basado en la normativa, los principios del Derecho y/o doctrina, todo; con el fin de  obtener "jurisprudencia", digna del Derecho Administrativo chileno. Hecho en menos de 999 Tokens.',
    "-etiquetas: Arreglo con las m\xE1s representativas descripciones el dictamen. Con entre 3 a 6 elementos.",
    '-genera_jurisprudencia: Booleano "true" si objetivamente el dictamen est\xE1 generando doctrina administrativa.',
    "",
    "Tus respuestas deben cumplir con estas Pol\xEDticas:",
    "-Todo dato personal debe ser an\xF3nimo, con el fin de impedir la identificaci\xF3n de personas naturales.",
    "-Los cargos p\xFAblicos y roles administrativos son identificadores v\xE1lidos, y hasta necesarios, cuando el contexto lo requiere.",
    "-Salvo referencia impl\xEDcita, la norma jur\xEDdica se cita siempre con estas reglas.",
    "a) si es Constituci\xF3n, Ley o Decreto Ley basta identificarla por su nombre o n\xFAmero.",
    "b) Si es normativa administrativa (Decretos, Resoluciones, Circular, etc.), se identifican con una triada compuesta por: el organismo autor, el a\xF1o y el n\xFAmero del documento. (Eventualmente tambi\xE9n un ID que garantices individualizaci\xF3n).",
    "-No haces referencia a ti mismo ni al identificador del dictamen en estudio.",
    "-Evitar expresiones redundantes como \u201Cen este dictamen...\u201D, \u201Cel dictamen se\xF1ala...\u201D, \u201Ceste dictamen aborda...\u201D. En su lugar, utilizar formulaciones impersonales como \u201CSe aborda...\u201D, \u201CSe establece...\u201D. Asimismo, omitir referencias innecesarias como \u201Cde Chile\u201D o \u201Cchilenas\u201D al mencionar leyes o instituciones, ya que el contexto nacional es evidente y su reiteraci\xF3n resulta innecesaria.",
    "",
    "El formato JSON de tu salida debe ser esta estructura:",
    "{",
    '"titulo":"",',
    '"resumen":"",',
    '"analisis":"",',
    '"etiquetas":[],',
    '"genera_jurisprudencia":false',
    "}",
    "<web-scraping>",
    String(documento),
    "</web-scraping>"
  ].join("\n");
}
function buildFuentesLegalesPrompt(raw: DictamenRaw) {
  const source = getRawSource(raw);
  const fuentes = source.fuentes_legales ?? "";
  return [
    "You are a parser specialized in Chilean legal citations.",
    "",
    "Task:",
    "- Input: a string containing one or more legal references separated by commas (`,`).",
    "",
    "For each reference, output an object with the following fields:",
    "nombre: the first word before the first space. Example values: Ley, DL, DFL, DTO, RES, POL, CCI, etc.",
    "",
    "numero: all the numeric part immediately after nombre, including internal slashes (/), except the last segment if it represents a year.",
    "",
    "year: if there is a slash (/) in numero, extract the last numeric segment:",
    "",
    "If the last segment is two digits (e.g., 91), expand it to four digits (1991).",
    "",
    "If the last segment is four digits (e.g., 2004), keep it as-is.",
    "",
    "After extracting year, remove it from numero.",
    "",
    "If no year is present, set year as null.",
    "",
    "-`sector`: the text that immediately follows the year (if present), up to the next tag like art/ or the next comma. If no sector exists, set it as null.",
    "- `articulo`: the value after the `art/` tag, up to the next space or tag.",
    "- `extra`: everything after the `articulo` value, copied exactly as it appears, without processing, interpreting, or fragmenting it, If no extra exists, set it as null.",
    "",
    "Rules:",
    "- Always output one object per reference.",
    "- If there are multiple references, output a single JSON array (`[...]`) containing one object per reference.",
    "- Do not use the original reference string as a key in the output.",
    "- Do not group references together; treat each one separately.",
    "- Only output pure JSON, without code block markers (```), and without any commentary or explanation.",
    "- Always output all fields, even if some have `null` as their value.",
    "-Do not wrap the output with json or any code block markers. Only return the raw JSON array, without backticks, quotes, or labels like json.",
    "",
    "Parse the following legal references according to the rules and structure provided:",
    "(if there is no data below, just outoput: [{}] )",
    String(fuentes)
  ].join("\n");
}
function extractJsonPayload(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return content.slice(start, end + 1).trim();
}
function extractJsonArrayPayload(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return content.slice(start, end + 1).trim();
}
function normalizeBoolean(value: unknown) {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "true" || trimmed === "1" || trimmed === "si") return true;
    if (trimmed === "false" || trimmed === "0" || trimmed === "no") return false;
  }
  return false;
}
function normalizeBooleanos(input?: Record<string, unknown>) {
  return {
    nuevo: normalizeBoolean(input?.nuevo),
    aclarado: normalizeBoolean(input?.aclarado),
    relevante: normalizeBoolean(input?.relevante),
    confirmado: normalizeBoolean(input?.confirmado),
    boletin: normalizeBoolean(input?.boletin),
    alterado: normalizeBoolean(input?.alterado),
    complementado: normalizeBoolean(input?.complementado),
    reconsideradoParcialmente: normalizeBoolean(input?.reconsideradoParcialmente),
    reconsiderado: normalizeBoolean(input?.reconsiderado),
    aplicado: normalizeBoolean(input?.aplicado),
    reactivado: normalizeBoolean(input?.reactivado),
    recursoProteccion: normalizeBoolean(input?.recursoProteccion)
  };
}
function normalizeFuentesLegales(input?: unknown[]) {
  if (!Array.isArray(input)) return void 0;
  return input.map((item) => {
    const entry = item as any;
    return {
      nombre: entry.nombre ? String(entry.nombre).trim() : null,
      articulo: entry.articulo ? String(entry.articulo).trim() : null,
      numero: entry.numero ? String(entry.numero).trim() : null,
      year: entry.year === null || entry.year === void 0 ? null : Number(entry.year),
      sector: entry.sector ? String(entry.sector).trim() : null,
      extra: entry.extra ? String(entry.extra).trim() : null
    };
  });
}
async function analyzeDictamen(env: Env, raw: DictamenRaw) {
  let response = null;
  const settings = getMistralSettings(env);
  for (let attempt = 0; attempt <= settings.retryMax; attempt += 1) {
    await rateLimitMistral(env);
    response = await fetch(env.MISTRAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: env.MISTRAL_MODEL,
        messages: [{ role: "user", content: buildPrompt(raw) }],
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });
    if (response.ok) break;
    if (response.status === 429 && attempt < settings.retryMax) {
      await response.text().catch(() => "");
      await recordMistral429(env);
      const delay = settings.retryBaseMs * 2 ** attempt;
      await sleep(delay);
      continue;
    }
    throw new Error(`Mistral error: ${response.status}`);
  }
  if (!response) {
    throw new Error("Mistral error: no response");
  }
  const payload = await response.json() as any;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return null;
  await resetMistral429(env);
  const jsonPayload = extractJsonPayload(content);
  if (!jsonPayload) return null;
  try {
    const parsed = JSON.parse(jsonPayload) as any;
    const extrae = parsed.extrae_jurisprudencia ?? parsed;
    const extrae_jurisprudencia = {
      titulo: typeof extrae.titulo === "string" ? extrae.titulo : "",
      resumen: typeof extrae.resumen === "string" ? extrae.resumen : "",
      analisis: typeof extrae.analisis === "string" ? extrae.analisis : "",
      etiquetas: Array.isArray(extrae.etiquetas) ? extrae.etiquetas : []
    };
    const booleanos = normalizeBooleanos(
      parsed.booleanos ?? {}
    );
    const fuentes = normalizeFuentesLegales(parsed.fuentes_legales as any[]);
    return {
      extrae_jurisprudencia,
      genera_jurisprudencia: typeof parsed.genera_jurisprudencia === "boolean" ? parsed.genera_jurisprudencia : parsed.genera_jurisprudencia === void 0 ? void 0 : normalizeBoolean(parsed.genera_jurisprudencia),
      booleanos,
      fuentes_legales: fuentes ?? []
    };
  } catch {
    return null;
  }
}
async function analyzeFuentesLegales(env: Env, raw: DictamenRaw) {
  const prompt = buildFuentesLegalesPrompt(raw);
  let response = null;
  const settings = getMistralSettings(env);
  for (let attempt = 0; attempt <= settings.retryMax; attempt += 1) {
    await rateLimitMistral(env);
    response = await fetch(env.MISTRAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: env.MISTRAL_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1
      })
    });
    if (response.ok) break;
    if (response.status === 429 && attempt < settings.retryMax) {
      await response.text().catch(() => "");
      await recordMistral429(env);
      const delay = settings.retryBaseMs * 2 ** attempt;
      await sleep(delay);
      continue;
    }
    throw new Error(`Mistral error: ${response.status}`);
  }
  if (!response) throw new Error("Mistral error: no response");
  const payload = await response.json() as any;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return null;
  await resetMistral429(env);
  const jsonPayload = extractJsonArrayPayload(content);
  if (!jsonPayload) return null;
  try {
    const parsed = JSON.parse(jsonPayload);
    return normalizeFuentesLegales(parsed) ?? [];
  } catch {
    return null;
  }
}

async function expandQuery(env: Env, query: string): Promise<string> {
  const prompt = `Como experto en Derecho Administrativo chileno y jurisprudencia de la Contraloría General de la República (CGR), tu tarea es expandir la siguiente consulta de un usuario para mejorar la búsqueda semántica.
  
  Consulta original: "${query}"
  
  Instrucciones:
  1. Si la consulta es técnica, mantenla.
  2. Si la consulta es en lenguaje coloquial, tradúcela a términos jurídicos usados por la CGR (ej: "echaron" -> "destitución", "muni" -> "municipalidad", "plata" -> "recursos públicos").
  3. Si la consulta menciona un año, asegúrate de que el año esté presente en la consulta expandida.
  4. Devuelve ÚNICAMENTE la consulta expandida, sin explicaciones.
  
  Consulta expandida:`;

  const settings = getMistralSettings(env);
  let response = null;
  for (let attempt = 0; attempt <= settings.retryMax; attempt += 1) {
    await rateLimitMistral(env);
    response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1
      })
    });
    if (response.ok) break;
    if (response.status === 429 && attempt < settings.retryMax) {
      await recordMistral429(env);
      await sleep(settings.retryBaseMs * 2 ** attempt);
      continue;
    }
    throw new Error(`Mistral error: ${response.status}`);
  }

  const payload = await response?.json() as any;
  const content = payload.choices?.[0]?.message?.content?.trim();
  return content || query;
}

async function rerankResults(env: Env, query: string, results: any[]): Promise<any[]> {
  if (results.length <= 1) return results;

  const prompt = `Como experto en Derecho Administrativo chileno, evalúa la relevancia de los siguientes dictámenes respecto a la consulta del usuario.
  
  Consulta: "${query}"
  
  Dictámenes:
  ${results.map((r, i) => `[${i}] Título: ${r.metadata?.titulo}\nResumen: ${r.metadata?.Resumen || r.metadata?.resumen}`).join('\n\n')}
  
  Instrucciones:
  1. Ordena los índices de los dictámenes de más relevante a menos relevante.
  2. Devuelve ÚNICAMENTE un arreglo JSON de índices, ej: [2, 0, 1].
  3. Si un dictamen no tiene ninguna relación, omítelo.
  
  Orden de relevancia (JSON):`;

  const settings = getMistralSettings(env);
  let response = null;
  for (let attempt = 0; attempt <= settings.retryMax; attempt += 1) {
    await rateLimitMistral(env);
    response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });
    if (response.ok) break;
    if (response.status === 429 && attempt < settings.retryMax) {
      await recordMistral429(env);
      await sleep(settings.retryBaseMs * 2 ** attempt);
      continue;
    }
    throw new Error(`Mistral error: ${response.status}`);
  }

  const payload = await response?.json() as any;
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) return results;

  try {
    const jsonPayload = extractJsonArrayPayload(content) || content;
    const indices = JSON.parse(jsonPayload);
    if (Array.isArray(indices)) {
      return indices
        .map(i => results[i])
        .filter(r => r !== undefined);
    }
  } catch (e) {
    console.error("Rerank parsing failed:", e);
  }

  return results;
}

async function generateEmbedding(env: Env, input: string): Promise<number[]> {
  const settings = getMistralSettings(env);
  let response = null;
  for (let attempt = 0; attempt <= settings.retryMax; attempt += 1) {
    await rateLimitMistral(env);
    response = await fetch("https://api.mistral.ai/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: "mistral-embed",
        input: [input]
      })
    });
    if (response.ok) break;
    if (response.status === 429 && attempt < settings.retryMax) {
      await recordMistral429(env);
      await sleep(settings.retryBaseMs * 2 ** attempt);
      continue;
    }
    throw new Error(`Mistral embedding error: ${response.status}`);
  }

  const data = await response?.json() as any;
  if (data?.data?.[0]?.embedding) {
    return data.data[0].embedding;
  }
  throw new Error("Invalid embedding response");
}

export { analyzeDictamen, analyzeFuentesLegales, buildPrompt, expandQuery, rerankResults, generateEmbedding };
