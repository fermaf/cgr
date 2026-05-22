import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type StrongLabelRow = {
  etiqueta_norm: string;
  etiqueta_display: string;
  seeds_count: number;
  strong_seeds_count: number;
};

type LabelMemberRow = {
  etiqueta_norm: string;
  dictamen_id: string;
  titulo: string | null;
  materia: string | null;
  currentness_score: number | null;
  doctrinal_centrality_score: number | null;
  combined_score: number | null;
  regimen_id: string | null;
  regimen_nombre: string | null;
  regimen_estado: string | null;
  regimen_confianza: number | null;
  regimen_rector_id: string | null;
};

type RegimenCandidate = {
  regimen_id: string;
  regimen_nombre: string | null;
  regimen_estado: string | null;
  regimen_confianza: number;
  regimen_rector_id: string | null;
  member_count: number;
  strong_member_count: number;
  best_member_score: number;
};

type PJOReviewProposal = {
  etiqueta_norm: string;
  etiqueta_display: string;
  pregunta_generada: string;
  respuesta_sintetica: string | null;
  pjo_id: string | null;
  regimen_id: string | null;
  regimen_nombre: string | null;
  regimen_estado: string | null;
  dictamen_rector_id: string;
  miembros_json: Array<{
    dictamen_id: string;
    titulo: string | null;
    materia: string | null;
    currentness_score: number;
    doctrinal_centrality_score: number;
    combined_score: number;
    regimen_id: string | null;
    regimen_nombre: string | null;
    regimen_estado: string | null;
    regimen_confianza: number | null;
  }>;
  miembros_count: number;
  audit_status: 'auto_approved' | 'needs_review';
  audit_reason: string;
};

const MIN_LABEL_SEEDS = 100;
const MIN_AUTO_APPROVE_MEMBERS = 3;
const STRONG_CURRENTNESS_THRESHOLD = 0.6;
const STRONG_CENTRALITY_THRESHOLD = 0.7;
const PIPELINE_VERSION = 'pjo-scaling-phase2';
const REVIEW_SOURCE_TAG = 'source=pjo-scaling-phase2';
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_OUTPUT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'pjo_seeds_generated.sql');

const GENERIC_LABEL_PATTERNS = [
  /^otros?$/i,
  /^general(es)?$/i,
  /^varios?$/i,
  /^miscel[aá]neos?$/i,
  /^sin clasificar$/i,
  /^sin categor[ií]a$/i,
  /^sin materia$/i,
  /^materia(s)?$/i,
  /^tema(s)?$/i,
  /^diverso(s)?$/i,
];

function runD1Query<T>(sql: string): T[] {
  const remoteFlag = process.argv.includes('--local') ? '--local' : '--remote';
  const output = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'cgr-dictamenes', remoteFlag, '--command', sql, '--json'],
    { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 32, cwd: PROJECT_ROOT }
  );

  const parsed = JSON.parse(output) as Array<{ results?: T[] }>;
  return parsed[0]?.results ?? [];
}

function isGenericLabel(label: string): boolean {
  const normalized = label.trim();
  if (normalized.length < 4) return true;
  return GENERIC_LABEL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function buildGeneratedQuestion(label: string): string {
  const cleaned = label
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^sobre\s+/i, '')
    .replace(/^de\s+/i, '')
    .replace(/^en\s+/i, '');

  if (!cleaned) {
    return '¿Cuál es el problema jurídico operativo dominante que debe resolverse?';
  }

  return `¿Cuál es el problema jurídico operativo dominante sobre ${cleaned.toLowerCase()}?`;
}

