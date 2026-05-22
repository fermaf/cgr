import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type QueueRow = {
  id: number;
  etiqueta_norm: string;
  pregunta_generada: string;
  miembros_json: string;
  miembros_count: number;
};

type QueueMember = {
  dictamen_id: string;
  titulo: string | null;
  materia: string | null;
  currentness_score: number;
  doctrinal_centrality_score: number;
  combined_score: number;
};

type EvidenceRow = {
  dictamen_id: string;
  titulo: string | null;
  resumen: string | null;
  analisis: string | null;
  materia: string | null;
  criterio: string | null;
};

type CurationStatus = 'pending' | 'curated' | 'needs_expert';

type CurationProposal = {
  queue_id: number;
  etiqueta_norm: string;
  pregunta_original: string;
  pregunta_curada: string;
  score_original: number;
  score_curada: number;
  status: CurationStatus;
};

type CurationSummary = {
  total: number;
  curadas: number;
  pending: number;
  needs_expert: number;
};

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LIMIT = 20;
const STRONG_COMBINED_SCORE = 1;

const SUBJECT_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\bmunicipalidad(?:es)?\b/i, value: 'la municipalidad' },
  { pattern: /\bcontralor[ií]a(?:\s+general)?\b/i, value: 'la Contraloría' },
  { pattern: /\bcontralor general\b/i, value: 'el contralor general' },
  { pattern: /\bministerio de [a-záéíóúñ\s]+/i, value: 'el ministerio competente' },
  { pattern: /\bsubsecretar[ií]a de [a-záéíóúñ\s]+/i, value: 'la subsecretaría competente' },
  { pattern: /\bservicio(?:s)? de [a-záéíóúñ\s]+/i, value: 'el servicio competente' },
  { pattern: /\bgobierno regional(?:es)?\b/i, value: 'el gobierno regional' },
  { pattern: /\bcorporaci[oó]n municipal(?:es)?\b/i, value: 'la corporación municipal' },
  { pattern: /\balcald[ií]a\b/i, value: 'la alcaldía' },
  { pattern: /\bhospital(?:es)?\b/i, value: 'el hospital' },
  { pattern: /\buniversidad(?:es)?\b/i, value: 'la universidad' },
  { pattern: /\bempresa(?:s)? p[uú]blica(?:s)?\b/i, value: 'la empresa pública' },
];

const ACTION_PATTERNS: Array<RegExp> = [
  /\b(?:puede|podr[aá]?|debe|deber[aá]|corresponde|procede|est[aá] obligado a|est[aá] facultado para|tiene que)\s+([^.;:\n]{6,140})/i,
  /\b(?:prescribe|caduca|vence|expira)\s+([^.;:\n]{6,120})/i,
];

const CONDITION_PATTERNS: Array<RegExp> = [
  /\b(?:bajo|si|cuando|en caso de|previa|previo a|antes de|despu[eé]s de|dentro de)\s+([^.;:\n]{4,100})/i,
];

function runD1Query<T>(sql: string): T[] {
  const useLocal = process.argv.includes('--remote') ? false : true;
  const output = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'cgr-dictamenes', useLocal ? '--local' : '--remote', '--command', sql, '--json'],
    { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 32, cwd: PROJECT_ROOT }
  );

  const parsed = JSON.parse(output) as Array<{ results?: T[] }>;
  return parsed[0]?.results ?? [];
}

