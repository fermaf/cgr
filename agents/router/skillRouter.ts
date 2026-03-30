export interface SkillRouteInput {
  type?: string;
  intent?: string;
  requestedSkill?: string;
  sessionId?: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
}

export interface SkillRouteResult {
  skillName: string;
  reason: string;
}

const DEFAULT_SKILL_NAME = 'skill_ping';
const DOCTRINE_COHERENCE_AUDIT_SKILL_NAME = 'skill_doctrine_coherence_audit';
const DOCTRINE_STRUCTURE_REMEDIATION_EXECUTOR_SKILL_NAME = 'skill_doctrine_structure_remediation_executor';
const EMBEDDING_CONSISTENCY_CHECK_SKILL_NAME = 'skill_embedding_consistency_check';
const METADATA_AUTO_NORMALIZATION_EXECUTOR_SKILL_NAME = 'skill_metadata_auto_normalization_executor';
const METADATA_BLOCKER_REGENERATION_EXECUTOR_SKILL_NAME = 'skill_metadata_blocker_regeneration_executor';
const METADATA_QUALITY_AUDIT_SKILL_NAME = 'skill_metadata_quality_audit';
const METADATA_REMEDIATION_PLANNER_SKILL_NAME = 'skill_metadata_remediation_planner';
const REPO_SCAN_SKILL_NAME = 'skill_repo_context_scan';
const WORKFLOW_HEALTHCHECK_SKILL_NAME = 'skill_workflow_healthcheck';
const LEGACY_CAPABILITIES_INVENTORY_SKILL_NAME = 'skill_legacy_capabilities_inventory';
const INGEST_TOPOLOGY_SCAN_SKILL_NAME = 'skill_ingest_topology_scan';
const CAPABILITY_CONVERGENCE_REPORT_SKILL_NAME = 'skill_capability_convergence_report';
const INGEST_EDGE_OBSERVABILITY_SKILL_NAME = 'skill_ingest_edge_observability';
const INGEST_INCIDENT_TRIAGE_SKILL_NAME = 'skill_ingest_incident_triage';
const INGEST_INCIDENT_DECISIONING_SKILL_NAME = 'skill_ingest_incident_decisioning';
const INGEST_CONTROL_PLANE_SKILL_NAME = 'skill_ingest_control_plane';
const INGEST_INCIDENT_BRIDGE_SKILL_NAME = 'skill_ingest_incident_bridge';
const INGEST_LEGACY_DELEGATION_SKILL_NAME = 'skill_ingest_legacy_delegation';
const INGEST_NATIVE_INCIDENT_SKILL_NAME = 'skill_ingest_native_incident';
const INGEST_NATIVE_ROUTER_SKILL_NAME = 'skill_ingest_native_router';
const INGEST_ROUTE_ADAPTER_SKILL_NAME = 'skill_ingest_route_adapter';

