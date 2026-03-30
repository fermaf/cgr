import type { SkillDefinition } from '../types/skill';
import { createSkillMetadata } from '../types/skill';
import { executeRegisteredSkill } from '../utils/executeRegisteredSkill';
import { mapControlPlaneForFutureRouting, type IngestControlPlaneRoutingEnvelope } from '../utils/ingestControlPlaneAdapter';
import type { DecisionEvidenceKind, IngestEscalationLevel, IngestRouteDecision } from '../utils/ingestDecisioning';

interface RunbookStep {
  step: number;
  action: string;
  reason: string;
  evidenceType: DecisionEvidenceKind;
  humanReviewNeeded: boolean;
  executionScope: 'runtime_local' | 'outside_runtime';
}

interface ChecklistItem {
  scope: 'local_now' | 'external_or_human';
  item: string;
}

interface IngestControlPlaneData {
  summary: {
    surface: 'skill_ingest_control_plane';
    interfaceRole: 'primary_operator_entrypoint';
    buildingBlocks: string[];
  };
  operationalStatus: 'ready' | 'attention_needed';
  topologySnapshot: Record<string, unknown>;
  diagnosticSignals: Array<{
    source: string;
    detail: string;
    evidenceType: DecisionEvidenceKind;
  }>;
  routeDecision: IngestRouteDecision;
  recommendedRunbook: RunbookStep[];
  operatorChecklist: ChecklistItem[];
  evidenceLevels: {
    repoEvidence: number;
    derivedInference: number;
    notVerifiableYet: number;
  };
  escalationPath: {
    escalationLevel: IngestEscalationLevel;
    humanReviewNeeded: boolean;
    trigger: string;
  };
  limitations: Array<{
    kind: DecisionEvidenceKind;
    detail: string;
  }>;
  nextBestActions: string[];
  futureRoutingAdapter: IngestControlPlaneRoutingEnvelope;
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value && typeof value === 'object') ? value as Record<string, unknown> : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export const skill: SkillDefinition<Record<string, never>, IngestControlPlaneData> = {
  name: 'skill_ingest_control_plane',
  description: 'Superficie principal y unificada de ingestión en /agents para operación, triage y decisioning serializable.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute(context) {
    const startedAt = Date.now();
    const [edgeResult, triageResult, decisioningResult] = await Promise.all([
      executeRegisteredSkill(context, 'skill_ingest_edge_observability'),
      executeRegisteredSkill(context, 'skill_ingest_incident_triage'),
      executeRegisteredSkill(context, 'skill_ingest_incident_decisioning')
    ]);

    const edgeData = asRecord(edgeResult.data);
    const triageData = asRecord(triageResult.data);
    const decisionData = asRecord(decisioningResult.data);
    const topologySnapshot = asRecord(edgeData.topology);
    const detectedSignals = asArray<Record<string, unknown>>(triageData.detectedSignals);
    const evidenceBasis = asArray<Record<string, unknown>>(decisionData.evidenceBasis);
    const limitations = asArray<Record<string, unknown>>(decisionData.limitations).map((entry) => ({
      kind: String(entry.kind ?? 'derived_inference') as DecisionEvidenceKind,
      detail: String(entry.detail ?? '')
    }));

    const routeDecision = String(decisionData.routeDecision ?? 'run_local_diagnostics') as IngestRouteDecision;
    const escalationLevel = String(decisionData.escalationLevel ?? 'operator') as IngestEscalationLevel;
    const humanReviewNeeded = Boolean(decisionData.humanReviewNeeded);
    const confidenceLevel = String(decisionData.confidenceLevel ?? 'low') as 'medium' | 'low';
    const recommendedPrimaryAction = String(decisionData.recommendedNextAction ?? 'Revisar triage estructural.');
    const operationalStatus = routeDecision === 'observe_only' ? 'ready' : 'attention_needed';

    const recommendedRunbook: RunbookStep[] = [
      {
        step: 1,
        action: 'Verificar configuración local visible',
        reason: 'Confirmar ENVIRONMENT, CGR_BASE_URL y bindings declarados antes de profundizar.',
        evidenceType: 'repo_evidence',
        humanReviewNeeded: false,
        executionScope: 'runtime_local'
      },
      {
        step: 2,
        action: 'Revisar wiring de workflows',
        reason: 'Descartar inconsistencia estructural entre wrangler.jsonc, src/index.ts y src/workflows.',
        evidenceType: 'repo_evidence',
        humanReviewNeeded: false,
        executionScope: 'runtime_local'
      },
      {
        step: 3,
        action: routeDecision === 'inspect_external_dependency' ? 'Inspeccionar boundary externa' : 'Seguir la decisión operativa principal',
        reason: String(decisionData.decisionReason ?? 'Usar la decisión operativa actual como guía principal.'),
        evidenceType: routeDecision === 'inspect_external_dependency' ? 'derived_inference' : 'repo_evidence',
        humanReviewNeeded,
        executionScope: routeDecision === 'inspect_external_dependency' ? 'outside_runtime' : 'runtime_local'
      },
      {
        step: 4,
        action: 'Escalar a revisión humana si la evidencia sigue insuficiente',
        reason: 'No prometer incidentes reales ni estado vivo cuando la evidencia disponible no alcanza.',
        evidenceType: 'not_verifiable_yet',
        humanReviewNeeded: true,
        executionScope: 'outside_runtime'
      }
    ];

    const operatorChecklist: ChecklistItem[] = [
      {
        scope: 'local_now',
        item: 'Ejecutar `agents:ingest:edge` y `agents:ingest:triage` si aún no se dispone de contexto reciente.'
      },
      {
        scope: 'local_now',
        item: 'Usar `routeDecision` y `recommendedRunbook` como guía única de la siguiente acción local.'
      },
      {
        scope: 'external_or_human',
        item: 'Si la decisión cae en `inspect_external_dependency` o `humanReviewNeeded=true`, contrastar el problema fuera del runtime local.'
      }
    ];

    const evidenceKinds = evidenceBasis.map((entry) => String(entry.kind ?? 'derived_inference') as DecisionEvidenceKind);
    const evidenceLevels = {
      repoEvidence: evidenceKinds.filter((kind) => kind === 'repo_evidence').length,
      derivedInference: evidenceKinds.filter((kind) => kind === 'derived_inference').length,
      notVerifiableYet: evidenceKinds.filter((kind) => kind === 'not_verifiable_yet').length
    };

    const futureRoutingAdapter = mapControlPlaneForFutureRouting({
      operationalStatus,
      routeDecision,
      escalationLevel,
      humanReviewNeeded,
      confidenceLevel,
      evidenceKinds,
      recommendedPrimaryAction,
      incidentRoutingBridge: asRecord(decisionData.futureIncidentRoutingCompatibility) as unknown as IngestControlPlaneRoutingEnvelope['incidentRoutingBridge']
    });

    const diagnosticSignals = detectedSignals.map((signal) => ({
      source: String(signal.sourceSkill ?? 'unknown'),
      detail: String(signal.detail ?? ''),
      evidenceType: String(signal.kind ?? 'derived_inference') as DecisionEvidenceKind
    }));

    const nextBestActions = [
      recommendedPrimaryAction,
      'Usar `skill_ingest_control_plane` como punto único de entrada para operadores humanos.',
      'Reservar las skills subyacentes como building blocks internos o para depuración profunda.'
    ];

    context.telemetry.record({
      name: 'skill_ingest_control_plane.completed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        routeDecision,
        escalationLevel,
        humanReviewNeeded,
        operationalStatus
      }
    });

    return {
      status: 'success',
      data: {
        summary: {
          surface: 'skill_ingest_control_plane',
          interfaceRole: 'primary_operator_entrypoint',
          buildingBlocks: [
            'skill_ingest_edge_observability',
            'skill_ingest_incident_triage',
            'skill_ingest_incident_decisioning'
          ]
        },
        operationalStatus,
        topologySnapshot,
        diagnosticSignals,
        routeDecision,
        recommendedRunbook,
        operatorChecklist,
        evidenceLevels,
        escalationPath: {
          escalationLevel,
          humanReviewNeeded,
          trigger: String(decisionData.decisionReason ?? 'Decisioning operacional actual.')
        },
        limitations,
        nextBestActions,
        futureRoutingAdapter
      },
      metadata: createSkillMetadata(
        'skill_ingest_control_plane',
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
