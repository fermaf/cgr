import type { DecisionEvidenceKind, FutureIncidentRoutingEnvelope, IngestEscalationLevel, IngestRouteDecision } from './ingestDecisioning';

export interface IngestControlPlaneRoutingEnvelope {
  controlPlaneType: 'ingest_control_plane_snapshot';
  operationalStatus: 'ready' | 'attention_needed';
  routeDecision: IngestRouteDecision;
  escalationLevel: IngestEscalationLevel;
  humanReviewNeeded: boolean;
  confidenceLevel: 'medium' | 'low';
  evidenceKinds: DecisionEvidenceKind[];
  recommendedPrimaryAction: string;
  incidentRoutingBridge: FutureIncidentRoutingEnvelope;
}

export function mapControlPlaneForFutureRouting(input: {
  operationalStatus: 'ready' | 'attention_needed';
  routeDecision: IngestRouteDecision;
  escalationLevel: IngestEscalationLevel;
  humanReviewNeeded: boolean;
  confidenceLevel: 'medium' | 'low';
  evidenceKinds: DecisionEvidenceKind[];
  recommendedPrimaryAction: string;
  incidentRoutingBridge: FutureIncidentRoutingEnvelope;
}): IngestControlPlaneRoutingEnvelope {
  return {
    controlPlaneType: 'ingest_control_plane_snapshot',
    operationalStatus: input.operationalStatus,
    routeDecision: input.routeDecision,
    escalationLevel: input.escalationLevel,
    humanReviewNeeded: input.humanReviewNeeded,
    confidenceLevel: input.confidenceLevel,
    evidenceKinds: input.evidenceKinds,
    recommendedPrimaryAction: input.recommendedPrimaryAction,
    incidentRoutingBridge: input.incidentRoutingBridge
  };
}
