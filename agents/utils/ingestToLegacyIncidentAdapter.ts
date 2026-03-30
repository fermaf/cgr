import { routeIncident, type RouteDecision } from '../../cgr-platform/src/lib/incidentRouter';
import type { Incident } from '../../cgr-platform/src/lib/incident';
import type { IngestIncidentBridgeEnvelope } from './ingestIncidentBridge';
import type { IngestNativeIncident, NativeIncidentDerivationResult } from './ingestNativeIncident';

export type LegacyCompatibilityLevel =
  | 'fully_compatible'
  | 'partially_compatible'
  | 'preview_only'
  | 'incompatible';

export interface SemanticGap {
  field: string;
  gapType: 'missing_equivalent' | 'partial_mapping' | 'not_verifiable_yet';
  detail: string;
}

export interface IngestToLegacyRouteAdapterResult {
  bridgeInputSummary: {
    incidentType: IngestIncidentBridgeEnvelope['incidentType'];
    incidentScope: IngestIncidentBridgeEnvelope['incidentScope'];
    routeDecision: IngestIncidentBridgeEnvelope['routeDecision'];
    escalationLevel: IngestIncidentBridgeEnvelope['escalationLevel'];
    confidenceLevel: IngestIncidentBridgeEnvelope['confidenceLevel'];
    humanReviewNeeded: boolean;
  };
  nativeIncident: NativeIncidentDerivationResult;
  legacyRouteContract: {
    requiredIncidentFields: Array<keyof Incident>;
    expectsIncidentCode: true;
    routeDecisionShape: {
      matched: 'boolean';
      skill: 'string';
      reason: 'string';
    };
    alreadyCompatibleFields: string[];
    notYetCompatibleFields: string[];
  };
  legacyIncidentCandidate: {
    mappingStatus: 'reliable' | 'partial' | 'none';
    mappedFields: string[];
    incident: Incident | null;
  };
  compatibilityLevel: LegacyCompatibilityLevel;
  routeIncidentResult: RouteDecision | null;
  semanticGaps: SemanticGap[];
  fallbackReason: string | null;
  humanReviewNeeded: boolean;
  recommendations: string[];
}

function buildBridgeInputSummary(bridge: IngestIncidentBridgeEnvelope): IngestToLegacyRouteAdapterResult['bridgeInputSummary'] {
  return {
    incidentType: bridge.incidentType,
    incidentScope: bridge.incidentScope,
    routeDecision: bridge.routeDecision,
    escalationLevel: bridge.escalationLevel,
    confidenceLevel: bridge.confidenceLevel,
    humanReviewNeeded: bridge.humanReviewNeeded
  };
}

function buildLegacyRouteContract(): IngestToLegacyRouteAdapterResult['legacyRouteContract'] {
  return {
    requiredIncidentFields: ['ts', 'env', 'service', 'kind', 'system', 'code', 'message'],
    expectsIncidentCode: true,
    routeDecisionShape: {
      matched: 'boolean',
      skill: 'string',
      reason: 'string'
    },
    alreadyCompatibleFields: [
      'routeDecision',
      'decisionReason',
      'escalationLevel',
      'confidenceLevel',
      'humanReviewNeeded'
    ],
    notYetCompatibleFields: [
      'kind',
      'system',
      'code',
      'message derived from actual incident evidence'
    ]
  };
}

function buildPartialIncident(
  bridge: IngestIncidentBridgeEnvelope,
  incident: Pick<Incident, 'kind' | 'system' | 'code'>,
  nativeIncident?: IngestNativeIncident | null
): Incident {
  return {
    ts: new Date().toISOString(),
    env: 'local',
    service: 'agents-ingest-control-plane',
    workflow: 'ingest',
    kind: incident.kind,
    system: incident.system,
    code: incident.code,
    message: `Bridge semantic adaptation from ${bridge.routeDecision}: ${bridge.decisionReason}`,
    context: {
      incidentType: bridge.incidentType,
      incidentScope: bridge.incidentScope,
      recommendedPrimaryAction: bridge.recommendedPrimaryAction,
      evidenceSummary: bridge.evidenceSummary.map((entry) => ({
        kind: entry.kind,
        source: entry.source,
        detail: entry.detail
      })),
      nativeIncidentCode: nativeIncident?.incidentCode ?? null,
      semanticMapping: 'partial'
    }
  };
}

function mapNativeIncidentToLegacySeed(nativeIncident: IngestNativeIncident | null): Pick<Incident, 'kind' | 'system' | 'code'> | null {
  if (!nativeIncident) {
    return null;
  }

  if (nativeIncident.incidentCode === 'INGEST_EXTERNAL_DEPENDENCY_SUSPECTED') {
    return {
      kind: 'network',
      system: 'http',
      code: 'UNKNOWN'
    };
  }

  if (nativeIncident.incidentCode === 'INGEST_WORKFLOW_WIRING_SUSPECTED') {
    return {
      kind: 'workflow',
      system: 'workflows',
      code: 'UNKNOWN'
    };
  }

  if (nativeIncident.incidentCode === 'INGEST_CONFIG_SUSPECTED') {
    return {
      kind: 'config',
      system: 'unknown',
      code: 'UNKNOWN'
    };
  }

  return null;
}

