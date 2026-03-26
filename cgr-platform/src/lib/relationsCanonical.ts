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

const ACTION_MARKER_REGEX = /\b(?:se\s+)?(?:aplica(?:n)?|confirma(?:n)?|complementa(?:n)?|aclara(?:n)?|reconsidera(?:n)?|reactiva(?:n)?|altera(?:n)?)\b/gi;
const REF_REGEX = /\b(E?\d{1,6})\s*\/\s*(\d{2,4})\b/gi;
const HREF_REGEX = /dictamenes\/([A-Z]?\d{6}N\d{2})\/html/gi;
const PLAIN_ID_REGEX = /\b([A-Z]?\d{6}N)\b/g;
const YEAR_LINE_REGEX = /\b(\d{2,4})\b/;

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
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cellToLines(html: string): string[] {
  return decodeHtml(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/a>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function detectAction(text: string): CanonicalRelationAction | null {
  const trimmed = text.trim();
  for (const pattern of ACTION_PATTERNS) {
    if (pattern.regex.test(trimmed)) return pattern.accion;
  }
  return null;
}

function splitActionSegments(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const indices: number[] = [];
  for (const match of normalized.matchAll(ACTION_MARKER_REGEX)) {
    if (typeof match.index === 'number') indices.push(match.index);
  }

  if (indices.length <= 1) return [normalized];

  const segments: string[] = [];
  for (let i = 0; i < indices.length; i += 1) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : normalized.length;
    const segment = normalized.slice(start, end).replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, '').trim();
    if (segment) segments.push(segment);
  }
  return segments;
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
  const segments = splitActionSegments(text);
  return segments.flatMap((segment) => {
    const accion = detectAction(segment);
    if (!accion) return [];
    return parseReferences(segment).map((ref) => ({
      accion,
      ...ref,
      evidence_channel: channel,
      evidence_text: segment.slice(0, 500)
    }));
  });
}

function extractFromAccionHtmlRows(rawHtml: string): CanonicalRelationCandidate[] {
  const rows = [...rawHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const candidates: CanonicalRelationCandidate[] = [];

  for (const rowMatch of rows.slice(1)) {
    const rowHtml = rowMatch[1];
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 3) continue;

    const actionLines = cellToLines(cells[0]);
    const dictamenLines = cellToLines(cells[1]);
    const yearLines = cellToLines(cells[2]);
    const hrefRefs = parseHrefReferences(cells[1]);
    const rowLength = Math.max(actionLines.length, dictamenLines.length, yearLines.length, hrefRefs.length);

    for (let index = 0; index < rowLength; index += 1) {
      const accion = detectAction(actionLines[index] || actionLines[0] || '');
      if (!accion) continue;

      let numeroDestino: string | null = null;
      let anioDestino: string | null = null;
      const hrefRef = hrefRefs[index];
      if (hrefRef) {
        numeroDestino = hrefRef.numero_destino;
        anioDestino = hrefRef.anio_destino;
      } else {
        const dictamenLine = dictamenLines[index] || '';
        const idMatch = [...dictamenLine.matchAll(PLAIN_ID_REGEX)][0];
        const yearMatch = (yearLines[index] || '').match(YEAR_LINE_REGEX);
        if (idMatch && yearMatch) {
          numeroDestino = normalizeNumero(idMatch[1]);
          anioDestino = normalizeYear(yearMatch[1]);
        }
      }

      if (!numeroDestino || !anioDestino) continue;
      candidates.push({
        accion,
        numero_destino: numeroDestino,
        anio_destino: anioDestino,
        evidence_channel: 'accion_html',
        evidence_text: stripHtml(rowHtml).slice(0, 500)
      });
    }
  }

  return candidates;
}

function extractFromAccionHtml(source: DictamenSource): CanonicalRelationCandidate[] {
  const raw = typeof source['acción'] === 'string'
    ? source['acción']
    : typeof source.accion === 'string'
      ? source.accion
      : '';
  if (!raw) return [];
  const plain = stripHtml(raw);
  const rowCandidates = extractFromAccionHtmlRows(raw);
  const textCandidates = fromActionText(plain, 'accion_html');
  const segments = splitActionSegments(plain);
  const fallbackHrefCandidates = segments.length === 1
    ? parseHrefReferences(raw)
        .map((ref) => ({
          ...ref,
          accion: detectAction(segments[0]) as CanonicalRelationAction,
          evidence_channel: 'accion_html' as const,
          evidence_text: plain.slice(0, 500)
        }))
        .filter((candidate) => Boolean(candidate.accion))
    : [];

  return uniqueCandidates([
    ...rowCandidates,
    ...textCandidates,
    ...fallbackHrefCandidates
  ]);
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
  const segments = splitActionSegments(isAccion);
  if (segments.length !== 1 || refs.length === 0) return [];
  const accion = detectAction(segments[0]);
  if (!accion) return [];

  return refs
    .filter((ref: Record<string, unknown>) => typeof ref?.nombre === 'string' && typeof ref?.year === 'string')
    .map((ref: Record<string, unknown>) => ({
      accion,
      numero_destino: normalizeNumero(String(ref.nombre).replace(/N$/i, '')),
      anio_destino: normalizeYear(String(ref.year)),
      evidence_channel: 'dictamen_referencias',
      evidence_text: segments[0].slice(0, 500)
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
