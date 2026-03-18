import { getEncoding } from "js-tiktoken";

const encoding = getEncoding("cl100k_base");

/**
 * Estima la cantidad de tokens para un texto dado usando cl100k_base (compatible con GPT-4 y similar a lo esperado por Mistral).
 */
export function countTokens(text: string): number {
    if (!text) return 0;
    return encoding.encode(text).length;
}

// Límites técnicos reales con 5% de margen de seguridad
export const MAX_MISTRAL_TOKENS = 121600; // 95% de 128k
export const MAX_PINECONE_TOKENS = 1945;  // 95% de 2048 (Modelo llama-text-embed-v2)
