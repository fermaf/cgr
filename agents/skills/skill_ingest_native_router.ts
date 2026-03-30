import type { SkillDefinition } from '../types/skill';
import { createSkillMetadata } from '../types/skill';
import { executeRegisteredSkill } from '../utils/executeRegisteredSkill';
import { routeNativeIngestIncident, type IngestNativeRouterResult } from '../utils/ingestNativeRouter';
import type { NativeIncidentDerivationResult } from '../utils/ingestNativeIncident';

interface IngestNativeRouterData {
  summary: {
    flow: 'control_plane_to_native_incident_to_native_router';
    interfaceRole: 'native_ingest_router';
  };
  nativeIncident: NativeIncidentDerivationResult;
  routing: IngestNativeRouterResult | null;
  controlPlaneStatus: string;
  legacyCompatibilityPreview: IngestNativeRouterResult['legacyCompatibility'] | null;
}

function asNativeIncident(value: unknown): NativeIncidentDerivationResult {
  return value as NativeIncidentDerivationResult;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export const skill: SkillDefinition<Record<string, never>, IngestNativeRouterData> = {
  name: 'skill_ingest_native_router',
  description: 'Router nativo de incidentes de ingestión basado en IncidentCode propio de /agents.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute(context) {
    const startedAt = Date.now();
    const [controlPlaneResult, nativeIncidentResult] = await Promise.all([
      executeRegisteredSkill(context, 'skill_ingest_control_plane'),
      executeRegisteredSkill(context, 'skill_ingest_native_incident')
    ]);

    const controlPlaneData = asRecord(controlPlaneResult.data);
    const nativeIncident = asNativeIncident(nativeIncidentResult.data);
    const routing = nativeIncident.nativeIncident
      ? routeNativeIngestIncident(nativeIncident.nativeIncident)
      : null;

    context.telemetry.record({
      name: 'skill_ingest_native_router.completed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        nativeIncidentCode: nativeIncident.nativeIncident?.incidentCode ?? null,
        routeTarget: routing?.routeTarget ?? null,
        routingStatus: routing?.routingStatus ?? 'needs_review'
      }
    });

    return {
      status: 'success',
      data: {
        summary: {
          flow: 'control_plane_to_native_incident_to_native_router',
          interfaceRole: 'native_ingest_router'
        },
        nativeIncident,
        routing,
        controlPlaneStatus: String(controlPlaneData.operationalStatus ?? 'unknown'),
        legacyCompatibilityPreview: routing?.legacyCompatibility ?? null
      },
      metadata: createSkillMetadata(
        'skill_ingest_native_router',
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
