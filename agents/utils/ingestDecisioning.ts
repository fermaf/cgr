export type DecisionEvidenceKind = 'repo_evidence' | 'derived_inference' | 'not_verifiable_yet';

export type IngestRouteDecision =
  | 'observe_only'
  | 'run_local_diagnostics'
  | 'inspect_config'
  | 'inspect_workflow_wiring'
  | 'inspect_external_dependency'
  | 'escalate_to_human';

export type IngestEscalationLevel = 'none' | 'operator' | 'human';

export interface FutureIncidentRoutingEnvelope {
  decisionType: 'ingest_operational_decision';
  routeDecision: IngestRouteDecision;
  decisionReason: string;
  escalationLevel: IngestEscalationLevel;
  humanReviewNeeded: boolean;
  confidenceLevel: 'medium' | 'low';
}

export function mapDecisionForFutureIncidentRouting(input: {
  routeDecision: IngestRouteDecision;
  decisionReason: string;
  escalationLevel: IngestEscalationLevel;
  humanReviewNeeded: boolean;
  confidenceLevel: 'medium' | 'low';
}): FutureIncidentRoutingEnvelope {
  return {
    decisionType: 'ingest_operational_decision',
    routeDecision: input.routeDecision,
    decisionReason: input.decisionReason,
    escalationLevel: input.escalationLevel,
    humanReviewNeeded: input.humanReviewNeeded,
    confidenceLevel: input.confidenceLevel
  };
}
