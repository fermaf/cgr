// Cliente Mistral: genera analisis y parsea fuentes legales.
import OpenAI from 'openai';
import type { Env, DictamenRaw, DictamenSource } from '../types';

function getMistralClient(env: Env) {
  const headers: Record<string, string> = {};

  if (env.CF_AIG_AUTHORIZATION) {
    headers['cf-aig-authorization'] = env.CF_AIG_AUTHORIZATION;
  }

  return new OpenAI({
    apiKey: env.MISTRAL_API_KEY,
    baseURL: env.MISTRAL_API_URL,
    defaultHeaders: headers,
  });
}

function getRawSource(raw: DictamenRaw): DictamenSource {
  return (raw._source ?? raw.source ?? (raw as any).raw_data ?? raw) as DictamenSource;
}

function buildPrompt(raw: DictamenRaw) {
  const source = getRawSource(raw);
  const documento = source.documento_completo ?? "";
  return [
    "Eres un abogado, eminencia en derecho administrativo en Chile. Te gusta estudiar dictámenes de la Controlaría General de la República y analizar la jurisprudencia que nace de ésta.",
    "Tu entrada <web-scraping>, es un dictamen.",
    "Respondes estrictamente de forma estructurada, con estas propiedades:",
    "-titulo: Efectiva descripción del dictamen, hecho en menos de 66 caracteres,",
    "-resumen: Una brillante narración jurisprudencial del dictamen. En menos de 246 caracteres",
    '-análisis: narrativa jurisprudencial, señalando el contexto jurídico desde los hechos, el razonamiento y la  fundamentación empleada, basado en la normativa, los principios del Derecho y/o doctrina, todo; con el fin de  obtener "jurisprudencia", digna del Derecho Administrativo chileno. Hecho en menos de 999 Tokens.',
    "-etiquetas: Arreglo con las más representativas descripciones el dictamen. Con entre 3 a 6 elementos.",
    '-genera_jurisprudencia: Booleano "true" si objetivamente el dictamen está generando doctrina administrativa.',
    "",
    "Tus respuestas deben cumplir con estas Políticas:",
    "-Todo dato personal debe ser anónimo, con el fin de impedir la identificación de personas naturales.",
    "-Los cargos públicos y roles administrativos son identificadores válidos, y hasta necesarios, cuando el contexto lo requiere.",
    "-Salvo referencia implícita, la norma jurídica se cita siempre con estas reglas.",
    "a) si es Constitución, Ley o Decreto Ley basta identificarla por su nombre o número.",
    "b) Si es normativa administrativa (Decretos, Resoluciones, Circular, etc.), se identifican con una triada compuesta por: el organismo autor, el año y el número del documento. (Eventualmente también un ID que garantices individualización).",
    "-No haces referencia a ti mismo ni al identificador del dictamen en estudio.",
    "-Evitar expresiones redundantes como “en este dictamen...”, “el dictamen señala...”, “este dictamen aborda...”. En su lugar, utilizar formulaciones impersonales como “Se aborda...”, “Se establece...”. Asimismo, omitir referencias innecesarias como “de Chile” o “chilenas” al mencionar leyes o instituciones, ya que el contexto nacional es evidente y su reiteración resulta innecesaria.",
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
    "- Input: a string containing one or more legal references separated by commas (`, `).",
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
    "- `articulo`: the value after the `art / ` tag, up to the next space or tag.",
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
    reconsiderado_parcialmente: normalizeBoolean(input?.reconsiderado_parcialmente ?? input?.reconsideradoParcialmente),
    reconsiderado: normalizeBoolean(input?.reconsiderado),
    aplicado: normalizeBoolean(input?.aplicado),
    reactivado: normalizeBoolean(input?.reactivado),
    recurso_proteccion: normalizeBoolean(input?.recurso_proteccion ?? input?.recursoProteccion)
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

async function analyzeDictamen(env: Env, raw: DictamenRaw) {
  const client = getMistralClient(env);

  try {
    const response = await client.chat.completions.create({
      model: env.MISTRAL_MODEL,
      messages: [{ role: "user", content: buildPrompt(raw) }],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const contentRaw = response.choices?.[0]?.message?.content;
    const content = typeof contentRaw === 'string' ? contentRaw : undefined;
    if (!content) return null;

    // SDK returns string, we try to parse it
    // Using string extractor just in case the model returns markdown wrapped json
    const jsonPayload = typeof content === 'string' ? (extractJsonPayload(content) || content) : JSON.stringify(content);
    const parsed = JSON.parse(jsonPayload as string) as any;

    const extrae = parsed.extrae_jurisprudencia ?? parsed;
    const extrae_jurisprudencia = {
      titulo: typeof extrae.titulo === "string" ? extrae.titulo : "",
      resumen: typeof extrae.resumen === "string" ? extrae.resumen : "",
      analisis: typeof extrae.analisis === "string" ? extrae.analisis : "",
      etiquetas: Array.isArray(extrae.etiquetas) ? extrae.etiquetas : []
    };

    const booleanos = normalizeBooleanos(parsed.booleanos ?? {});
    const fuentes = normalizeFuentesLegales(parsed.fuentes_legales as any[]);

    return {
      extrae_jurisprudencia,
      genera_jurisprudencia: typeof parsed.genera_jurisprudencia === "boolean" ? parsed.genera_jurisprudencia : parsed.genera_jurisprudencia === void 0 ? void 0 : normalizeBoolean(parsed.genera_jurisprudencia),
      booleanos,
      fuentes_legales: fuentes ?? []
    };
  } catch (error) {
    console.error("Mistral analyzeDictamen error:", error);
    return null;
  }
}

async function analyzeFuentesLegales(env: Env, raw: DictamenRaw) {
  const client = getMistralClient(env);
  const prompt = buildFuentesLegalesPrompt(raw);

  try {
    const response = await client.chat.completions.create({
      model: env.MISTRAL_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1
    });

    const contentRaw = response.choices?.[0]?.message?.content;
    const content = typeof contentRaw === 'string' ? contentRaw : undefined;
    if (!content) return null;

    const jsonPayload = typeof content === 'string' ? (extractJsonArrayPayload(content) || content) : JSON.stringify(content);
    const parsed = JSON.parse(jsonPayload as string);
    return normalizeFuentesLegales(parsed) ?? [];
  } catch (error) {
    console.error("Mistral analyzeFuentesLegales error:", error);
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

  const client = getMistralClient(env);

  try {
    const response = await client.chat.completions.create({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1
    });

    const contentRaw = response.choices?.[0]?.message?.content;
    const content = typeof contentRaw === 'string' ? contentRaw : undefined;
    return content?.trim() || query;
  } catch (error) {
    console.error("Mistral expandQuery error:", error);
    return query;
  }
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

  const client = getMistralClient(env);

  try {
    const response = await client.chat.completions.create({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const contentRaw = response.choices?.[0]?.message?.content;
    const content = typeof contentRaw === 'string' ? contentRaw : undefined;
    const contentTrimmed = content?.trim();
    if (!contentTrimmed) return results;

    const jsonPayload = typeof contentTrimmed === 'string' ? (extractJsonArrayPayload(contentTrimmed) || contentTrimmed) : JSON.stringify(contentTrimmed);
    const indices = JSON.parse(jsonPayload as string);
    if (Array.isArray(indices)) {
      return indices
        .map(i => results[i])
        .filter(r => r !== undefined);
    }
  } catch (e) {
    console.error("Mistral rerankResults error:", e);
  }

  return results;
}

async function generateEmbedding(env: Env, input: string): Promise<number[]> {
  const client = getMistralClient(env);

  try {
    const response = await client.embeddings.create({
      model: "mistral-embed",
      input: [input]
    });

    if (response.data?.[0]?.embedding) {
      console.log("Vector dimensions inside Mistral:", response.data[0].embedding.length);
      return response.data[0].embedding;
    }
    throw new Error("Invalid embedding response");
  } catch (error) {
    console.error("Mistral generateEmbedding error:", error);
    throw error;
  }
}

export { analyzeDictamen, analyzeFuentesLegales, buildPrompt, expandQuery, rerankResults, generateEmbedding };
