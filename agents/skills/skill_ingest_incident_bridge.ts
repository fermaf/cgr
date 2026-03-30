import type { SkillDefinition } from '../types/skill';
import { createSkillMetadata } from '../types/skill';
import { executeRegisteredSkill } from '../utils/executeRegisteredSkill';
import { buildIngestIncidentBridgeEnvelope, type IngestIncidentBridgeEnvelope } from '../utils/ingestIncidentBridge';
import type { DecisionEvidenceKind, IngestEscalationLevel, IngestRouteDecision } from '../utils/ingestDecisioning';

interface IngestIncidentBridgeData extends IngestIncidentBridgeEnvelope {}

function asRecord(value: unknown): Record<string, unknown> {
  return (value && typeof value === 'object') ? value as Record<string, unknown> : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeEvidenceKind(value: unknown): DecisionEvidenceKind {
  const raw = String(value ?? 'derived_inference');
  if (raw === 'repo_evidence' || raw === 'not_verifiable_yet' || raw === 'derived_inference') {
    return raw;
  }
  if (raw === 'inference') {
    return 'derived_inference';
  }
  return 'derived_inference';
}

export const skill: SkillDefinition<Record<string, never>, IngestIncidentBridgeData> = {
  name: 'skill_ingest_incident_bridge',
  description: 'Traduce el control plane de ingestión a un envelope reusable y prudente para incident routing futuro.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute(context) {
    const startedAt = Date.now();
    const controlPlaneResult = await executeRegisteredSkill(context, 'skill_ingest_control_plane');
    const controlPlaneData = asRecord(controlPlaneResult.data);
    const futureAdapter = asRecord(controlPlaneData.futureRoutingAdapter);
    const routeDecision = String(controlPlaneData.routeDecision ?? futureAdapter.routeDecision ?? 'run_local_diagnostics') as IngestRouteDecision;
    const escalationPath = asRecord(controlPlaneData.escalationPath);
    const limitations = asArray<Record<string, unknown>>(controlPlaneData.limitations).map((entry) => ({
      kind: normalizeEvidenceKind(entry.kind),
      detail: String(entry.detail ?? '')
    }));
    const diagnosticSignals = asArray<Record<string, unknown>>(controlPlaneData.diagnosticSignals).map((entry) => ({
      kind: normalizeEvidenceKind(entry.evidenceType),
      source: String(entry.source ?? 'unknown'),
      detail: String(entry.detail ?? '')
    }));
    const nextBestActions = asArray<string>(controlPlaneData.nextBestActions).map((value) => String(value));
    const bridge = buildIngestIncidentBridgeEnvelope({
      routeDecision,
      decisionReason: String(escalationPath.trigger ?? 'Control plane operational trigger.'),
      escalationLevel: String(escalationPath.escalationLevel ?? 'operator') as IngestEscalationLevel,
      confidenceLevel: String(futureAdapter.confidenceLevel ?? 'low') as 'medium' | 'low',
      humanReviewNeeded: Boolean(escalationPath.humanReviewNeeded),
      evidenceSummary: diagnosticSignals,
      recommendedPrimaryAction: nextBestActions[0] ?? 'Revisar control plane de ingestión.',
      recommendedSecondaryActions: nextBestActions.slice(1),
      limitations
    });

    context.telemetry.record({
      name: 'skill_ingest_incident_bridge.completed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        routeDecision: bridge.routeDecision,
        escalationLevel: bridge.escalationLevel,
        humanReviewNeeded: bridge.humanReviewNeeded
      }
    });

    return {
      status: 'success',
      data: bridge,
      metadata: createSkillMetadata(
        'skill_ingest_incident_bridge',
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
