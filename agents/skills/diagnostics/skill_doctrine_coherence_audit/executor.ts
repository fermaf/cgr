import type { SkillContext, SkillExecutionResult } from '../../../types/skill';
import { createSkillMetadata } from '../../../types/skill';
import { readWranglerConfig } from '../../../utils/wranglerConfig';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type AuditMode = 'quick' | 'standard';

export interface DoctrineCoherenceAuditInput {
  limit?: number;
  mode?: AuditMode;
  backendBaseUrl?: string;
  query?: string;
}

interface DoctrineLineResponse {
  title: string;
  representative_dictamen_id: string;
  doctrinal_state: 'consolidado' | 'en_evolucion' | 'bajo_tension';
  top_descriptores_AI?: string[];
  top_fuentes_legales?: Array<{ tipo_norma: string; numero: string | null; count: number }>;
  relation_dynamics: {
    dominant_bucket: 'consolida' | 'desarrolla' | 'ajusta' | null;
    summary: string;
  };
  coherence_signals?: {
    cluster_cohesion_score: number;
    semantic_dispersion: number;
    outlier_probability: number;
    descriptor_noise_score: number;
    fragmentation_risk: number;
    coherence_status: 'cohesiva' | 'mixta' | 'fragmentada';
    summary: string;
  };
}

interface DoctrineInsightsResponse {
  overview: {
    totalLines: number;
    materiaEvaluated: string | null;
    query?: string;
  };
  lines: DoctrineLineResponse[];
}

interface Finding {
  type: string;
  severity: Severity;
  line_title: string;
  representative_dictamen_id: string;
  evidence: Record<string, unknown>;
  recommendation: string;
}

type CandidateActionType =
  | 'suggest_split_cluster'
  | 'suggest_merge_clusters'
  | 'suggest_reassign_dictamen'
  | 'suggest_descriptor_normalization';

interface CandidateAction {
  action_type: CandidateActionType;
  confidence: number;
  rationale: string;
  affected_ids: string[];
  expected_product_impact: 'medium' | 'high';
  risk_level: 'low' | 'medium' | 'high';
}

export interface DoctrineCoherenceAuditData {
  summary: {
    checkedAt: string;
    backendBaseUrl: string;
    mode: AuditMode;
    source: 'doctrine-lines' | 'doctrine-search';
    query: string | null;
    severity: Severity;
    headline: string;
  };
  findings: Finding[];
  candidate_actions: CandidateAction[];
  stats: {
    totalLines: number;
    fragmentedLines: number;
    mixedLines: number;
    highOutlierLines: number;
  };
  severity: Severity;
  recommended_actions: string[];
}

function normalizeMode(value: unknown): AuditMode {
  return value === 'standard' ? 'standard' : 'quick';
}

function normalizeLimit(mode: AuditMode, value: unknown): number {
  const fallback = mode === 'standard' ? 8 : 4;
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(2, Math.min(10, parsed));
}

function severityRank(severity: Severity): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
}

function maxSeverity(values: Severity[]): Severity {
  if (values.length === 0) return 'low';
  return values.reduce((current, candidate) => (
    severityRank(candidate) > severityRank(current) ? candidate : current
  ), 'low');
}

async function inferBackendBaseUrl(repoRoot: string): Promise<string> {
  const wrangler = await readWranglerConfig(repoRoot);
  const configured = wrangler.config?.vars?.CGR_BASE_URL;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim();
  }
  return 'https://cgr-platform.abogado.workers.dev';
}

function buildHeadline(findings: Finding[], query: string | null): string {
  if (findings.length === 0) {
    return query
      ? `No se detectaron incoherencias doctrinales relevantes en la muestra revisada para la consulta "${query}".`
      : 'No se detectaron líneas doctrinales con incoherencia relevante en la muestra revisada.';
  }
  return query
    ? `Se detectaron ${findings.length} hallazgos de coherencia doctrinal en la consulta "${query}"; el principal afecta una línea visible para el usuario final.`
    : `Se detectaron ${findings.length} hallazgos de coherencia doctrinal; el principal afecta la representación visible de una línea activa.`;
}

function roundConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function normalizeTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > 0 ? compact : null;
}

function overlapRatio(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const shared = left.filter((item) => rightSet.has(item)).length;
  return Math.round((shared / Math.min(left.length, right.length)) * 100) / 100;
}

