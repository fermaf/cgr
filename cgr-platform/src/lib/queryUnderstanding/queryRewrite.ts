import OpenAI from 'openai';
import { queryRecords } from '../../clients/pinecone';
import { logDebug, logError } from '../log';
import type { Env } from '../../types';

type SearchMatch = { id: string; score?: number; metadata?: Record<string, unknown> };

const QUERY_REWRITE_MODEL = 'mistral-large-2411';
const QUERY_REWRITE_TIMEOUT_MS = 3500;

export type QueryRewriteDecision = {
  originalQuery: string;
  normalizedQuery: string;
  rewrittenQuery: string | null;
  accepted: boolean;
  discardReason: string | null;
  confidence: number;
  model: string;
  durationMs: number;
};

type QueryUnderstandingResult = {
  matches: SearchMatch[];
  rewrite: QueryRewriteDecision;
};

function getMistralClient(env: Env) {
  const headers: Record<string, string> = {};
  if (env.CF_AIG_AUTHORIZATION) {
    headers['cf-aig-authorization'] = env.CF_AIG_AUTHORIZATION;
  }

  return new OpenAI({
    apiKey: env.MISTRAL_API_KEY,
    baseURL: env.MISTRAL_API_URL,
    defaultHeaders: headers
  });
}

export function normalizeQueryLight(query: string): string {
  return query
    .normalize('NFC')
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return [...new Set(
    normalizeForComparison(value)
      .split(' ')
      .map((token) => token.trim())
      .filter(Boolean)
  )];
}

function editDistanceWithin(a: string, b: string, maxDistance: number): boolean {
  if (Math.abs(a.length - b.length) > maxDistance) return false;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => (
    row === 0 ? col : col === 0 ? row : 0
  )));

  for (let row = 1; row < rows; row += 1) {
    let rowMin = Number.MAX_SAFE_INTEGER;
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      dp[row][col] = Math.min(
        dp[row - 1][col] + 1,
        dp[row][col - 1] + 1,
        dp[row - 1][col - 1] + cost
      );
      rowMin = Math.min(rowMin, dp[row][col]);
    }
    if (rowMin > maxDistance) return false;
  }

  return dp[a.length][b.length] <= maxDistance;
}