function sqlString(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

function normalizeForAnalysis(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lowerFirst(value: string): string {
  const trimmed = cleanText(value);
  if (!trimmed) return '';
  return trimmed[0].toLowerCase() + trimmed.slice(1);
}

function stripLeadingArticles(value: string): string {
  return value.replace(/^(?:el|la|los|las|un|una|unos|unas)\s+/i, '');
}

function cutClause(value: string): string {
  return cleanText(value)
    .replace(/\s+/g, ' ')
    .replace(/^[,:;\-]+\s*/, '')
    .replace(/\s+(?:y|o|pero|porque|si|cuando|en caso de|previa|previo a|antes de|despu[eé]s de|dentro de)\b.*$/i, '')
    .trim();
}

function hasSpecificSubject(value: string): boolean {
  return SUBJECT_PATTERNS.some(({ pattern }) => pattern.test(value));
}

function hasNormOrAmountOrTerm(value: string): boolean {
  return /\b(?:art[ií]culo|ley|decreto|n[º°]?|plazo|d[ií]as?|mes(?:es)?|a[nñ]os?|uf|\$|%|prescrib|caduc|venc|dentro de|antes de|despu[eé]s de)\b/i.test(value);
}

function specificityScore(question: string): number {
  const normalized = normalizeForAnalysis(question);
  let score = 0;

  if (hasNormOrAmountOrTerm(normalized)) score += 1;
  if (hasSpecificSubject(normalized)) score += 1;
  if (!normalized.includes('problema juridico operativo')) score += 1;
  if (cleanText(question).length <= 200) score += 1;

  return score;
}

function extractSubject(text: string, label: string): string {
  const haystack = `${label} ${text}`;
  for (const { pattern, value } of SUBJECT_PATTERNS) {
    if (pattern.test(haystack)) return value;
  }

  const fallback = cutClause(label.replace(/[_-]+/g, ' '));
  return fallback ? `el tema de ${lowerFirst(fallback)}` : 'el órgano competente';
}

function extractCondition(text: string): string {
  for (const pattern of CONDITION_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const clause = cutClause(match[1]);
      if (clause) return `bajo ${lowerFirst(clause)}`;
    }
  }

  return '';
}

function extractActionClause(text: string, label: string): string {
  const haystack = `${text} ${label}`;
  for (const pattern of ACTION_PATTERNS) {
    const match = haystack.match(pattern);
    if (match?.[1]) {
      const clause = cutClause(match[1]);
      if (clause) return lowerFirst(stripLeadingArticles(clause));
    }
  }

  const words = normalizeForAnalysis(haystack)
    .split(' ')
    .filter((word) => word.length > 3)
    .filter((word) => !['problema', 'juridico', 'operativo'].includes(word));

  return words.slice(0, 6).join(' ') || 'resolver la consulta';
}

function extractPrescriptionRight(text: string, label: string): string {
  const haystack = `${text} ${label}`;
  const match = haystack.match(/\bprescrib(?:e|ir|en|i[oó])\s+([^.;:\n]{4,120})/i);
  if (match?.[1]) {
    const clause = cutClause(match[1]);
    if (clause) return lowerFirst(stripLeadingArticles(clause));
  }

  return 'la acción o el derecho consultado';
}

function extractPrescriptionTerm(text: string): string {
  const match = text.match(/\b(?:plazo de\s+)?(\d+\s*(?:d[ií]as?|mes(?:es)?|a[nñ]os?)|\d+\s*%|\d+\s*uf|prescripci[oó]n|caducidad)\b/i);
  return match?.[1] ? cleanText(match[1]) : 'el plazo aplicable';
}

function buildQuestionFromEvidence(params: {
  label: string;
  originalQuestion: string;
  evidenceText: string;
}): string {
  const subject = extractSubject(params.evidenceText, params.label);
  const actionClause = extractActionClause(params.evidenceText, params.label);
  const condition = extractCondition(params.evidenceText);
  const isPrescription = /\b(?:prescrib|caduc|venc|expir|plazo)\b/i.test(params.evidenceText);

  if (isPrescription) {
    const right = extractPrescriptionRight(params.evidenceText, params.label);
    const term = extractPrescriptionTerm(params.evidenceText);
    return `¿Prescribe ${right} después de ${term}?`;
  }

  if (/\b(?:debe|deber[aá]|est[aá] obligado a|tiene que|obligatorio)\b/i.test(params.evidenceText)) {
    return `¿Es obligatorio ${subject} ${actionClause}${condition ? ` ${condition}` : ''}?`;
  }

  const originalHint = cleanText(params.originalQuestion);
  if (originalHint && originalHint.length < 80 && specificityScore(originalHint) >= 2) {
    return originalHint;
  }

  return `¿Puede ${subject} ${actionClause}${condition ? ` ${condition}` : ''}?`;
}

function getStrongMembersForLabel(etiquetaNorm: string, limit: number = 5): QueueMember[] {
  return runD1Query<QueueMember>(`
    SELECT
      d.id AS dictamen_id,
      COALESCE(NULLIF(TRIM(e.titulo), ''), NULLIF(TRIM(d.materia), ''), 'Sin título') AS titulo,
      d.materia,
      m.currentness_score,
      m.doctrinal_centrality_score,
      (COALESCE(m.currentness_score, 0) + COALESCE(m.doctrinal_centrality_score, 0)) AS combined_score
    FROM etiquetas_catalogo ec
    INNER JOIN dictamen_etiquetas de ON de.etiqueta_id = ec.id
    INNER JOIN dictamenes d ON d.id = de.dictamen_id
    INNER JOIN enriquecimiento e ON e.dictamen_id = d.id
    INNER JOIN dictamen_metadata_doctrinal m ON m.dictamen_id = d.id
    WHERE ec.etiqueta_norm = '${etiquetaNorm.replace(/'/g, "''")}'
      AND COALESCE(m.currentness_score, 0) >= 0.6
      AND COALESCE(m.doctrinal_centrality_score, 0) >= 0.7
    ORDER BY combined_score DESC, d.id ASC
    LIMIT ${limit}
  `);
}

function getStrongEvidence(rows: QueueMember[]): QueueMember[] {
  return rows
    .filter((row) => row.combined_score >= STRONG_COMBINED_SCORE)
    .sort((a, b) => b.combined_score - a.combined_score || a.dictamen_id.localeCompare(b.dictamen_id));
}

function createProposal(row: QueueRow): CurationProposal {
  const strongMembers = getStrongMembersForLabel(row.etiqueta_norm, 5);
  const originalQuestion = cleanText(row.pregunta_generada);
  const scoreOriginal = specificityScore(originalQuestion);

  if (strongMembers.length === 0) {
    return {
      queue_id: row.id,
      etiqueta_norm: row.etiqueta_norm,
      pregunta_original: originalQuestion,
      pregunta_curada: originalQuestion,
      score_original: scoreOriginal,
      score_curada: scoreOriginal,
      status: 'needs_expert',
    };
  }

  const evidenceText = strongMembers
    .map((member) => [
      member.titulo,
      member.materia,
    ]
      .filter((part): part is string => Boolean(cleanText(part)))
      .map((part) => cleanText(part))
      .join(' '))
    .join(' ');

  const preguntaCurada = buildQuestionFromEvidence({
    label: row.etiqueta_norm,
    originalQuestion,
    evidenceText,
  });

  const scoreCurada = specificityScore(preguntaCurada);

  const status: CurationStatus = scoreCurada <= scoreOriginal ? 'pending' : 'curated';

  return {
    queue_id: row.id,
    etiqueta_norm: row.etiqueta_norm,
    pregunta_original: originalQuestion,
    pregunta_curada: preguntaCurada,
    score_original: scoreOriginal,
    score_curada: scoreCurada,
    status: strongMembers.length === 0 ? 'needs_expert' : status,
  };
}

function loadCandidates(limit: number): QueueRow[] {
  return runD1Query<QueueRow>(`
    SELECT
      id,
      etiqueta_norm,
      pregunta_generada,
      miembros_json,
      miembros_count
    FROM pjo_review_queue
    ORDER BY miembros_count DESC, id ASC
    LIMIT ${limit}
  `);
}

function summarize(proposals: CurationProposal[]): CurationSummary {
  return {
    total: proposals.length,
    curadas: proposals.filter((proposal) => proposal.status === 'curated').length,
    pending: proposals.filter((proposal) => proposal.status === 'pending').length,
    needs_expert: proposals.filter((proposal) => proposal.status === 'needs_expert').length,
  };
}

function main(): void {
  const limitArgIndex = process.argv.findIndex((arg) => arg === '--limit');
  const limitValue = limitArgIndex >= 0 ? Number(process.argv[limitArgIndex + 1]) : DEFAULT_LIMIT;
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.floor(limitValue) : DEFAULT_LIMIT;

  const candidates = loadCandidates(limit);
  const proposals = candidates.map((candidate) => createProposal(candidate));
  const output = {
    resumen: summarize(proposals),
    propuestas: proposals,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

const invokedUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';

if (import.meta.url === invokedUrl) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[curate_pjo_questions] ${message}`);
    process.exitCode = 1;
  }
}