function descriptorKeys(line: DoctrineLineResponse): string[] {
  return (line.top_descriptores_AI ?? []).map((descriptor) => normalizeTitle(descriptor));
}

function fuenteKeys(line: DoctrineLineResponse): string[] {
  return (line.top_fuentes_legales ?? []).map((fuente) => `${normalizeTitle(fuente.tipo_norma)}::${String(fuente.numero ?? '').replace(/\./g, '')}`);
}

function buildCandidateActions(lines: DoctrineLineResponse[]): CandidateAction[] {
  const actions: CandidateAction[] = [];
  const titleGroups = new Map<string, DoctrineLineResponse[]>();

  for (const line of lines) {
    const key = normalizeTitle(line.title);
    const group = titleGroups.get(key) ?? [];
    group.push(line);
    titleGroups.set(key, group);
  }

  for (const group of titleGroups.values()) {
    if (group.length < 2) continue;

    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex];
        const right = group[rightIndex];
        const descriptorOverlap = overlapRatio(descriptorKeys(left), descriptorKeys(right));
        const fuenteOverlap = overlapRatio(fuenteKeys(left), fuenteKeys(right));
        const maxOverlap = Math.max(descriptorOverlap, fuenteOverlap);

        if (maxOverlap < 0.4) continue;

        actions.push({
          action_type: 'suggest_merge_clusters',
          confidence: roundConfidence(0.7 + (descriptorOverlap * 0.18) + (fuenteOverlap * 0.12)),
          rationale: `Las líneas "${left.title}" comparten descriptor/fuente dominante suficiente (${descriptorOverlap}/${fuenteOverlap}), por lo que parecen una fragmentación artificial de bajo riesgo.`,
          affected_ids: [left.representative_dictamen_id, right.representative_dictamen_id],
          expected_product_impact: 'high',
          risk_level: maxOverlap >= 0.55 ? 'low' : 'medium'
        });
      }
    }

    actions.push({
      action_type: 'suggest_merge_clusters',
      confidence: roundConfidence(0.64 + Math.min((group.length - 2) * 0.06, 0.12)),
      rationale: `La muestra contiene ${group.length} líneas con título prácticamente idéntico, lo que sugiere fragmentación artificial de una misma doctrina.`,
      affected_ids: group.map((line) => line.representative_dictamen_id),
      expected_product_impact: 'high',
      risk_level: 'medium'
    });
  }

  for (const line of lines) {
    const coherence = line.coherence_signals;
    if (!coherence) continue;

    if (coherence.coherence_status === 'fragmentada') {
      actions.push({
        action_type: 'suggest_split_cluster',
        confidence: roundConfidence(0.62 + coherence.fragmentation_risk * 0.25),
        rationale: 'La línea combina dispersión semántica alta, riesgo de fragmentación y bajo encaje interno suficiente para sugerir separación.',
        affected_ids: [line.representative_dictamen_id],
        expected_product_impact: 'high',
        risk_level: 'high'
      });
    }

    if (coherence.outlier_probability >= 0.22) {
      actions.push({
        action_type: 'suggest_reassign_dictamen',
        confidence: roundConfidence(0.5 + coherence.outlier_probability * 0.6),
        rationale: 'La probabilidad de outliers sugiere que uno o más dictámenes podrían pertenecer a otra línea doctrinal.',
        affected_ids: [line.representative_dictamen_id],
        expected_product_impact: 'medium',
        risk_level: 'medium'
      });
    }

    if (coherence.descriptor_noise_score >= 0.4) {
      actions.push({
        action_type: 'suggest_descriptor_normalization',
        confidence: roundConfidence(0.52 + coherence.descriptor_noise_score * 0.5),
        rationale: 'La competencia entre descriptores dominantes sugiere ruido de naming o etiquetas que degradan el label doctrinal.',
        affected_ids: [line.representative_dictamen_id],
        expected_product_impact: 'medium',
        risk_level: 'low'
      });
    }
  }

  return actions
    .sort((left, right) => right.confidence - left.confidence || left.action_type.localeCompare(right.action_type))
    .slice(0, 12);
}