export function routeSkill(input: SkillRouteInput): SkillRouteResult {
  if (typeof input.requestedSkill === 'string' && input.requestedSkill.trim().length > 0) {
    return {
      skillName: input.requestedSkill.trim(),
      reason: 'requested_skill'
    };
  }

  if (input.intent === 'repo_context_scan' || input.intent === 'repo_scan' || input.type === 'repo_context_scan') {
    return {
      skillName: REPO_SCAN_SKILL_NAME,
      reason: 'repo_context_intent_match'
    };
  }

  if (input.intent === 'embedding_consistency_check' || input.type === 'embedding_consistency_check') {
    return {
      skillName: EMBEDDING_CONSISTENCY_CHECK_SKILL_NAME,
      reason: 'embedding_consistency_check_intent_match'
    };
  }

  if (input.intent === 'doctrine_coherence_audit' || input.type === 'doctrine_coherence_audit') {
    return {
      skillName: DOCTRINE_COHERENCE_AUDIT_SKILL_NAME,
      reason: 'doctrine_coherence_audit_intent_match'
    };
  }

  if (input.intent === 'doctrine_structure_remediation_executor' || input.type === 'doctrine_structure_remediation_executor') {
    return {
      skillName: DOCTRINE_STRUCTURE_REMEDIATION_EXECUTOR_SKILL_NAME,
      reason: 'doctrine_structure_remediation_executor_intent_match'
    };
  }

  if (input.intent === 'metadata_quality_audit' || input.type === 'metadata_quality_audit') {
    return {
      skillName: METADATA_QUALITY_AUDIT_SKILL_NAME,
      reason: 'metadata_quality_audit_intent_match'
    };
  }

  if (input.intent === 'metadata_auto_normalization_executor' || input.type === 'metadata_auto_normalization_executor') {
    return {
      skillName: METADATA_AUTO_NORMALIZATION_EXECUTOR_SKILL_NAME,
      reason: 'metadata_auto_normalization_executor_intent_match'
    };
  }

  if (input.intent === 'metadata_blocker_regeneration_executor' || input.type === 'metadata_blocker_regeneration_executor') {
    return {
      skillName: METADATA_BLOCKER_REGENERATION_EXECUTOR_SKILL_NAME,
      reason: 'metadata_blocker_regeneration_executor_intent_match'
    };
  }

  if (input.intent === 'metadata_remediation_planner' || input.type === 'metadata_remediation_planner') {
    return {
      skillName: METADATA_REMEDIATION_PLANNER_SKILL_NAME,
      reason: 'metadata_remediation_planner_intent_match'
    };
  }

  if (input.intent === 'workflow_healthcheck' || input.type === 'workflow_healthcheck') {
    return {
      skillName: WORKFLOW_HEALTHCHECK_SKILL_NAME,
      reason: 'workflow_healthcheck_intent_match'
    };
  }

  if (input.intent === 'legacy_inventory' || input.type === 'legacy_inventory') {
    return {
      skillName: LEGACY_CAPABILITIES_INVENTORY_SKILL_NAME,
      reason: 'legacy_inventory_intent_match'
    };
  }

  if (input.intent === 'ingest_topology_scan' || input.type === 'ingest_topology_scan') {
    return {
      skillName: INGEST_TOPOLOGY_SCAN_SKILL_NAME,
      reason: 'ingest_topology_scan_intent_match'
    };
  }

  if (input.intent === 'capability_convergence_report' || input.type === 'capability_convergence_report') {
    return {
      skillName: CAPABILITY_CONVERGENCE_REPORT_SKILL_NAME,
      reason: 'capability_convergence_report_intent_match'
    };
  }

  if (input.intent === 'ingest_edge_observability' || input.type === 'ingest_edge_observability') {
    return {
      skillName: INGEST_EDGE_OBSERVABILITY_SKILL_NAME,
      reason: 'ingest_edge_observability_intent_match'
    };
  }

  if (input.intent === 'ingest_incident_triage' || input.type === 'ingest_incident_triage') {
    return {
      skillName: INGEST_INCIDENT_TRIAGE_SKILL_NAME,
      reason: 'ingest_incident_triage_intent_match'
    };
  }

  if (input.intent === 'ingest_incident_decisioning' || input.type === 'ingest_incident_decisioning') {
    return {
      skillName: INGEST_INCIDENT_DECISIONING_SKILL_NAME,
      reason: 'ingest_incident_decisioning_intent_match'
    };
  }

  if (input.intent === 'ingest_control_plane' || input.type === 'ingest_control_plane') {
    return {
      skillName: INGEST_CONTROL_PLANE_SKILL_NAME,
      reason: 'ingest_control_plane_intent_match'
    };
  }

  if (input.intent === 'ingest_incident_bridge' || input.type === 'ingest_incident_bridge') {
    return {
      skillName: INGEST_INCIDENT_BRIDGE_SKILL_NAME,
      reason: 'ingest_incident_bridge_intent_match'
    };
  }

  if (input.intent === 'ingest_legacy_delegation' || input.type === 'ingest_legacy_delegation') {
    return {
      skillName: INGEST_LEGACY_DELEGATION_SKILL_NAME,
      reason: 'ingest_legacy_delegation_intent_match'
    };
  }

  if (input.intent === 'ingest_native_incident' || input.type === 'ingest_native_incident') {
    return {
      skillName: INGEST_NATIVE_INCIDENT_SKILL_NAME,
      reason: 'ingest_native_incident_intent_match'
    };
  }

  if (input.intent === 'ingest_native_router' || input.type === 'ingest_native_router') {
    return {
      skillName: INGEST_NATIVE_ROUTER_SKILL_NAME,
      reason: 'ingest_native_router_intent_match'
    };
  }

  if (input.intent === 'ingest_route_adapter' || input.type === 'ingest_route_adapter') {
    return {
      skillName: INGEST_ROUTE_ADAPTER_SKILL_NAME,
      reason: 'ingest_route_adapter_intent_match'
    };
  }

  if (input.intent === 'ping' || input.type === 'healthcheck') {
    return {
      skillName: DEFAULT_SKILL_NAME,
      reason: 'basic_intent_match'
    };
  }

  return {
    skillName: DEFAULT_SKILL_NAME,
    reason: 'default_fallback'
  };
}
