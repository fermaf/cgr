import fs from 'fs';
import OpenAI from 'openai';

// Cargar variables de entorno
const devVars = fs.readFileSync('.dev.vars', 'utf8').split('\n');
const env: Record<string, string> = {};
devVars.forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length > 0) {
    env[key.trim()] = val.join('=').replace(/^"(.*)"$/, '$1').trim();
  }
});

const client = new OpenAI({
  apiKey: env.MISTRAL_API_KEY,
  baseURL: "https://gateway.ai.cloudflare.com/v1/63ac4f10cdedc71a1b09256622380278/cgr-gateway/mistral/v1",
  defaultHeaders: {
    'cf-aig-authorization': env.CF_AIG_AUTHORIZATION
  }
});

const dictamenRaw = JSON.parse(fs.readFileSync('paso_000007N21.json', 'utf8'));

const PROMPT_CONSOLIDADO_V4_STRICT = `Eres un abogado, eminencia en derecho administrativo en Chile.

Tu entrada es el dictamen completo (texto íntegro + metadatos + campo 'fuentes_legales' si existe).

### TAREA CRÍTICA:
Analiza el dictamen y entrega UNA SOLA respuesta JSON integral. 
PROHIBICIÓN ABSOLUTA: No puedes usar puntos suspensivos (...), ni frases como "[omitiendo]", "[continúa...]", "[resumen...]" o cualquier forma de truncamiento en el campo "analisis". El análisis debe ser completo, fluido y profesional de principio a fin.

### 1. Jurisprudencia
- titulo: descripción efectiva del dictamen, máximo 66 caracteres.
- resumen: narración jurisprudencial brillante, máximo 246 caracteres.
- analisis: narrativa jurisprudencial EXHAUSTIVA. Explica contexto, hechos, razonamiento y fundamentación jurídica completa. Mínimo 1500 caracteres, máximo 999 tokens. DEBE SER TEXTO CONTINUO Y COMPLETO.
- etiquetas: array de 3 a 6 etiquetas.
- genera_jurisprudencia: boolean true si genera doctrina administrativa.

### 2. Booleanos
Clasifica según dictamen: nuevo, aclarado, relevante, confirmado, boletin, alterado, complementado, reconsiderado_parcialmente, reconsiderado, aplicado, reactivado, recurso_proteccion. (SI/1 -> true; NO/vacío -> false).

### 3. Fuentes Legales
Extrae referencias explícitas del texto. NO INVENTES fuentes que no estén en el texto.
- nombre: sigla (Ley, DL, DFL, DTO, etc.).
- numero: identificador numérico.
- year: 4 dígitos (ej. 91 -> 1991).
- sector, articulo, extra: según aparezca (o null).

### Políticas de Estilo (Obligatorias):
- Impersonalidad total: "Se establece", "Se concluye". NUNCA "el dictamen señala".
- NUNCA menciones "de Chile" o "chilenas".
- Anonimización estricta de personas naturales.

### Formato de Salida:
JSON ÚNICAMENTE.
`;

const PROMPT_CONSOLIDADO_V5_SEMANTIC = `Eres un abogado, eminencia en derecho administrativo en Chile.

Tu entrada es el dictamen completo (texto íntegro + metadatos + campo 'fuentes_legales' si existe).

### TAREA CRÍTICA (PROFUNDIDAD SEMÁNTICA):
Analiza el dictamen y entrega UNA SOLA respuesta JSON integral. 
PROHIBICIÓN ABSOLUTA de truncamiento (..., [omitiendo], etc.).

### 1. Jurisprudencia
- titulo: descripción efectiva del dictamen, máximo 66 caracteres.
- resumen: narración jurisprudencial brillante, máximo 246 caracteres.
- analisis: narrativa jurisprudencial de ALTA PROFUNDIDAD SEMÁNTICA. 
  * Explica contexto, hechos, razonamiento y fundamentación jurídica completa. 
  * INTEGRACIÓN DE CITAS: No hagas listas de dictámenes. Cada vez que menciones jurisprudencia previa (ej. dictamen X), integra la cita en la narrativa explicando brevemente su relevancia o relación con el caso actual. 
  * El objetivo es que el texto sea rico para búsquedas vectoriales (Pinecone) pero fluido para un experto.
  * Mínimo 1500 caracteres, máximo 999 tokens. DEBE SER TEXTO CONTINUO.

### 2. Booleanos
Clasifica (SI/1 -> true; NO/vacío -> false).

### 3. Fuentes Legales
Extrae referencias del texto. 
- nombre (sigla), numero, year (4 dígitos), sector, articulo, extra (o null).

### Políticas de Estilo:
- Impersonalidad total. NUNCA "el dictamen señala".
- NUNCA "de Chile" ni "chilenas".
- Anonimización absoluta.

### Formato de Salida:
JSON ÚNICAMENTE.
`;

async function callMistral(prompt: string, input: string) {
  const response = await client.chat.completions.create({
    model: "mistral-large-2512",
    messages: [{ role: "user", content: prompt + "\n\nInput: " + input }],
    temperature: 0.1,
    response_format: { type: "json_object" }
  });
  return JSON.parse(response.choices[0].message.content || '{}');
}

async function run() {
  console.log("Iniciando Benchmark: V4 Strict vs V5 Semantic Depth");
  const input = JSON.stringify(dictamenRaw.source);

  console.log("Ejecutando V4 Strict...");
  const resV4 = await callMistral(PROMPT_CONSOLIDADO_V4_STRICT, input);

  console.log("Ejecutando V5 Semantic Depth...");
  const resV5 = await callMistral(PROMPT_CONSOLIDADO_V5_SEMANTIC, input);

  const results = {
    v4_strict: resV4,
    v5_semantic: resV5
  };

  fs.writeFileSync('benchmark_results_v5.json', JSON.stringify(results, null, 2));
  console.log("Benchmark completado. Resultados en benchmark_results_v5.json");

  console.log("\n--- ANALISIS V4 ---");
  console.log(resV4.extrae_jurisprudencia.analisis.substring(0, 300) + "...");

  console.log("\n--- ANALISIS V5 ---");
  console.log(resV5.extrae_jurisprudencia.analisis.substring(0, 300) + "...");
}

run().catch(console.error);
