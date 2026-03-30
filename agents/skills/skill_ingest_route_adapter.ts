import type { SkillDefinition } from '../types/skill';
import { createSkillMetadata } from '../types/skill';
import { executeRegisteredSkill } from '../utils/executeRegisteredSkill';
import {
  adaptIngestBridgeToLegacyIncident,
  type IngestToLegacyRouteAdapterResult
} from '../utils/ingestToLegacyIncidentAdapter';
import type { IngestIncidentBridgeEnvelope } from '../utils/ingestIncidentBridge';
import type { NativeIncidentDerivationResult } from '../utils/ingestNativeIncident';

function asBridgeEnvelope(value: unknown): IngestIncidentBridgeEnvelope {
  return value as IngestIncidentBridgeEnvelope;
}

function asNativeIncident(value: unknown): NativeIncidentDerivationResult {
  return value as NativeIncidentDerivationResult;
}

export const skill: SkillDefinition<Record<string, never>, IngestToLegacyRouteAdapterResult> = {
  name: 'skill_ingest_route_adapter',
  description: 'Prueba de convergencia semántica controlada entre el incident bridge y routeIncident heredado.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute(context) {
    const startedAt = Date.now();
    const [bridgeResult, nativeIncidentResult] = await Promise.all([
      executeRegisteredSkill(context, 'skill_ingest_incident_bridge'),
      executeRegisteredSkill(context, 'skill_ingest_native_incident')
    ]);
    const bridge = asBridgeEnvelope(bridgeResult.data);
    const nativeIncident = asNativeIncident(nativeIncidentResult.data);
    const adaptation = adaptIngestBridgeToLegacyIncident(bridge, nativeIncident);

    context.telemetry.record({
      name: 'skill_ingest_route_adapter.completed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        compatibilityLevel: adaptation.compatibilityLevel,
        routeDecision: adaptation.bridgeInputSummary.routeDecision,
        routeIncidentMatched: adaptation.routeIncidentResult?.matched ?? false,
        nativeIncidentCode: adaptation.nativeIncident.nativeIncident?.incidentCode ?? null
      }
    });

    return {
      status: 'success',
      data: adaptation,
      metadata: createSkillMetadata(
        'skill_ingest_route_adapter',
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