function normalizeQuestion(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sqlString(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

function extractKeywords(...parts: Array<string | null | undefined>): string[] {
  const stopwords = new Set([
    'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'por', 'para', 'con', 'sin',
    'sobre', 'un', 'una', 'unos', 'unas', 'al', 'se', 'su', 'sus', 'que', 'o', 'e'
  ]);

  const tokens = parts
    .filter((part): part is string => Boolean(part))
    .flatMap((part) => part
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length >= 4 && !stopwords.has(token))
    );

  return Array.from(new Set(tokens)).slice(0, 8);
}

function buildResponseSummary(label: string, rectorId: string, members: number): string {
  return `Propuesta de PJO para ${label}. Rector sugerido: ${rectorId}. Miembros fuertes considerados: ${members}.`;
}

function buildPjoId(regimenId: string): string {
  return `pjo-${regimenId.replace(/^regimen-/, '')}`;
}

function loadStrongLabels(): StrongLabelRow[] {
  return runD1Query<StrongLabelRow>(`
    WITH etiqueta_base AS (
      SELECT
        ec.etiqueta_norm,
        ec.etiqueta_display,
        COUNT(DISTINCT de.dictamen_id) AS seeds_count,
        SUM(
          CASE
            WHEN COALESCE(m.currentness_score, 0) >= ${STRONG_CURRENTNESS_THRESHOLD}
             AND COALESCE(m.doctrinal_centrality_score, 0) >= ${STRONG_CENTRALITY_THRESHOLD}
            THEN 1 ELSE 0
          END
        ) AS strong_seeds_count
      FROM etiquetas_catalogo ec
      INNER JOIN dictamen_etiquetas de ON de.etiqueta_id = ec.id
      INNER JOIN dictamen_metadata_doctrinal m ON m.dictamen_id = de.dictamen_id
      WHERE ec.status = 'active'
      GROUP BY ec.id, ec.etiqueta_norm, ec.etiqueta_display
      HAVING COUNT(DISTINCT de.dictamen_id) >= ${MIN_LABEL_SEEDS}
    )
    SELECT etiqueta_norm, etiqueta_display, seeds_count, strong_seeds_count
    FROM etiqueta_base
    ORDER BY strong_seeds_count DESC, seeds_count DESC, etiqueta_norm ASC
  `);
}

function loadMembersForLabel(etiquetaNorm: string): LabelMemberRow[] {
  return runD1Query<LabelMemberRow>(`
    SELECT
      ec.etiqueta_norm,
      d.id AS dictamen_id,
      e.titulo,
      d.materia,
      m.currentness_score,
      m.doctrinal_centrality_score,
      (COALESCE(m.currentness_score, 0) + COALESCE(m.doctrinal_centrality_score, 0)) AS combined_score,
      rd.regimen_id,
      r.nombre AS regimen_nombre,
      r.estado AS regimen_estado,
      r.confianza AS regimen_confianza,
      r.dictamen_rector_id AS regimen_rector_id
    FROM etiquetas_catalogo ec
    INNER JOIN dictamen_etiquetas de ON de.etiqueta_id = ec.id
    INNER JOIN dictamenes d ON d.id = de.dictamen_id
    INNER JOIN enriquecimiento e ON e.dictamen_id = d.id
    INNER JOIN dictamen_metadata_doctrinal m ON m.dictamen_id = d.id
    LEFT JOIN regimen_dictamenes rd ON rd.dictamen_id = d.id
    LEFT JOIN regimenes_jurisprudenciales r ON r.id = rd.regimen_id
    WHERE ec.etiqueta_norm = '${etiquetaNorm.replace(/'/g, "''")}'
    ORDER BY combined_score DESC, m.doctrinal_centrality_score DESC, m.currentness_score DESC, d.id ASC, rd.regimen_id ASC
  `);
}

function chooseRegimen(members: LabelMemberRow[]): RegimenCandidate | null {
  const grouped = new Map<string, RegimenCandidate>();

  for (const member of members) {
    if (!member.regimen_id) continue;

    const current = grouped.get(member.regimen_id) ?? {
      regimen_id: member.regimen_id,
      regimen_nombre: member.regimen_nombre,
      regimen_estado: member.regimen_estado,
      regimen_confianza: Number(member.regimen_confianza ?? 0),
      regimen_rector_id: member.regimen_rector_id,
      member_count: 0,
      strong_member_count: 0,
      best_member_score: 0,
    };

    const score = Number(member.combined_score ?? 0);
    current.member_count += 1;
    current.best_member_score = Math.max(current.best_member_score, score);
    if (
      Number(member.currentness_score ?? 0) >= STRONG_CURRENTNESS_THRESHOLD &&
      Number(member.doctrinal_centrality_score ?? 0) >= STRONG_CENTRALITY_THRESHOLD
    ) {
      current.strong_member_count += 1;
    }

    grouped.set(member.regimen_id, current);
  }

  const ranked = [...grouped.values()].sort((a, b) =>
    b.strong_member_count - a.strong_member_count ||
    b.member_count - a.member_count ||
    b.regimen_confianza - a.regimen_confianza ||
    b.best_member_score - a.best_member_score ||
    a.regimen_id.localeCompare(b.regimen_id)
  );

  return ranked[0] ?? null;
}

function chooseRectorId(members: PJOReviewProposal['miembros_json'], regimen: RegimenCandidate | null): string {
  const membersById = new Map(members.map((member) => [member.dictamen_id, member]));

  if (regimen?.regimen_rector_id && membersById.has(regimen.regimen_rector_id)) {
    return regimen.regimen_rector_id;
  }

  const withinRegimen = regimen
    ? members.filter((member) => member.regimen_id === regimen.regimen_id)
    : members;

  const rector = withinRegimen[0] ?? members[0];
  if (!rector) {
    throw new Error('No se pudo determinar dictamen rector');
  }

  return rector.dictamen_id;
}

function toProposal(labelRow: StrongLabelRow, members: LabelMemberRow[]): PJOReviewProposal {
  const orderedMembers = members.map((member) => ({
    dictamen_id: member.dictamen_id,
    titulo: member.titulo,
    materia: member.materia,
    currentness_score: Number(member.currentness_score ?? 0),
    doctrinal_centrality_score: Number(member.doctrinal_centrality_score ?? 0),
    combined_score: Number(member.combined_score ?? 0),
    regimen_id: member.regimen_id,
    regimen_nombre: member.regimen_nombre,
    regimen_estado: member.regimen_estado,
    regimen_confianza: member.regimen_confianza,
  }));

  const regimen = chooseRegimen(members);
  const rectorId = chooseRectorId(orderedMembers, regimen);
  const rector = orderedMembers.find((member) => member.dictamen_id === rectorId) ?? orderedMembers[0];
  if (!rector) throw new Error(`No se pudo determinar dictamen rector para ${labelRow.etiqueta_norm}`);

  const generic = isGenericLabel(labelRow.etiqueta_norm) || isGenericLabel(labelRow.etiqueta_display);
  const strongMembers = orderedMembers.filter((member) => (
    member.currentness_score >= STRONG_CURRENTNESS_THRESHOLD
    && member.doctrinal_centrality_score >= STRONG_CENTRALITY_THRESHOLD
  ));

  const regimenStateOk = !regimen?.regimen_estado || ['activo', 'en_transicion'].includes(regimen.regimen_estado);
  const autoApproved = Boolean(regimen) && regimenStateOk && strongMembers.length >= MIN_AUTO_APPROVE_MEMBERS && !generic;

  const auditStatus: PJOReviewProposal['audit_status'] =
    autoApproved ? 'auto_approved' : 'needs_review';

  const reasonParts = [
    generic ? 'etiqueta genérica' : null,
    strongMembers.length < MIN_AUTO_APPROVE_MEMBERS ? `menos de ${MIN_AUTO_APPROVE_MEMBERS} seeds fuertes` : null,
    !regimen ? 'sin régimen candidato' : null,
    regimen && !regimenStateOk ? `régimen ${regimen.regimen_estado}` : null,
    `seeds totales=${labelRow.seeds_count}`,
    `seeds fuertes=${labelRow.strong_seeds_count}`,
    regimen ? `régimen=${regimen.regimen_id}` : null,
  ].filter((part): part is string => Boolean(part));

  const pjoId = autoApproved && regimen ? buildPjoId(regimen.regimen_id) : null;
  const labelText = labelRow.etiqueta_display || labelRow.etiqueta_norm;

  return {
    etiqueta_norm: labelRow.etiqueta_norm,
    etiqueta_display: labelText,
    pregunta_generada: buildGeneratedQuestion(labelText),
    respuesta_sintetica: buildResponseSummary(labelText, rector.dictamen_id, strongMembers.length),
    pjo_id: pjoId,
    regimen_id: regimen?.regimen_id ?? null,
    regimen_nombre: regimen?.regimen_nombre ?? null,
    regimen_estado: regimen?.regimen_estado ?? null,
    dictamen_rector_id: rectorId,
    miembros_json: orderedMembers,
    miembros_count: orderedMembers.length,
    audit_status: auditStatus,
    audit_reason: reasonParts.join('; '),
  };
}

function buildPjoInsert(proposal: PJOReviewProposal): string {
  if (!proposal.pjo_id || !proposal.regimen_id) {
    throw new Error(`No se puede generar INSERT de PJO para ${proposal.etiqueta_norm} sin régimen`);
  }

  const questionNorm = normalizeQuestion(proposal.pregunta_generada);
  const keywords = extractKeywords(proposal.etiqueta_display, proposal.pregunta_generada, proposal.regimen_nombre);
  const embeddingAnchor = `${proposal.pregunta_generada} ${proposal.respuesta_sintetica ?? ''}`.trim().slice(0, 500);

  return [
    `INSERT INTO problemas_juridicos_operativos (id, regimen_id, pipeline_version, pregunta, pregunta_normalizada, estado, respuesta_sintetica, dictamen_rector_id, embedding_anchor, keywords_json, computed_at, created_at) VALUES (` +
      [
        sqlString(proposal.pjo_id),
        sqlString(proposal.regimen_id),
        sqlString(PIPELINE_VERSION),
        sqlString(proposal.pregunta_generada),
        sqlString(questionNorm),
        sqlString('resuelto'),
        sqlString(proposal.respuesta_sintetica),
        sqlString(proposal.dictamen_rector_id),
        sqlString(embeddingAnchor),
        sqlString(JSON.stringify(keywords)),
        `datetime('now')`,
        `datetime('now')`,
      ].join(', ') +
    `) ON CONFLICT(id) DO UPDATE SET regimen_id = excluded.regimen_id, pipeline_version = excluded.pipeline_version, pregunta = excluded.pregunta, pregunta_normalizada = excluded.pregunta_normalizada, estado = excluded.estado, respuesta_sintetica = excluded.respuesta_sintetica, dictamen_rector_id = excluded.dictamen_rector_id, embedding_anchor = excluded.embedding_anchor, keywords_json = excluded.keywords_json, computed_at = datetime('now');`
  ].join('\n');
}

function buildQueueInsert(proposal: PJOReviewProposal): string {
  const sourceReason = `${REVIEW_SOURCE_TAG}; ${proposal.audit_reason}`;
  return `INSERT INTO pjo_review_queue (etiqueta_norm, pregunta_generada, respuesta_sintetica, dictamen_rector_id, miembros_json, miembros_count, audit_status, audit_reason, auditor, reviewed_at) VALUES (${[
    sqlString(proposal.etiqueta_norm),
    sqlString(proposal.pregunta_generada),
    sqlString(proposal.respuesta_sintetica),
    sqlString(proposal.dictamen_rector_id),
    sqlString(JSON.stringify(proposal.miembros_json)),
    String(proposal.miembros_count),
    sqlString(proposal.audit_status),
    sqlString(sourceReason),
    sqlString('detect_pjo_seeds.ts'),
    'NULL',
  ].join(', ')});`;
}

function buildSqlFile(proposals: PJOReviewProposal[]): string {
  const statements = proposals.flatMap((proposal) => {
    const queueInsert = buildQueueInsert(proposal);
    const pjoInsert = proposal.audit_status === 'auto_approved' ? buildPjoInsert(proposal) : null;
    return pjoInsert ? [queueInsert, pjoInsert] : [queueInsert];
  });

  return [
    `-- Backfill PJO seeds generado automaticamente por detect_pjo_seeds.ts`,
    `-- Fecha: ${new Date().toISOString()}`,
    `-- Pipeline: ${PIPELINE_VERSION}`,
    `BEGIN TRANSACTION;`,
    ...statements,
    `COMMIT;`,
    ``,
  ].join('\n');
}

function main(): void {
  const labels = loadStrongLabels();
  const proposals = labels.map((labelRow) => {
    const members = loadMembersForLabel(labelRow.etiqueta_norm);
    return toProposal(labelRow, members);
  });

  const summary = {
    input_labels: labels.length,
    proposals: proposals.length,
    auto_approved: proposals.filter((proposal) => proposal.audit_status === 'auto_approved').length,
    needs_review: proposals.filter((proposal) => proposal.audit_status === 'needs_review').length,
    sql_output_path: SQL_OUTPUT_PATH,
    pipeline_version: PIPELINE_VERSION,
  };

  const output = {
    generated_at: new Date().toISOString(),
    summary,
    proposals,
  };

  writeFileSync(SQL_OUTPUT_PATH, buildSqlFile(proposals), 'utf8');

  process.stdout.write(JSON.stringify(output, null, 2));
  process.stdout.write('\n');
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
