import type { SkillDefinition } from '../types/skill';
import { createSkillMetadata } from '../types/skill';
import { executeRegisteredSkill } from '../utils/executeRegisteredSkill';
import {
  deriveNativeIncident,
  type NativeIncidentDerivationResult
} from '../utils/ingestNativeIncident';
import type { DecisionEvidenceKind, IngestRouteDecision } from '../utils/ingestDecisioning';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
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

export const skill: SkillDefinition<Record<string, never>, NativeIncidentDerivationResult> = {
  name: 'skill_ingest_native_incident',
  description: 'Deriva un incidente nativo de ingestión a partir de control plane, triage y decisioning ya existentes.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute(context) {
    const startedAt = Date.now();
    const [controlPlaneResult, triageResult, decisioningResult] = await Promise.all([
      executeRegisteredSkill(context, 'skill_ingest_control_plane'),
      executeRegisteredSkill(context, 'skill_ingest_incident_triage'),
      executeRegisteredSkill(context, 'skill_ingest_incident_decisioning')
    ]);

    const controlPlaneData = asRecord(controlPlaneResult.data);
    const triageData = asRecord(triageResult.data);
    const decisioningData = asRecord(decisioningResult.data);

    const evidenceKinds = asArray<Record<string, unknown>>(decisioningData.evidenceBasis).map((entry) =>
      normalizeEvidenceKind(entry.kind)
    );

    const derived = deriveNativeIncident({
      routeDecision: String(decisioningData.routeDecision ?? 'observe_only') as IngestRouteDecision,
      decisionReason: String(decisioningData.decisionReason ?? 'No decision reason available.'),
      confidenceLevel: String(decisioningData.confidenceLevel ?? 'low') as 'medium' | 'low',
      humanReviewNeeded: Boolean(decisioningData.humanReviewNeeded),
      evidenceKinds,
      triageStatus: String(asRecord(triageData.summary).triageStatus ?? 'attention_needed'),
      operationalStatus: String(controlPlaneData.operationalStatus ?? 'attention_needed')
    });

    context.telemetry.record({
      name: 'skill_ingest_native_incident.completed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        emissionStatus: derived.emissionStatus,
        incidentCode: derived.nativeIncident?.incidentCode ?? null
      }
    });

    return {
      status: 'success',
      data: derived,
      metadata: createSkillMetadata(
        'skill_ingest_native_incident',
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
