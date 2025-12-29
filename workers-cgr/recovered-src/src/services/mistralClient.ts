// src/services/mistralClient.ts
var MISTRAL_RATE_KEY = "mistral:last_call";
var MISTRAL_429_COUNT_KEY = "mistral:429_count";
var MISTRAL_429_BACKOFF_KEY = "mistral:429_backoff_until";
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
__name(sleep, "sleep");
function getMistralSettings(env) {
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
__name(getMistralSettings, "getMistralSettings");
async function rateLimitMistral(env) {
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
__name(rateLimitMistral, "rateLimitMistral");
async function recordMistral429(env) {
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
__name(recordMistral429, "recordMistral429");
async function resetMistral429(env) {
  try {
    await env.STATE_KV.put(MISTRAL_429_COUNT_KEY, "0");
    await env.STATE_KV.delete(MISTRAL_429_BACKOFF_KEY);
  } catch {
  }
}
__name(resetMistral429, "resetMistral429");
function getRawSource(raw) {
  return raw._source ?? raw.source ?? raw.raw_data ?? raw;
}
__name(getRawSource, "getRawSource");
function buildPrompt(raw) {
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
__name(buildPrompt, "buildPrompt");
function buildFuentesLegalesPrompt(raw) {
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
__name(buildFuentesLegalesPrompt, "buildFuentesLegalesPrompt");
function extractJsonPayload(content) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return content.slice(start, end + 1).trim();
}
__name(extractJsonPayload, "extractJsonPayload");
function extractJsonArrayPayload(content) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return content.slice(start, end + 1).trim();
}
__name(extractJsonArrayPayload, "extractJsonArrayPayload");
function normalizeBoolean(value) {
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
__name(normalizeBoolean, "normalizeBoolean");
function normalizeBooleanos(input) {
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
__name(normalizeBooleanos, "normalizeBooleanos");
function normalizeFuentesLegales(input) {
  if (!Array.isArray(input)) return void 0;
  return input.map((item) => {
    const entry = item;
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
__name(normalizeFuentesLegales, "normalizeFuentesLegales");
async function analyzeDictamen(env, raw) {
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
        temperature: 0.2
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
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return null;
  await resetMistral429(env);
  const jsonPayload = extractJsonPayload(content);
  if (!jsonPayload) return null;
  try {
    const parsed = JSON.parse(jsonPayload);
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
    const fuentes = normalizeFuentesLegales(parsed.fuentes_legales);
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
__name(analyzeDictamen, "analyzeDictamen");
async function analyzeFuentesLegales(env, raw) {
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
  const payload = await response.json();
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
__name(analyzeFuentesLegales, "analyzeFuentesLegales");
