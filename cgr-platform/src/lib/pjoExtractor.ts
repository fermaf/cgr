/**
 * pjoExtractor.ts — Extrae Problemas Jurídicos Operativos (PJO)
 * desde los Regímenes Jurisprudenciales usando Gemini Flash.
 *
 * Un PJO es la **pregunta jurídica concreta** que el régimen responde.
 * Ejemplo: "¿Puede la Administración no renovar una contrata si el
 *           funcionario tenía expectativa legítima de continuidad?"
 *
 * Propósito jurídico:
 *   - Permite a Indubia presentar el criterio vigente de la CGR como
 *     una pregunta + respuesta operativa, no solo como un listado de
 *     dictámenes.
 *   - Facilita la búsqueda por pregunta jurídica (en lugar de materia).
 *   - La respuesta sintética (respuesta_sintetica) resume el criterio
 *     vigente según el dictamen_rector del régimen.
 *
 * Nomenclatura:
 *   "jurisprudencial" en todo — la CGR emite jurisprudencia
 *   administrativa, no doctrina académica.
 */

import type { Env } from '../types';
import { logInfo, logError, logWarn } from './log';
import {
  selectProviderApiKey,
  recordProviderApiKeySuccess,
  recordProviderApiKeyFailure,
} from './providerKeyPool';

// ── Constantes ────────────────────────────────────────────────────────

// Mismo modelo que usa el sistema de enrichment — ya validado via CF AI Gateway
const PJO_MODEL        = 'gemini-3.1-flash-lite-preview';
const PJO_PIPELINE_VER = '2.0.0-pjo-gemini-flash';
const PJO_TIMEOUT_MS   = 25000; // 25s — deja margen para que el Worker no expire

// Categorías jurídicas válidas para el sistema
const CATEGORIAS_VALIDAS = [
  'empleo_publico',
  'contratacion_publica',
  'urbanismo',
  'medio_ambiente',
  'finanzas_publicas',
  'probidad',
  'competencia_municipal',
  'derechos_laborales',
  'procedimiento_administrativo',
  'educacion',
  'salud',
  'otra',
] as const;

type CategoriaJuridica = typeof CATEGORIAS_VALIDAS[number];

// ── Tipos ─────────────────────────────────────────────────────────────

export interface PJOInput {
  regimenId: string;
  regimenNombre: string;
  regimenEstado: string;
  dictamenRectorId: string | null;
  normasNucleares: Array<{
    tipo_norma: string;
    numero: string | null;
    articulo: string | null;
    dictamenes_count: number;
  }>;
  timelineEventos: Array<{
    tipo_evento: string;
    fecha: string;
    descripcion: string;
  }>;
}

export interface PJORaw {
  pregunta: string;           // La pregunta jurídica operativa
  respuesta_sintetica: string; // Respuesta sintética del criterio vigente
  categoria: string;          // Categoría jurídica
  keywords: string[];         // 3-5 palabras clave jurídicas
}

// ── Prompt ────────────────────────────────────────────────────────────

function buildPJOPrompt(input: PJOInput): string {
  const normasTexto = input.normasNucleares.slice(0, 6)
    .map(n =>
      `${n.tipo_norma}${n.numero ? ` ${n.numero}` : ''}${n.articulo ? ` art.${n.articulo}` : ''} (${n.dictamenes_count} dictámenes)`
    )
    .join(', ') || 'No identificadas explícitamente';

  const timelineTexto = input.timelineEventos
    .map(t => `${t.fecha}: ${t.tipo_evento} — ${t.descripcion}`)
    .join(' | ') || 'Sin eventos de timeline registrados';

  const estadoJuridico = input.regimenEstado === 'desplazado'
    ? '⚠️ CRITERIO DESPLAZADO: este régimen ya no rige como criterio vigente. La respuesta debe reflejar que fue superado.'
    : input.regimenEstado === 'zona_litigiosa'
    ? '⚠️ CRITERIO EN LITIGIO: existe controversia en la jurisprudencia de la CGR sobre este punto.'
    : '';

  return `Eres un jurista experto en derecho administrativo chileno y en jurisprudencia de la Contraloría General de la República (CGR).

La CGR emite dictámenes que constituyen jurisprudencia administrativa vinculante para la Administración del Estado.

Se te entrega la siguiente información sobre un RÉGIMEN JURISPRUDENCIAL de la CGR:

Nombre del régimen: "${input.regimenNombre}"
Estado: ${input.regimenEstado}
${estadoJuridico}
Normas nucleares: ${normasTexto}
Evolución temporal: ${timelineTexto}

Tu tarea es:
1. Formular el PROBLEMA JURÍDICO OPERATIVO (PJO) que este régimen resuelve.
2. Dar una RESPUESTA SINTÉTICA del criterio vigente de la CGR.
3. Clasificarlo en una categoría jurídica.
4. Listar 3-5 palabras clave jurídicas.

Reglas para la PREGUNTA (PJO):
- Debe ser CONCRETA y OPERATIVA (no abstracta ni académica)
- Formulada como un dilema real que enfrenta la Administración o un ciudadano
- En segunda o tercera persona ("¿Puede la Administración...?", "¿Corresponde...?", "¿Es posible...?")
- Entre 20 y 70 palabras
- Tiene que tener respuesta definida según el criterio de la CGR

Reglas para la RESPUESTA SINTÉTICA:
- Resume el criterio vigente de la CGR en 1-2 oraciones
- Debe responder directamente la pregunta formulada
- Si el estado es 'desplazado', indicar que el criterio fue superado y cuál es el nuevo criterio si se conoce
- No citar números de dictamen — solo el criterio jurídico

Categorías válidas: ${CATEGORIAS_VALIDAS.join(', ')}

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin explicaciones):
{
  "pregunta": "¿...?",
  "respuesta_sintetica": "La CGR ha establecido que...",
  "categoria": "empleo_publico",
  "keywords": ["contrata", "renovación", "confianza legítima", "funcionario", "administración"]
}`;
}