function tokenPreserved(originalToken: string, rewrittenTokens: string[]): boolean {
  return rewrittenTokens.some((candidate) => (
    candidate === originalToken
    || candidate.includes(originalToken)
    || originalToken.includes(candidate)
    || editDistanceWithin(originalToken, candidate, originalToken.length >= 8 ? 3 : 2)
  ));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildRewritePrompt(query: string): string {
  return [
    'Corrige y normaliza una consulta breve para búsqueda jurídica administrativa chilena.',
    'Debes preservar exactamente la intención original.',
    'Puedes corregir ortografía, expandir abreviaciones y volver la consulta un poco más clara.',
    'No inventes hechos.',
    'No agregues normas no mencionadas.',
    'No des explicaciones.',
    'No escribas markdown.',
    'No hagas análisis jurídico.',
    'Entrega una sola línea de texto.',
    '',
    `Consulta original: ${query}`,
    '',
    'Consulta reescrita:'
  ].join('\n');
}

function sanitizeRewriteOutput(value: string): string {
  return value
    .replace(/```/g, ' ')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .split('\n')[0]
    .replace(/\s+/g, ' ')
    .trim();
}

function assessRewrite(originalQuery: string, rewrittenQuery: string) {
  const originalTokens = tokenize(originalQuery);
  const rewrittenTokens = tokenize(rewrittenQuery);

  if (rewrittenTokens.length === 0) {
    return { accepted: false, reason: 'empty_rewrite', confidence: 0 };
  }

  const preservedTokens = originalTokens.filter((token) => token.length >= 4 || /\d/.test(token));
  const preservedCount = preservedTokens.filter((token) => tokenPreserved(token, rewrittenTokens)).length;
  const retainedRatio = preservedTokens.length > 0 ? preservedCount / preservedTokens.length : 1;
  const overlapRatio = originalTokens.length > 0
    ? originalTokens.filter((token) => tokenPreserved(token, rewrittenTokens)).length / originalTokens.length
    : 1;

  const lengthRatio = rewrittenTokens.length / Math.max(originalTokens.length, 1);
  const radicalLengthChange = lengthRatio > 3.2 || lengthRatio < 0.45;
  const missingNumericToken = originalTokens.some((token) => /\d/.test(token) && !tokenPreserved(token, rewrittenTokens));
  const missingKeyToken = preservedTokens.some((token) => token.length >= 7 && !tokenPreserved(token, rewrittenTokens));

  const newConceptCount = rewrittenTokens.filter((token) => !tokenPreserved(token, originalTokens)).length;
  const tooManyNewConcepts = newConceptCount > Math.max(5, originalTokens.length + 2) && retainedRatio < 0.8;

  if (radicalLengthChange) {
    return { accepted: false, reason: 'radical_length_change', confidence: roundScore(retainedRatio) };
  }
  if (missingNumericToken) {
    return { accepted: false, reason: 'missing_numeric_token', confidence: roundScore(retainedRatio) };
  }
  if (missingKeyToken && retainedRatio < 0.75) {
    return { accepted: false, reason: 'missing_key_terms', confidence: roundScore(retainedRatio) };
  }
  if (retainedRatio < 0.55) {
    return { accepted: false, reason: 'low_term_retention', confidence: roundScore(retainedRatio) };
  }
  if (tooManyNewConcepts) {
    return { accepted: false, reason: 'too_many_new_concepts', confidence: roundScore(retainedRatio) };
  }

  const confidence = roundScore(clamp01(
    (retainedRatio * 0.55)
    + (overlapRatio * 0.25)
    + ((1 - Math.min(Math.abs(1 - Math.min(lengthRatio, 2)), 1)) * 0.2)
  ));

  return { accepted: true, reason: null, confidence };
}

export async function rewriteQueryWithLLM(env: Env, query: string): Promise<QueryRewriteDecision> {
  const normalizedQuery = normalizeQueryLight(query);
  const startedAt = Date.now();

  if (!normalizedQuery || normalizedQuery.length < 4) {
    return {
      originalQuery: query,
      normalizedQuery,
      rewrittenQuery: null,
      accepted: false,
      discardReason: 'query_too_short',
      confidence: 0,
      model: QUERY_REWRITE_MODEL,
      durationMs: Date.now() - startedAt
    };
  }

  const client = getMistralClient(env);

  try {
    const completionPromise = client.chat.completions.create({
      model: QUERY_REWRITE_MODEL,
      messages: [{ role: 'user', content: buildRewritePrompt(normalizedQuery) }],
      temperature: 0.1,
      top_p: 0.8,
      max_tokens: 48
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('QUERY_REWRITE_TIMEOUT')), QUERY_REWRITE_TIMEOUT_MS);
    });

    const response = await Promise.race([completionPromise, timeoutPromise]);
    const contentRaw = response.choices?.[0]?.message?.content;
    const content = typeof contentRaw === 'string' ? contentRaw : '';
    const rewrittenQuery = sanitizeRewriteOutput(content);

    if (!rewrittenQuery) {
      return {
        originalQuery: query,
        normalizedQuery,
        rewrittenQuery: null,
        accepted: false,
        discardReason: 'empty_rewrite',
        confidence: 0,
        model: QUERY_REWRITE_MODEL,
        durationMs: Date.now() - startedAt
      };
    }

    const normalizedRewrite = normalizeQueryLight(rewrittenQuery);
    if (normalizeForComparison(normalizedRewrite) === normalizeForComparison(normalizedQuery)) {
      return {
        originalQuery: query,
        normalizedQuery,
        rewrittenQuery: normalizedRewrite,
        accepted: false,
        discardReason: 'rewrite_equivalent',
        confidence: 1,
        model: QUERY_REWRITE_MODEL,
        durationMs: Date.now() - startedAt
      };
    }

    const assessment = assessRewrite(normalizedQuery, normalizedRewrite);

    return {
      originalQuery: query,
      normalizedQuery,
      rewrittenQuery: normalizedRewrite,
      accepted: assessment.accepted,
      discardReason: assessment.reason,
      confidence: assessment.confidence,
      model: QUERY_REWRITE_MODEL,
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    logError('QUERY_REWRITE_LLM_ERROR', error, { model: QUERY_REWRITE_MODEL });
    return {
      originalQuery: query,
      normalizedQuery,
      rewrittenQuery: null,
      accepted: false,
      discardReason: 'rewrite_failed',
      confidence: 0,
      model: QUERY_REWRITE_MODEL,
      durationMs: Date.now() - startedAt
    };
  }
}

function mergeSemanticMatches(originalMatches: SearchMatch[], rewrittenMatches: SearchMatch[]): SearchMatch[] {
  const originalMax = Math.max(...originalMatches.map((match) => Number(match.score ?? 0)), 0.0001);
  const rewriteMax = Math.max(...rewrittenMatches.map((match) => Number(match.score ?? 0)), 0.0001);

  const merged = new Map<string, {
    id: string;
    metadata?: Record<string, unknown>;
    originalNormalized: number;
    rewrittenNormalized: number;
    originalRank: number;
    rewrittenRank: number;
  }>();

  originalMatches.forEach((match, index) => {
    merged.set(match.id, {
      id: match.id,
      metadata: match.metadata,
      originalNormalized: Number(match.score ?? 0) / originalMax,
      rewrittenNormalized: 0,
      originalRank: index,
      rewrittenRank: Number.MAX_SAFE_INTEGER
    });
  });

  rewrittenMatches.forEach((match, index) => {
    const existing = merged.get(match.id);
    if (existing) {
      existing.rewrittenNormalized = Number(match.score ?? 0) / rewriteMax;
      existing.rewrittenRank = index;
      existing.metadata = existing.metadata ?? match.metadata;
      return;
    }

    merged.set(match.id, {
      id: match.id,
      metadata: match.metadata,
      originalNormalized: 0,
      rewrittenNormalized: Number(match.score ?? 0) / rewriteMax,
      originalRank: Number.MAX_SAFE_INTEGER,
      rewrittenRank: index
    });
  });

  return [...merged.values()]
    .map((entry) => {
      const bothQueries = entry.originalNormalized > 0 && entry.rewrittenNormalized > 0;
      const mergedScore = Math.max(
        entry.originalNormalized,
        entry.rewrittenNormalized * 0.93
      )
        + (bothQueries ? 0.08 : 0)
        + (entry.originalRank === 0 ? 0.04 : 0);

      return {
        id: entry.id,
        metadata: entry.metadata,
        score: roundScore(mergedScore)
      };
    })
    .sort((left, right) => (
      Number(right.score ?? 0) - Number(left.score ?? 0)
      || left.id.localeCompare(right.id)
    ));
}

export async function retrieveDoctrineMatchesWithQueryUnderstanding(
  env: Env,
  query: string,
  limit: number
): Promise<QueryUnderstandingResult> {
  const normalizedQuery = normalizeQueryLight(query);
  const rewrite = await rewriteQueryWithLLM(env, normalizedQuery);

  const originalSearch = await queryRecords(env, normalizedQuery, limit);
  const originalMatches = (originalSearch.matches ?? []) as SearchMatch[];

  let matches = originalMatches;

  if (rewrite.accepted && rewrite.rewrittenQuery) {
    try {
      const rewrittenSearch = await queryRecords(env, rewrite.rewrittenQuery, limit);
      const rewrittenMatches = (rewrittenSearch.matches ?? []) as SearchMatch[];
      matches = mergeSemanticMatches(originalMatches, rewrittenMatches);
    } catch (error) {
      logError('QUERY_REWRITE_DUAL_RETRIEVAL_ERROR', error, {
        originalQuery: query,
        rewrittenQuery: rewrite.rewrittenQuery
      });
    }
  }

  logDebug('QUERY_REWRITE_TRACE', {
    originalQuery: query,
    normalizedQuery,
    rewrittenQuery: rewrite.rewrittenQuery,
    accepted: rewrite.accepted,
    discardReason: rewrite.discardReason,
    confidence: rewrite.confidence,
    model: rewrite.model,
    durationMs: rewrite.durationMs,
    originalHits: originalMatches.length,
    mergedHits: matches.length
  });

  return { matches, rewrite };
}