export function adaptIngestBridgeToLegacyIncident(
  bridge: IngestIncidentBridgeEnvelope,
  nativeIncident: NativeIncidentDerivationResult
): IngestToLegacyRouteAdapterResult {
  const bridgeInputSummary = buildBridgeInputSummary(bridge);
  const legacyRouteContract = buildLegacyRouteContract();

  if (bridge.routeDecision === 'observe_only') {
    return {
      bridgeInputSummary,
      nativeIncident,
      legacyRouteContract,
      legacyIncidentCandidate: {
        mappingStatus: 'none',
        mappedFields: [],
        incident: null
      },
      compatibilityLevel: 'incompatible',
      routeIncidentResult: null,
      semanticGaps: [
        {
          field: 'code',
          gapType: 'missing_equivalent',
          detail: 'observe_only no representa un incidente heredado; expresa ausencia de necesidad de routing.'
        }
      ],
      fallbackReason: 'La salida actual indica observación prudente, no un incidente tipificable para routeIncident.',
      humanReviewNeeded: bridge.humanReviewNeeded,
      recommendations: [
        'No llamar routeIncident cuando la salida sólo indique observación.',
        'Mantener el control plane como superficie principal y esperar evidencia operacional más específica.'
      ]
    };
  }

  if (bridge.routeDecision === 'run_local_diagnostics' || bridge.routeDecision === 'escalate_to_human') {
    return {
      bridgeInputSummary,
      nativeIncident,
      legacyRouteContract,
      legacyIncidentCandidate: {
        mappingStatus: 'none',
        mappedFields: [],
        incident: null
      },
      compatibilityLevel: 'preview_only',
      routeIncidentResult: null,
      semanticGaps: [
        {
          field: 'kind',
          gapType: 'missing_equivalent',
          detail: 'La decisión operativa no apunta todavía a un dominio heredado suficientemente específico.'
        },
        {
          field: 'code',
          gapType: 'not_verifiable_yet',
          detail: 'No existe IncidentCode verificable sin evidencia adicional fuera del runtime actual.'
        }
      ],
      fallbackReason: 'La decisión actual es operativa y preparatoria; todavía no hay semántica suficiente para un incidente heredado honesto.',
      humanReviewNeeded: true,
      recommendations: [
        'Usar el incidente nativo como lenguaje interno reusable, pero no como integración real con routeIncident.',
        'Capturar evidencia operacional adicional antes de intentar una traducción a IncidentCode heredado.'
      ]
    };
  }

  const incidentSeed = mapNativeIncidentToLegacySeed(nativeIncident.nativeIncident);

  if (!incidentSeed) {
    return {
      bridgeInputSummary,
      nativeIncident,
      legacyRouteContract,
      legacyIncidentCandidate: {
        mappingStatus: 'none',
        mappedFields: [],
        incident: null
      },
      compatibilityLevel: nativeIncident.emissionStatus === 'emitted' ? 'preview_only' : 'incompatible',
      routeIncidentResult: null,
      semanticGaps: [
        {
          field: 'incidentCode',
          gapType: 'missing_equivalent',
          detail: 'El IncidentCode nativo actual no tiene mapping honesto a kind/system/code del legado.'
        }
      ],
      fallbackReason: nativeIncident.previewReason ?? 'El incidente nativo actual no puede traducirse honestamente al contrato heredado.',
      humanReviewNeeded: bridge.humanReviewNeeded,
      recommendations: [
        'Mantener el incidente nativo como contrato principal dentro de /agents.',
        'Ampliar compatibilidad legado sólo cuando exista una relación semántica verificable.'
      ]
    };
  }

  const candidate = buildPartialIncident(bridge, incidentSeed, nativeIncident.nativeIncident);
  let semanticGaps: SemanticGap[];

  if (nativeIncident.nativeIncident?.incidentCode === 'INGEST_EXTERNAL_DEPENDENCY_SUSPECTED') {
    semanticGaps = [
      {
        field: 'code',
        gapType: 'partial_mapping',
        detail: 'El incidente nativo expresa sospecha de dependencia externa, pero no prueba NETWORK_DNS_LOOKUP_FAILED, NETWORK_FETCH_FAILED ni códigos HTTP específicos.'
      },
      {
        field: 'message',
        gapType: 'not_verifiable_yet',
        detail: 'El mensaje sigue derivando de evidencia estructural y no de un error operacional observado.'
      }
    ];
  } else if (nativeIncident.nativeIncident?.incidentCode === 'INGEST_WORKFLOW_WIRING_SUSPECTED') {
    semanticGaps = [
      {
        field: 'code',
        gapType: 'partial_mapping',
        detail: 'El incidente nativo de wiring no equivale todavía a WORKFLOW_TEST_ERROR ni WORKFLOW_RPC_EXCEPTION.'
      }
    ];
  } else {
    semanticGaps = [
      {
        field: 'code',
        gapType: 'partial_mapping',
        detail: 'El incidente nativo de configuración no tiene IncidentCode heredado específico; se degrada honestamente a UNKNOWN.'
      }
    ];
  }

  const routeIncidentResult = routeIncident(candidate);

  return {
    bridgeInputSummary,
    nativeIncident,
    legacyRouteContract,
    legacyIncidentCandidate: {
      mappingStatus: 'partial',
      mappedFields: ['ts', 'env', 'service', 'workflow', 'kind', 'system', 'code', 'message', 'context'],
      incident: candidate
    },
    compatibilityLevel: 'partially_compatible',
    routeIncidentResult,
    semanticGaps,
    fallbackReason: routeIncidentResult.matched
      ? null
      : 'El candidate incident es semánticamente parcial y routeIncident cae en fallback porque el código sigue siendo UNKNOWN.',
    humanReviewNeeded: bridge.humanReviewNeeded || routeIncidentResult.matched === false,
    recommendations: [
      'Interpretar routeIncidentResult como compatibilidad parcial gobernada por IncidentCode nativo, no como routing productivo exitoso.',
      'Usar la taxonomía nativa como contrato principal y ampliar mapping legado sólo con evidencia operacional verificable.'
    ]
  };
}
