import type { DictamenRaw, DictamenSource } from '../types';

export type CanonicalRelationAction =
  | 'aplicado'
  | 'confirmado'
  | 'complementado'
  | 'aclarado'
  | 'reconsiderado'
  | 'reactivado'
  | 'alterado';

export interface CanonicalRelationCandidate {
  accion: CanonicalRelationAction;
  numero_destino: string;
  anio_destino: string;
  evidence_channel: 'accion_html' | 'is_accion' | 'dictamen_referencias';
  evidence_text: string;
}

const ACTION_PATTERNS: Array<{ regex: RegExp; accion: CanonicalRelationAction }> = [
  { regex: /^(?:se\s+)?aplica(?:n)?\b/i, accion: 'aplicado' },
  { regex: /^(?:se\s+)?confirma(?:n)?\b/i, accion: 'confirmado' },
  { regex: /^(?:se\s+)?complementa(?:n)?\b/i, accion: 'complementado' },
  { regex: /^(?:se\s+)?aclara(?:n)?\b/i, accion: 'aclarado' },
  { regex: /^(?:se\s+)?reconsidera(?:n)?\b/i, accion: 'reconsiderado' },
  { regex: /^(?:se\s+)?reactiva(?:n)?\b/i, accion: 'reactivado' },
  { regex: /^(?:se\s+)?altera(?:n)?\b/i, accion: 'alterado' }
];

const REF_REGEX = /\b(E?\d{1,6})\s*\/\s*(\d{2,4})\b/gi;
const HREF_REGEX = /dictamenes\/([A-Z]?\d{6}N\d{2})\/html/gi;

function normalizeYear(year: string): string {
  const trimmed = year.trim();
  if (trimmed.length === 4) return trimmed;
  if (trimmed.length === 2) {
    const num = Number.parseInt(trimmed, 10);
    return Number.isFinite(num) && num > 50 ? `19${trimmed}` : `20${trimmed}`;
  }
  return trimmed;
}

function normalizeNumero(raw: string): string {
  return raw.trim().replace(/\./g, '').replace(/^0+/, '') || '0';
}

function decodeHtml(text: string): string {
  return text
    .replace(/&#x([0-9A-F]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&nbsp;/gi, ' ');
}

function stripHtml(text: string): string {
  return decodeHtml(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectAction(text: string): CanonicalRelationAction | null {
  const trimmed = text.trim();
  for (const pattern of ACTION_PATTERNS) {
    if (pattern.regex.test(trimmed)) return pattern.accion;
  }
  return null;
}

function parseReferences(text: string): Array<{ numero_destino: string; anio_destino: string }> {
  const refs: Array<{ numero_destino: string; anio_destino: string }> = [];
  for (const match of text.matchAll(REF_REGEX)) {
    refs.push({
      numero_destino: normalizeNumero(match[1]),
      anio_destino: normalizeYear(match[2])
    });
  }
  return refs;
}

function parseHrefReferences(html: string): Array<{ numero_destino: string; anio_destino: string }> {
  const refs: Array<{ numero_destino: string; anio_destino: string }> = [];
  for (const match of html.matchAll(HREF_REGEX)) {
    const token = match[1];
    const year2 = token.slice(-2);
    const numero = token.slice(0, -3);
    refs.push({
      numero_destino: normalizeNumero(numero),
      anio_destino: normalizeYear(year2)
    });
  }
  return refs;
}

function uniqueCandidates(candidates: CanonicalRelationCandidate[]): CanonicalRelationCandidate[] {
  const map = new Map<string, CanonicalRelationCandidate>();
  for (const candidate of candidates) {
    const key = [
      candidate.accion,
      candidate.numero_destino,
      candidate.anio_destino,
      candidate.evidence_channel
    ].join('|');
    if (!map.has(key)) map.set(key, candidate);
  }
  return [...map.values()];
}

function fromActionText(
  text: string,
  channel: CanonicalRelationCandidate['evidence_channel']
): CanonicalRelationCandidate[] {
  const accion = detectAction(text);
  if (!accion) return [];
  return parseReferences(text).map((ref) => ({
    accion,
    ...ref,
    evidence_channel: channel,
    evidence_text: text.slice(0, 500)
  }));
}

function extractFromAccionHtml(source: DictamenSource): CanonicalRelationCandidate[] {
  const raw = typeof source['acción'] === 'string'
    ? source['acción']
    : typeof source.accion === 'string'
      ? source.accion
      : '';
  if (!raw) return [];
  const plain = stripHtml(raw);
  const accion = detectAction(plain);
  if (!accion) return [];

  const refs = [
    ...parseHrefReferences(raw),
    ...parseReferences(plain)
  ];

  return refs.map((ref) => ({
    accion,
    ...ref,
    evidence_channel: 'accion_html',
    evidence_text: plain.slice(0, 500)
  }));
}

function extractFromIsAccion(source: DictamenSource): CanonicalRelationCandidate[] {
  const isAccion = typeof source.is_accion === 'string' ? source.is_accion : '';
  if (!isAccion) return [];
  return fromActionText(isAccion, 'is_accion');
}

function extractFromReferencias(raw: DictamenRaw): CanonicalRelationCandidate[] {
  const refs = Array.isArray((raw as Record<string, unknown>).referencias)
    ? (raw as Record<string, any>).referencias
    : [];
  const source = (raw._source ?? raw.source ?? raw.raw_data ?? raw) as DictamenSource;
  const isAccion = typeof source?.is_accion === 'string' ? source.is_accion : '';
  const accion = detectAction(isAccion);
  if (!accion || refs.length === 0) return [];

  return refs
    .filter((ref: Record<string, unknown>) => typeof ref?.nombre === 'string' && typeof ref?.year === 'string')
    .map((ref: Record<string, unknown>) => ({
      accion,
      numero_destino: normalizeNumero(String(ref.nombre).replace(/N$/i, '')),
      anio_destino: normalizeYear(String(ref.year)),
      evidence_channel: 'dictamen_referencias',
      evidence_text: isAccion.slice(0, 500)
    }));
}

export function extractCanonicalRelationCandidates(raw: DictamenRaw): CanonicalRelationCandidate[] {
  const source = raw._source ?? raw.source ?? raw.raw_data ?? raw;
  if (!source || typeof source !== 'object') return [];

  const typedSource = source as DictamenSource;

  return uniqueCandidates([
    ...extractFromAccionHtml(typedSource),
    ...extractFromIsAccion(typedSource),
    ...extractFromReferencias(raw)
  ]);
}