export async function executeDoctrineCoherenceAudit(
  context: SkillContext,
  input: DoctrineCoherenceAuditInput = {}
): Promise<SkillExecutionResult<DoctrineCoherenceAuditData>> {
  const startedAt = Date.now();
  const mode = normalizeMode(input.mode);
  const limit = normalizeLimit(mode, input.limit);
  const query = normalizeQuery(input.query);
  const backendBaseUrl = (typeof input.backendBaseUrl === 'string' && input.backendBaseUrl.trim().length > 0)
    ? input.backendBaseUrl.trim().replace(/\/$/, '')
    : await inferBackendBaseUrl(context.repoRoot);
  const source: 'doctrine-lines' | 'doctrine-search' = query ? 'doctrine-search' : 'doctrine-lines';

  context.logger.info('DOCTRINE_COHERENCE_AUDIT_START', { mode, limit, backendBaseUrl, source, query });

  const endpoint = query
    ? `${backendBaseUrl}/api/v1/insights/doctrine-search?q=${encodeURIComponent(query)}&limit=${limit}`
    : `${backendBaseUrl}/api/v1/insights/doctrine-lines?limit=${limit}`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Doctrine coherence audit failed with HTTP ${response.status}`);
  }

  const payload = await response.json() as DoctrineInsightsResponse;
  const findings: Finding[] = [];

  for (const line of payload.lines ?? []) {
    const coherence = line.coherence_signals;
    if (!coherence) {
      findings.push({
        type: 'backend_without_coherence_signals',
        severity: 'medium',
        line_title: line.title,
        representative_dictamen_id: line.representative_dictamen_id,
        evidence: {
          doctrinal_state: line.doctrinal_state,
          relation_pattern: line.relation_dynamics?.dominant_bucket ?? null
        },
        recommendation: 'Desplegar la versión del backend que expone coherence_signals para auditar ruido doctrinal con este skill.'
      });
      continue;
    }

    if (coherence.coherence_status === 'fragmentada') {
      findings.push({
        type: 'fragmentacion_doctrinal_visible',
        severity: 'high',
        line_title: line.title,
        representative_dictamen_id: line.representative_dictamen_id,
        evidence: {
          cluster_cohesion_score: coherence.cluster_cohesion_score,
          fragmentation_risk: coherence.fragmentation_risk,
          semantic_dispersion: coherence.semantic_dispersion,
          outlier_probability: coherence.outlier_probability
        },
        recommendation: 'Revisar si la línea debe separarse o si contiene dictámenes con encaje doctrinal débil.'
      });
      continue;
    }

    if (coherence.coherence_status === 'mixta' && coherence.outlier_probability >= 0.22) {
      findings.push({
        type: 'outliers_doctrinales_probables',
        severity: 'medium',
        line_title: line.title,
        representative_dictamen_id: line.representative_dictamen_id,
        evidence: {
          outlier_probability: coherence.outlier_probability,
          descriptor_noise_score: coherence.descriptor_noise_score,
          relation_pattern: line.relation_dynamics.dominant_bucket
        },
        recommendation: 'Revisar dictámenes periféricos y naming doctrinal antes de usar esta línea como criterio estable.'
      });
    }
  }

  const fragmentedLines = (payload.lines ?? []).filter((line) => line.coherence_signals?.coherence_status === 'fragmentada').length;
  const mixedLines = (payload.lines ?? []).filter((line) => line.coherence_signals?.coherence_status === 'mixta').length;
  const highOutlierLines = (payload.lines ?? []).filter((line) => (line.coherence_signals?.outlier_probability ?? 0) >= 0.22).length;
  const candidateActions = buildCandidateActions(payload.lines ?? []);
  const severity = maxSeverity(findings.map((finding) => finding.severity));
  const recommendedActions = [...new Set([
    ...findings.map((finding) => finding.recommendation),
    ...candidateActions.map((action) => action.rationale)
  ])];

  const data: DoctrineCoherenceAuditData = {
    summary: {
      checkedAt: new Date().toISOString(),
      backendBaseUrl,
      mode,
      source,
      query,
      severity,
      headline: buildHeadline(findings, query)
    },
    findings,
    candidate_actions: candidateActions,
    stats: {
      totalLines: payload.lines?.length ?? 0,
      fragmentedLines,
      mixedLines,
      highOutlierLines
    },
    severity,
    recommended_actions: recommendedActions
  };

  return {
    status: 'success',
    data,
    metadata: createSkillMetadata(
      'skill_doctrine_coherence_audit',
      context.sessionId,
      'agents-native',
      Date.now() - startedAt
    )
  };
}
