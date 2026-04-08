import type { Env, DictamenRaw } from '../types';
import { buildPromptConsolidado } from './mistral';
import { logError, logWarn } from '../lib/log';
import {
  recordProviderApiKeyFailure,
  recordProviderApiKeySuccess,
  selectProviderApiKey
} from '../lib/providerKeyPool';

export async function analyzeDictamenGemini(
  env: Env, 
  raw: DictamenRaw, 
  modelName: string = "gemini-3.1-flash-lite-preview"
): Promise<{ result: any | null; error?: string }> {
  const prompt = buildPromptConsolidado(raw);
  const baseUrl = env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com';

  let attempts = 0;
  const maxAttempts = 5;
  let delay = 2000;
  let lastKeyId: string | null = null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (env.CF_AIG_AUTHORIZATION) {
    headers['cf-aig-authorization'] = env.CF_AIG_AUTHORIZATION;
  }

  while (attempts < maxAttempts) {
    const selection = await selectProviderApiKey(env.DB, env, 'gemini', modelName);
    if (!selection.ok) {
      return { result: null, error: selection.reason === 'NO_KEYS' ? 'GEMINI_API_KEY_MISSING' : 'QUOTA_EXCEEDED' };
    }
    if (lastKeyId && lastKeyId !== selection.keyId) {
      logWarn('GEMINI_KEY_ROTATED', { from: lastKeyId, to: selection.keyId, modelName, id: raw.id });
    }
    lastKeyId = selection.keyId;
    const url = `${baseUrl}/v1beta/models/${modelName}:generateContent?key=${selection.apiKey}`;

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
          await recordProviderApiKeyFailure(env.DB, env, selection, 'quota', JSON.stringify(errorData.error || errorData));
          attempts++;
          if (attempts < maxAttempts) {
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
      await recordProviderApiKeySuccess(env.DB, selection);
      
      return { result: parsed };

    } catch (e: any) {
      const message = e.message || String(e);
      const isUnauthorized = e.status === 401 || message.toLowerCase().includes('api key not valid') || message.toLowerCase().includes('permission denied');
      if (isUnauthorized) {
        await recordProviderApiKeyFailure(env.DB, env, selection, 'blocked', message);
        attempts++;
        if (attempts < maxAttempts) {
          continue;
        }
        return { result: null, error: 'QUOTA_EXCEEDED' };
      }
      await recordProviderApiKeyFailure(env.DB, env, selection, 'error', message);
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
