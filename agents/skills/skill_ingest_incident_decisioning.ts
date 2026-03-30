import type { SkillDefinition } from '../types/skill';
import { createSkillMetadata } from '../types/skill';
import { executeRegisteredSkill } from '../utils/executeRegisteredSkill';
import {
  mapDecisionForFutureIncidentRouting,
  type DecisionEvidenceKind,
  type FutureIncidentRoutingEnvelope,
  type IngestEscalationLevel,
  type IngestRouteDecision
} from '../utils/ingestDecisioning';

interface DecisionEvidence {
  kind: DecisionEvidenceKind;
  source: string;
  detail: string;
}

interface IngestIncidentDecisioningData {
  summary: {
    decisionStatus: 'ready_for_operator_use' | 'human_attention_recommended';
    taxonomyVersion: 'v1';
  };
  routeDecision: IngestRouteDecision;
  decisionReason: string;
  recommendedNextAction: string;
  escalationLevel: IngestEscalationLevel;
  humanReviewNeeded: boolean;
  confidenceLevel: 'medium' | 'low';
  evidenceBasis: DecisionEvidence[];
  limitations: DecisionEvidence[];
  futureIncidentRoutingCompatibility: FutureIncidentRoutingEnvelope;
}

type FailureDomain = {
  domain: string;
  likelihood: 'low' | 'medium' | 'high';
  basis: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return (value && typeof value === 'object') ? value as Record<string, unknown> : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function chooseDecision(
  failureDomains: FailureDomain[],
  triageStatus: string
): {
  routeDecision: IngestRouteDecision;
  decisionReason: string;
  recommendedNextAction: string;
  escalationLevel: IngestEscalationLevel;
  humanReviewNeeded: boolean;
  confidenceLevel: 'medium' | 'low';
} {
  const configDomain = failureDomains.find((domain) => domain.domain === 'configuracion');
  const workflowDomain = failureDomains.find((domain) => domain.domain === 'workflow_wiring');
  const externalDomain = failureDomains.find((domain) => domain.domain === 'external_dependency_boundary');

  if (configDomain?.likelihood === 'high') {
    return {
      routeDecision: 'inspect_config',
      decisionReason: 'Las señales visibles apuntan a revisar configuración antes de cualquier otra hipótesis.',
      recommendedNextAction: 'Inspeccionar ENVIRONMENT, CGR_BASE_URL y bindings declarados en wrangler.jsonc y comparar contra el contexto esperado del incidente.',
      escalationLevel: 'operator',
      humanReviewNeeded: false,
      confidenceLevel: 'medium'
    };
  }

  if (workflowDomain?.likelihood === 'high') {
    return {
      routeDecision: 'inspect_workflow_wiring',
      decisionReason: 'Hay indicios estructurales de wiring o exportación de workflows que deben descartarse primero.',
      recommendedNextAction: 'Revisar exports, bindings y consistencia entre wrangler.jsonc, src/index.ts y src/workflows.',
      escalationLevel: 'operator',
      humanReviewNeeded: false,
      confidenceLevel: 'medium'
    };
  }

  if (triageStatus === 'structurally_ready' && externalDomain?.likelihood === 'medium') {
    return {
      routeDecision: 'inspect_external_dependency',
      decisionReason: 'La estructura local luce consistente; el siguiente foco prudente es el boundary externo no verificable desde este runtime.',
      recommendedNextAction: 'Tratar el caso como sospecha de dependencia externa y contrastar reachability/estado remoto fuera del runtime local.',
      escalationLevel: 'operator',
      humanReviewNeeded: true,
      confidenceLevel: 'low'
    };
  }

  if (triageStatus === 'attention_needed') {
    return {
      routeDecision: 'run_local_diagnostics',
      decisionReason: 'La evidencia actual no basta para una hipótesis única; conviene profundizar primero con diagnósticos locales y revisión humana si persiste.',
      recommendedNextAction: 'Reejecutar observabilidad y triage, revisar el dominio con mayor likelihood y preparar contexto para intervención humana si no converge.',
      escalationLevel: 'operator',
      humanReviewNeeded: true,
      confidenceLevel: 'low'
    };
  }

  return {
    routeDecision: 'observe_only',
    decisionReason: 'No hay señales estructurales de fallo local; conviene observar y conservar la ruta diagnóstica preparada.',
    recommendedNextAction: 'Mantener monitoreo estructural y usar el triage solo si aparecen señales nuevas o repetitivas.',
    escalationLevel: 'none',
    humanReviewNeeded: false,
    confidenceLevel: 'low'
  };
}

export const skill: SkillDefinition<Record<string, never>, IngestIncidentDecisioningData> = {
  name: 'skill_ingest_incident_decisioning',
  description: 'Convierte el triage estructural de ingestión en una decisión operativa clara, prudente y reusable.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute(context) {
    const startedAt = Date.now();
    const [triageResult, edgeResult] = await Promise.all([
      executeRegisteredSkill(context, 'skill_ingest_incident_triage'),
      executeRegisteredSkill(context, 'skill_ingest_edge_observability')
    ]);

    const triageData = asRecord(triageResult.data);
    const edgeData = asRecord(edgeResult.data);
    const triageSummary = asRecord(triageData.summary);
    const failureDomains = asArray<FailureDomain>(triageData.probableFailureDomains);
    const edgeSummary = asRecord(edgeData.summary);
    const triageStatus = String(triageSummary.triageStatus ?? 'attention_needed');

    const decision = chooseDecision(failureDomains, triageStatus);
    const evidenceBasis: DecisionEvidence[] = [
      {
        kind: 'repo_evidence',
        source: 'skill_ingest_incident_triage',
        detail: `triageStatus=${triageStatus}`
      },
      {
        kind: 'repo_evidence',
        source: 'skill_ingest_edge_observability',
        detail: `overallStatus=${String(edgeSummary.overallStatus ?? 'unknown')}`
      },
      {
        kind: 'derived_inference',
        source: 'skill_ingest_incident_decisioning',
        detail: decision.decisionReason
      },
      {
        kind: 'not_verifiable_yet',
        source: 'runtime-boundary',
        detail: 'El decisioning no confirma reachability real, bindings vivos ni estado de workflows en Cloudflare.'
      }
    ];

    const limitations: DecisionEvidence[] = [
      {
        kind: 'repo_evidence',
        source: 'memory-policy',
        detail: 'La memoria registra solo el evento padre de decisioning; las subskills quedan trazadas en telemetry.'
      },
      {
        kind: 'derived_inference',
        source: 'decisioning',
        detail: 'La decisión deriva de señales estructurales y rutas de triage, no de incidentes productivos confirmados.'
      },
      {
        kind: 'not_verifiable_yet',
        source: 'external-boundary',
        detail: 'No se comprueban reachability, salud remota de CGR ni ejecución viva de workflows.'
      }
    ];

    const futureIncidentRoutingCompatibility = mapDecisionForFutureIncidentRouting({
      routeDecision: decision.routeDecision,
      decisionReason: decision.decisionReason,
      escalationLevel: decision.escalationLevel,
      humanReviewNeeded: decision.humanReviewNeeded,
      confidenceLevel: decision.confidenceLevel
    });

    context.telemetry.record({
      name: 'skill_ingest_incident_decisioning.completed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        routeDecision: decision.routeDecision,
        escalationLevel: decision.escalationLevel,
        humanReviewNeeded: decision.humanReviewNeeded
      }
    });

    return {
      status: 'success',
      data: {
        summary: {
          decisionStatus: decision.humanReviewNeeded ? 'human_attention_recommended' : 'ready_for_operator_use',
          taxonomyVersion: 'v1'
        },
        routeDecision: decision.routeDecision,
        decisionReason: decision.decisionReason,
        recommendedNextAction: decision.recommendedNextAction,
        escalationLevel: decision.escalationLevel,
        humanReviewNeeded: decision.humanReviewNeeded,
        confidenceLevel: decision.confidenceLevel,
        evidenceBasis,
        limitations,
        futureIncidentRoutingCompatibility
      },
      metadata: createSkillMetadata(
        'skill_ingest_incident_decisioning',
        context.sessionId,
        'agents-native',
        Date.now() - startedAt,
        undefined,
        {
          executionLayer: 'agents-runtime',
          capabilitySource: 'native-runtime'
        }
      )
    };
  }
};
