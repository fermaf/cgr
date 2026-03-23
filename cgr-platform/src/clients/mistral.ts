// Cliente Mistral: genera analisis y parsea fuentes legales.
import OpenAI from 'openai';
import type { Env, DictamenRaw, DictamenSource } from '../types';
import { logError, logWarn, setLogLevel } from '../lib/log';

function getMistralClient(env: Env) {
  setLogLevel(env.LOG_LEVEL);
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

function buildPromptConsolidado(raw: DictamenRaw) {
  const source = getRawSource(raw);

  // Selección selectiva de propiedades efectivas (14 en total) para optimizar tokens y reducir ruido
  const inputData = JSON.stringify({
    documento_completo: source.documento_completo ?? source.materia ?? (source as any).texto ?? (source as any).resumen,
    fuentes_legales: source.fuentes_legales,
    // Atributos booleanos para clasificación
    nuevo: source.nuevo,
    aclarado: source.aclarado,
    relevante: source.relevante,
    confirmado: source.confirmado,
    boletin: source.boletin,
    alterado: source.alterado,
    complementado: source.complementado,
    reconsiderado_parcialmente: source.reconsiderado_parcialmente,
    reconsiderado: source.reconsiderado,
    aplicado: source.aplicado,
    reactivado: source.reactivado,
    recurso_proteccion: source.recurso_proteccion
  }, null, 2);

  return [
    "Eres un abogado, eminencia en derecho administrativo en Chile.",
    "",
    "Tu entrada es el dictamen completo (texto íntegro + metadatos + campo 'fuentes_legales' si existe).",
    "",
    "### TAREA CRÍTICA (PROFUNDIDAD SEMÁNTICA):",
    "Analiza el dictamen y entrega UNA SOLA respuesta JSON integral.",
    "PROHIBICIÓN ABSOLUTA: No puedes usar puntos suspensivos (...), ni frases como \"[omitiendo]\", \"[continúa...]\", \"[resumen...]\" o cualquier forma de truncamiento en el campo \"analisis\".",
    "",
    "### 1. Jurisprudencia",
    "- titulo: descripción efectiva del dictamen, máximo 66 caracteres.",
    "- resumen: narración jurisprudencial brillante, máximo 246 caracteres.",
    "- analisis: narrativa jurisprudencial de ALTA PROFUNDIDAD SEMÁNTICA.",
    "  * Explica contexto, hechos, razonamiento y fundamentación jurídica completa.",
    "  * INTEGRACIÓN DE CITAS: No hagas listas de dictámenes. Cada vez que menciones jurisprudencia previa (ej. dictamen X), integra la cita en la narrativa explicando brevemente su relevancia o relación con el caso actual.",
    "  * El objetivo es que el texto sea rico para búsquedas vectoriales (Pinecone) pero fluido para un experto.",
    "  * Mínimo 1500 caracteres, máximo 999 tokens. DEBE SER TEXTO CONTINUO.",
    "- etiquetas: array de 3 a 6 etiquetas.",
    "- genera_jurisprudencia: boolean true si genera doctrina administrativa.",
    "",
    "### 2. Booleanos",
    "Clasifica según dictamen: nuevo, aclarado, relevante, confirmado, boletin, alterado, complementado, reconsiderado_parcialmente, reconsiderado, aplicado, reactivado, recurso_proteccion. (SI/1 o afirmación clara -> true; NO/vacío o ausencia -> false).",
    "",
    "### 3. Fuentes Legales",
    "Extrae referencias explícitas del texto. NO INVENTES fuentes que no estén en el texto.",
    "- nombre: sigla (Ley, DL, DFL, DTO, etc.).",
    "- numero: identificador numérico.",
    "- year: 4 dígitos (ej. 91 -> 1991).",
    "- sector, articulo, extra: según aparezca (o null).",
    "",
    "### 4. Acciones Jurídicas Emitidas (RETRO-UPDATE)",
    "Si este dictamen altera, aclara, complementa, confirma, reactiva, o reconsidera (total o parcialmente) la jurisprudencia de uno o varios dictámenes emitidos EN EL PASADO, debes extraer:",
    "- accion: 'aclarado', 'alterado', 'complementado', 'confirmado', 'reactivado', 'reconsiderado', 'reconsiderado_parcialmente'.",
    "- numero_destino: El número del dictamen modificado (sin 'N°', ej: 7640).",
    "- anio_destino: El año de emisión del dictamen modificado (ej: 2007).",
    "Si no modifica a ningún dictamen específico anterior, retorna el array vacío [].",
    "",
    "### Políticas de Estilo (Obligatorias):",
    "- Impersonalidad total: \"Se establece\", \"Se concluye\". NUNCA \"el dictamen señala\".",
    "- NUNCA menciones \"de Chile\" o \"chilenas\".",
    "- Anonimización estricta de personas naturales.",
    "",
    "### Formato de Salida (JSON ÚNICAMENTE, SIN BLOQUES DE CÓDIGO, SIN COMENTARIOS):",
    "{",
    '  "extrae_jurisprudencia": {',
    '    "titulo": "",',
    '    "resumen": "",',
    '    "analisis": "",',
    '    "etiquetas": []',
    "  },",
    '  "genera_jurisprudencia": false,',
    '  "booleanos": {',
    '    "nuevo": false,',
    '    "aclarado": false,',
    '    "relevante": false,',
    '    "confirmado": false,',
    '    "boletin": false,',
    '    "alterado": false,',
    '    "complementado": false,',
    '    "reconsiderado_parcialmente": false,',
    '    "reconsiderado": false,',
    '    "aplicado": false,',
    '    "reactivado": false,',
    '    "recurso_proteccion": false',
    "  },",
    '  "fuentes_legales": [',
    "    {",
    '      "nombre": "",',
    '      "numero": "",',
    '      "year": null,',
    '      "sector": null,',
    '      "articulo": null,',
    '      "extra": null',
    "    }",
    "  ],",
    '  "acciones_juridicas_emitidas": [',
    "    {",
    '      "accion": "",',
    '      "numero_destino": "",',
    '      "anio_destino": ""',
    "    }",
    "  ]",
    "}",
    "",
    "Input:",
    inputData
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

async function analyzeDictamen(env: Env, raw: DictamenRaw): Promise<{ result: any | null; error?: string }> {
  const client = getMistralClient(env);
  let attempts = 0;
  const maxAttempts = 5;
  let delay = 10000;

  while (attempts < maxAttempts) {
    try {
      const response = await client.chat.completions.create({
        model: env.MISTRAL_MODEL,
        messages: [{ role: "user", content: buildPromptConsolidado(raw) }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const contentRaw = response.choices?.[0]?.message?.content;
      const content = typeof contentRaw === 'string' ? contentRaw : undefined;
      if (!content) return { result: null, error: 'Empty response from Mistral' };

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
        result: {
          extrae_jurisprudencia,
          genera_jurisprudencia: typeof parsed.genera_jurisprudencia === "boolean" ? parsed.genera_jurisprudencia : parsed.genera_jurisprudencia === void 0 ? void 0 : normalizeBoolean(parsed.genera_jurisprudencia),
          booleanos,
          fuentes_legales: fuentes ?? [],
          acciones_juridicas_emitidas: Array.isArray(parsed.acciones_juridicas_emitidas) ? parsed.acciones_juridicas_emitidas : []
        }
      };
    } catch (error: any) {
      attempts++;
      const isRateLimit = error.status === 429 || String(error).includes('429');

      if (isRateLimit && attempts < maxAttempts) {
        logWarn('MISTRAL_RATE_LIMIT_RETRY', { attempt: attempts, nextDelay: delay, id: raw.id });
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }

      const msg = error.message || String(error);

      if ((isRateLimit && attempts >= maxAttempts) || error.status === 401 || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('quota')) {
        return { result: null, error: 'QUOTA_EXCEEDED' };
      }

      logError('MISTRAL_ANALYZE_DICTAMEN_ERROR', error, { model: env.MISTRAL_MODEL, attempts });
      return { result: null, error: msg };
    }
  }
  return { result: null, error: 'Max retry attempts reached' };
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
      model: env.MISTRAL_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1
    });

    const contentRaw = response.choices?.[0]?.message?.content;
    const content = typeof contentRaw === 'string' ? contentRaw : undefined;
    return content?.trim() || query;
  } catch (error) {
    logError('MISTRAL_EXPAND_QUERY_ERROR', error, { model: env.MISTRAL_MODEL });
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
      model: env.MISTRAL_MODEL,
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
    logError('MISTRAL_RERANK_ERROR', e, { model: env.MISTRAL_MODEL });
  }

  return results;
}

async function generateEmbedding(env: Env, input: string): Promise<number[]> {
  const client = getMistralClient(env);

  try {
    const response = await client.embeddings.create({
      model: env.MISTRAL_MODEL,
      input: [input]
    });

    if (response.data?.[0]?.embedding) {
      console.log("Vector dimensions inside Mistral:", response.data[0].embedding.length);
      return response.data[0].embedding;
    }
    throw new Error("Invalid embedding response");
  } catch (error) {
    logError('MISTRAL_EMBEDDING_ERROR', error, { model: env.MISTRAL_MODEL });
    throw error;
  }
}

export { analyzeDictamen, buildPromptConsolidado, expandQuery, rerankResults, generateEmbedding };
