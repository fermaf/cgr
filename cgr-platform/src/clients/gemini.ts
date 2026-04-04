import type { Env, DictamenRaw } from '../types';
import { buildPromptConsolidado } from './mistral';
import { logError, logWarn } from '../lib/log';

export async function analyzeDictamenGemini(
  env: Env, 
  raw: DictamenRaw, 
  modelName: string = "gemini-3.1-flash-lite-preview"
): Promise<{ result: any | null; error?: string }> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return { result: null, error: 'GEMINI_API_KEY_MISSING' };

  const prompt = buildPromptConsolidado(raw);
  const baseUrl = env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com';
  const url = `${baseUrl}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  let attempts = 0;
  const maxAttempts = 3;
  let delay = 2000;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (env.CF_AIG_AUTHORIZATION) {
    headers['cf-aig-authorization'] = env.CF_AIG_AUTHORIZATION;
  }

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errorData: any = await response.json();
        const status = response.status;
        
        if (status === 429) {
           if (attempts < maxAttempts - 1) {
             logWarn('GEMINI_RATE_LIMIT_RETRY', { attempt: attempts + 1, modelName });
             await new Promise(r => setTimeout(r, delay));
             delay *= 2;
             attempts++;
             continue;
           }
           return { result: null, error: 'QUOTA_EXCEEDED' };
        }
        
        throw new Error(`Gemini API error (${status}): ${JSON.stringify(errorData.error || errorData)}`);
      }

      const data: any = await response.json();
      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error("Invalid Gemini response structure");
      }

      let text = data.candidates[0].content.parts[0].text;
      // Limpieza robusta de JSON envuelto en markdown
      text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (parseError: any) {
        logError('GEMINI_PARSE_ERROR', parseError, { text, modelName, id: raw.id });
        throw new Error(`Error al parsear JSON de Gemini: ${parseError.message}`);
      }

      // Normalización mínima para asegurar compatibilidad con el resto del sistema (D1, Pinecone)
      // Reusamos la estructura que el prompt ya exige.
      
      return { result: parsed };

    } catch (e: any) {
      logError('GEMINI_ANALYZE_ERROR', e, { modelName, id: raw.id, attempt: attempts + 1 });
      attempts++;
      if (attempts >= maxAttempts) {
        return { result: null, error: e.message };
      }
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }

  return { result: null, error: 'MAX_ATTEMPTS_REACHED' };
}
