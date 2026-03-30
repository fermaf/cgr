import type { DecisionEvidenceKind, IngestEscalationLevel, IngestRouteDecision } from './ingestDecisioning';

export interface LegacyRouteDecisionPreview {
  matched: boolean;
  skill: string;
  reason: string;
}

export interface IngestIncidentBridgeEnvelope {
  incidentType: 'ingest_operational_bridge';
  incidentScope: 'ingest';
  routeDecision: IngestRouteDecision;
  decisionReason: string;
  escalationLevel: IngestEscalationLevel;
  confidenceLevel: 'medium' | 'low';
  humanReviewNeeded: boolean;
  evidenceSummary: Array<{
    kind: DecisionEvidenceKind;
    source: string;
    detail: string;
  }>;
  recommendedPrimaryAction: string;
  recommendedSecondaryActions: string[];
  limitations: Array<{
    kind: DecisionEvidenceKind;
    detail: string;
  }>;
  compatibilityNotes: string[];
  legacyRoutingPreview: LegacyRouteDecisionPreview;
}

function mapLegacyPreview(routeDecision: IngestRouteDecision, decisionReason: string): LegacyRouteDecisionPreview {
  if (routeDecision === 'inspect_config') {
    return {
      matched: false,
      skill: '__UNMATCHED__',
      reason: 'CONTROL_PLANE_CONFIG_REVIEW_REQUIRED'
    };
  }

  if (routeDecision === 'inspect_workflow_wiring') {
    return {
      matched: false,
      skill: '__UNMATCHED__',
      reason: 'CONTROL_PLANE_WORKFLOW_WIRING_REVIEW_REQUIRED'
    };
  }

  if (routeDecision === 'inspect_external_dependency') {
    return {
      matched: false,
      skill: '__UNMATCHED__',
      reason: 'CONTROL_PLANE_EXTERNAL_DEPENDENCY_REVIEW'
    };
  }

  if (routeDecision === 'run_local_diagnostics') {
    return {
      matched: false,
      skill: '__UNMATCHED__',
      reason: 'CONTROL_PLANE_LOCAL_DIAGNOSTICS_REQUIRED'
    };
  }

  if (routeDecision === 'escalate_to_human') {
    return {
      matched: false,
      skill: '__UNMATCHED__',
      reason: 'CONTROL_PLANE_HUMAN_ESCALATION_REQUIRED'
    };
  }

  return {
    matched: false,
    skill: '__UNMATCHED__',
    reason: decisionReason ? 'CONTROL_PLANE_OBSERVE_ONLY' : 'CONTROL_PLANE_NO_DECISION'
  };
}

export function buildIngestIncidentBridgeEnvelope(input: {
  routeDecision: IngestRouteDecision;
  decisionReason: string;
  escalationLevel: IngestEscalationLevel;
  confidenceLevel: 'medium' | 'low';
  humanReviewNeeded: boolean;
  evidenceSummary: Array<{
    kind: DecisionEvidenceKind;
    source: string;
    detail: string;
  }>;
  recommendedPrimaryAction: string;
  recommendedSecondaryActions: string[];
  limitations: Array<{
    kind: DecisionEvidenceKind;
    detail: string;
  }>;
}): IngestIncidentBridgeEnvelope {
  return {
    incidentType: 'ingest_operational_bridge',
    incidentScope: 'ingest',
    routeDecision: input.routeDecision,
    decisionReason: input.decisionReason,
    escalationLevel: input.escalationLevel,
    confidenceLevel: input.confidenceLevel,
    humanReviewNeeded: input.humanReviewNeeded,
    evidenceSummary: input.evidenceSummary,
    recommendedPrimaryAction: input.recommendedPrimaryAction,
    recommendedSecondaryActions: input.recommendedSecondaryActions,
    limitations: input.limitations,
    compatibilityNotes: [
      'El bridge reutiliza la salida del control plane y la adapta a un envelope estable para incident routing futuro.',
      'routeIncident heredado espera IncidentCode y retorna RouteDecision basado en clasificación de incidente; este bridge emite una decisión operativa, no un IncidentCode.',
      'legacyRoutingPreview se entrega como preview conservador de compatibilidad y no debe interpretarse como integración productiva real.'
    ],
    legacyRoutingPreview: mapLegacyPreview(input.routeDecision, input.decisionReason)
  };
}