// ── Llamada a Gemini ──────────────────────────────────────────────────

/**
 * Llama a Gemini para extraer el PJO de un régimen.
 * Reutiliza el pool de keys y el mecanismo de reintentos del sistema.
 */
export async function callGeminiForPJO(
  env: Env,
  prompt: string
): Promise<{ result: PJORaw | null; error?: string }> {
  const baseUrl = env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com';
  const maxAttempts = 3;
  let attempts = 0;
  let delay = 2000;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.CF_AIG_AUTHORIZATION) {
    headers['cf-aig-authorization'] = env.CF_AIG_AUTHORIZATION;
  }

  while (attempts < maxAttempts) {
    const selection = await selectProviderApiKey(env.DB, env, 'gemini', PJO_MODEL);
    if (!selection.ok) {
      return {
        result: null,
        error: selection.reason === 'NO_KEYS' ? 'GEMINI_API_KEY_MISSING' : 'QUOTA_EXCEEDED'
      };
    }

    const url = `${baseUrl}/v1beta/models/${PJO_MODEL}:generateContent?key=${selection.apiKey}`;

    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), PJO_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 500,
              responseMimeType: 'application/json',
            }
          })
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorData: unknown = await response.json();
        if (response.status === 429) {
          await recordProviderApiKeyFailure(env.DB, env, selection, 'quota', JSON.stringify(errorData));
          attempts++;
          if (attempts < maxAttempts) continue;
          return { result: null, error: 'QUOTA_EXCEEDED' };
        }
        throw new Error(`Gemini ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json() as {
        candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
      };

      let text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      // Limpieza defensiva por si Gemini envuelve en markdown
      text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

      let parsed: PJORaw;
      try {
        parsed = JSON.parse(text) as PJORaw;
      } catch {
        throw new Error(`JSON inválido de Gemini: ${text.slice(0, 200)}`);
      }

      // Validación mínima de campos obligatorios
      if (!parsed.pregunta || !parsed.respuesta_sintetica || !parsed.categoria) {
        throw new Error(`Campos faltantes en respuesta Gemini: ${JSON.stringify(parsed)}`);
      }

      // Normalizar categoría
      if (!CATEGORIAS_VALIDAS.includes(parsed.categoria as CategoriaJuridica)) {
        logWarn('PJO_CATEGORIA_INVALIDA', { categoria: parsed.categoria, reemplazada: 'otra' });
        parsed.categoria = 'otra';
      }

      await recordProviderApiKeySuccess(env.DB, selection);
      return { result: parsed };

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const isAuth = msg.includes('api key not valid') || msg.includes('permission denied');
      if (isAuth) {
        await recordProviderApiKeyFailure(env.DB, env, selection, 'blocked', msg);
      } else {
        await recordProviderApiKeyFailure(env.DB, env, selection, 'error', msg);
      }
      logError('PJO_GEMINI_ATTEMPT_ERROR', e, { attempt: attempts + 1, model: PJO_MODEL });
      attempts++;
      if (attempts >= maxAttempts) return { result: null, error: msg };
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }

  return { result: null, error: 'MAX_ATTEMPTS_REACHED' };
}

// ── Persistencia en D1 ────────────────────────────────────────────────

/**
 * Persiste un PJO en la tabla problemas_juridicos_operativos.
 * Schema real de la tabla (migración 0009):
 *   id, regimen_id, pipeline_version, pregunta, pregunta_normalizada,
 *   estado, respuesta_sintetica, dictamen_rector_id,
 *   embedding_anchor, keywords_json, computed_at, created_at
 */
export async function persistPJO(
  db: D1Database,
  input: PJOInput,
  pjoRaw: PJORaw
): Promise<string> {
  const pjoId = `pjo-${input.regimenId.replace('regimen-', '')}`;

  // Normalizar pregunta para búsqueda (sin acentos, minúsculas)
  const preguntaNormalizada = pjoRaw.pregunta
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?]/g, '')
    .trim();

  // embedding_anchor: texto combinado para generar embedding en Fase 3
  const embeddingAnchor = `${pjoRaw.pregunta} ${pjoRaw.respuesta_sintetica}`.slice(0, 500);

  await db.prepare(`
    INSERT INTO problemas_juridicos_operativos (
      id, regimen_id, pipeline_version, pregunta, pregunta_normalizada,
      estado, respuesta_sintetica, dictamen_rector_id,
      embedding_anchor, keywords_json, computed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      pipeline_version    = excluded.pipeline_version,
      pregunta            = excluded.pregunta,
      pregunta_normalizada = excluded.pregunta_normalizada,
      estado              = excluded.estado,
      respuesta_sintetica = excluded.respuesta_sintetica,
      dictamen_rector_id  = excluded.dictamen_rector_id,
      embedding_anchor    = excluded.embedding_anchor,
      keywords_json       = excluded.keywords_json,
      computed_at         = datetime('now')
  `).bind(
    pjoId,
    input.regimenId,
    PJO_PIPELINE_VER,
    pjoRaw.pregunta,
    preguntaNormalizada,
    input.regimenEstado === 'desplazado' ? 'superado' : 'resuelto',
    pjoRaw.respuesta_sintetica,
    input.dictamenRectorId,
    embeddingAnchor,
    JSON.stringify(pjoRaw.keywords ?? [])
  ).run();

  return pjoId;
}

// ── Orquestador principal ─────────────────────────────────────────────

/**
 * Extrae y persiste el PJO de un régimen.
 * Carga los datos necesarios de D1, llama a Gemini, y persiste el resultado.
 */
export async function extractAndPersistPJO(
  env: Env,
  regimenId: string
): Promise<{ pjoId: string; pregunta: string; categoria: string } | { error: string }> {
  const db = env.DB;

  // Cargar régimen
  const regimen = await db.prepare(
    `SELECT id, nombre, estado, dictamen_rector_id
     FROM regimenes_jurisprudenciales WHERE id = ?`
  ).bind(regimenId).first<{
    id: string; nombre: string; estado: string; dictamen_rector_id: string | null;
  }>();
  if (!regimen) return { error: `Régimen '${regimenId}' no encontrado` };

  // Cargar normas nucleares (top 6)
  const normasRes = await db.prepare(
    `SELECT tipo_norma, numero, articulo, dictamenes_count
     FROM norma_regimen WHERE regimen_id = ?
     ORDER BY dictamenes_count DESC LIMIT 6`
  ).bind(regimenId).all<{
    tipo_norma: string; numero: string | null; articulo: string | null; dictamenes_count: number;
  }>();

  // Cargar timeline
  const timelineRes = await db.prepare(
    `SELECT tipo_evento, fecha, descripcion
     FROM regimen_timeline WHERE regimen_id = ?
     ORDER BY fecha ASC`
  ).bind(regimenId).all<{ tipo_evento: string; fecha: string; descripcion: string }>();

  const input: PJOInput = {
    regimenId,
    regimenNombre: regimen.nombre,
    regimenEstado: regimen.estado,
    dictamenRectorId: regimen.dictamen_rector_id,
    normasNucleares: normasRes.results ?? [],
    timelineEventos: timelineRes.results ?? [],
  };

  const prompt = buildPJOPrompt(input);
  const { result, error } = await callGeminiForPJO(env, prompt);

  if (!result) {
    logError('PJO_EXTRACT_FAILED', { regimenId, error });
    return { error: error ?? 'Error desconocido en Gemini' };
  }

  logInfo('PJO_GEMINI_OK', {
    regimenId,
    pregunta: result.pregunta.slice(0, 80),
    categoria: result.categoria,
  });

  const pjoId = await persistPJO(db, input, result);

  return {
    pjoId,
    pregunta: result.pregunta,
    categoria: result.categoria,
  };
}
