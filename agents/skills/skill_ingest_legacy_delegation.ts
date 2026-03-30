import type { SkillDefinition } from '../types/skill';
import { createSkillMetadata } from '../types/skill';
import { executeRegisteredSkill } from '../utils/executeRegisteredSkill';
import {
  decideIngestLegacyDelegation,
  type IngestLegacyDelegationResult
} from '../utils/ingestLegacyDelegation';
import type { IngestToLegacyRouteAdapterResult } from '../utils/ingestToLegacyIncidentAdapter';
import type { IngestNativeRouterResult } from '../utils/ingestNativeRouter';

interface IngestLegacyDelegationData {
  summary: {
    flow: 'control_plane_to_native_incident_to_native_router_to_delegation';
    interfaceRole: 'controlled_legacy_delegation';
  };
  nativeRouting: IngestNativeRouterResult | null;
  delegation: IngestLegacyDelegationResult;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asNativeRouting(value: unknown): IngestNativeRouterResult | null {
  const record = asRecord(value);
  return record && Object.keys(record).length > 0 ? record as unknown as IngestNativeRouterResult : null;
}

function asRouteAdapter(value: unknown): IngestToLegacyRouteAdapterResult {
  return value as IngestToLegacyRouteAdapterResult;
}

export const skill: SkillDefinition<Record<string, never>, IngestLegacyDelegationData> = {
  name: 'skill_ingest_legacy_delegation',
  description: 'Evalúa delegación controlada desde routing nativo de ingestión hacia routeIncident heredado.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute(context) {
    const startedAt = Date.now();
    const [nativeRouterResult, routeAdapterResult] = await Promise.all([
      executeRegisteredSkill(context, 'skill_ingest_native_router'),
      executeRegisteredSkill(context, 'skill_ingest_route_adapter')
    ]);

    const nativeRouting = asNativeRouting(asRecord(nativeRouterResult.data).routing);
    const routeAdapter = asRouteAdapter(routeAdapterResult.data);
    const delegation = decideIngestLegacyDelegation({
      nativeRouter: nativeRouting,
      routeAdapter
    });

    context.telemetry.record({
      name: 'skill_ingest_legacy_delegation.completed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        delegationDecision: delegation.delegationDecision,
        delegatedToLegacy: delegation.delegatedToLegacy,
        nativeIncidentCode: delegation.nativeIncidentCode
      }
    });

    return {
      status: 'success',
      data: {
        summary: {
          flow: 'control_plane_to_native_incident_to_native_router_to_delegation',
          interfaceRole: 'controlled_legacy_delegation'
        },
        nativeRouting,
        delegation
      },
      metadata: createSkillMetadata(
        'skill_ingest_legacy_delegation',
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
