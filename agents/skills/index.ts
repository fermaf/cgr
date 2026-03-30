import type { SkillDefinition } from '../types/skill';
import { skill as capabilityConvergenceReportSkill } from './skill_capability_convergence_report';
import { skill as embeddingConsistencyCheckSkill } from './skill_embedding_consistency_check';
import { skill as doctrineCoherenceAuditSkill } from './skill_doctrine_coherence_audit';
import { skill as doctrineStructureRemediationExecutorSkill } from './skill_doctrine_structure_remediation_executor';
import { skill as ingestControlPlaneSkill } from './skill_ingest_control_plane';
import { skill as ingestIncidentBridgeSkill } from './skill_ingest_incident_bridge';
import { skill as ingestIncidentDecisioningSkill } from './skill_ingest_incident_decisioning';
import { skill as ingestLegacyDelegationSkill } from './skill_ingest_legacy_delegation';
import { skill as ingestNativeIncidentSkill } from './skill_ingest_native_incident';
import { skill as ingestNativeRouterSkill } from './skill_ingest_native_router';
import { skill as ingestRouteAdapterSkill } from './skill_ingest_route_adapter';
import { skill as ingestEdgeObservabilitySkill } from './skill_ingest_edge_observability';
import { skill as ingestIncidentTriageSkill } from './skill_ingest_incident_triage';
import { skill as pingSkill } from './skill_ping';
import { skill as legacyCapabilitiesInventorySkill } from './skill_legacy_capabilities_inventory';
import { skill as metadataAutoNormalizationExecutorSkill } from './skill_metadata_auto_normalization_executor';
import { skill as metadataBlockerRegenerationExecutorSkill } from './skill_metadata_blocker_regeneration_executor';
import { skill as ingestTopologyScanSkill } from './skill_ingest_topology_scan';
import { skill as metadataQualityAuditSkill } from './skill_metadata_quality_audit';
import { skill as metadataRemediationPlannerSkill } from './skill_metadata_remediation_planner';
import { skill as repoContextScanSkill } from './skill_repo_context_scan';
import { skill as workflowHealthcheckSkill } from './skill_workflow_healthcheck';
import { wrappedLegacySkills } from './wrappers';

export interface SkillRegistryEntry {
  name: string;
  source: 'native' | 'wrapper';
  skill: SkillDefinition<object, object>;
}

const nativeSkills: Array<SkillDefinition<object, object>> = [
  capabilityConvergenceReportSkill,
  doctrineCoherenceAuditSkill,
  doctrineStructureRemediationExecutorSkill,
  embeddingConsistencyCheckSkill,
  ingestControlPlaneSkill,
  ingestIncidentBridgeSkill,
  ingestEdgeObservabilitySkill,
  ingestIncidentDecisioningSkill,
  ingestLegacyDelegationSkill,
  ingestNativeIncidentSkill,
  ingestNativeRouterSkill,
  ingestRouteAdapterSkill,
  ingestIncidentTriageSkill,
  pingSkill,
  repoContextScanSkill,
  metadataAutoNormalizationExecutorSkill,
  metadataBlockerRegenerationExecutorSkill,
  metadataQualityAuditSkill,
  metadataRemediationPlannerSkill,
  workflowHealthcheckSkill,
  legacyCapabilitiesInventorySkill,
  ingestTopologyScanSkill
];

function buildRegistry(): Map<string, SkillRegistryEntry> {
  const registry = new Map<string, SkillRegistryEntry>();

  for (const skill of nativeSkills) {
    if (registry.has(skill.name)) {
      throw new Error(`Duplicate native skill detected: ${skill.name}`);
    }

    registry.set(skill.name, {
      name: skill.name,
      source: 'native',
      skill
    });
  }

  for (const wrapped of wrappedLegacySkills) {
    if (registry.has(wrapped.name)) {
      throw new Error(`Skill name collision detected between native and wrapper: ${wrapped.name}`);
    }

    registry.set(wrapped.name, {
      name: wrapped.name,
      source: 'wrapper',
      skill: wrapped.skill
    });
  }

  return registry;
}

const skillRegistry = buildRegistry();

export function getSkillRegistry(): Map<string, SkillRegistryEntry> {
  return skillRegistry;
}

export function resolveSkill(skillName: string): SkillRegistryEntry | undefined {
  return skillRegistry.get(skillName);
}

export function listSkillRegistryEntries(): SkillRegistryEntry[] {
  return Array.from(skillRegistry.values()).sort((left, right) => left.name.localeCompare(right.name));
}
