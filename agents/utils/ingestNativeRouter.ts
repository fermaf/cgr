import type { IngestEscalationLevel } from './ingestDecisioning';
import type { IngestNativeIncident, IngestNativeIncidentCode } from './ingestNativeIncident';

export type IngestNativeRouteTarget =
  | 'observe_only'
  | 'run_control_plane'
  | 'run_local_ingest_diagnostics'
  | 'inspect_external_dependency'
  | 'inspect_workflow_wiring'
  | 'escalate_to_operator'
  | 'escalate_to_human';

export interface NativeRouterLegacyCompatibility {
  compatibilityLevel: 'partially_compatible' | 'preview_only' | 'incompatible';
  canDelegateToLegacy: boolean;
  legacyFallbackReason: string | null;
  mappedLegacyDomain: string | null;
}

export interface IngestNativeRouterResult {
  nativeIncidentCode: IngestNativeIncidentCode;
  routingStatus: 'routed' | 'needs_review';
  routeTarget: IngestNativeRouteTarget;
  suggestedSkillOrCapability: string;
  escalationLevel: IngestEscalationLevel;
  humanReviewNeeded: boolean;
  decisionReason: string;
  confidenceLevel: 'medium' | 'low';
  legacyCompatibility: NativeRouterLegacyCompatibility;
  fallbackMode: 'native_only' | 'native_with_legacy_preview';
  recommendations: string[];
}

function buildLegacyCompatibility(nativeIncidentCode: IngestNativeIncidentCode): NativeRouterLegacyCompatibility {
  if (nativeIncidentCode === 'INGEST_EXTERNAL_DEPENDENCY_SUSPECTED') {
    return {
      compatibilityLevel: 'partially_compatible',
      canDelegateToLegacy: false,
      legacyFallbackReason: 'La sospecha de dependencia externa todavía no prueba un IncidentCode heredado específico.',
      mappedLegacyDomain: 'network/http'
    };
  }

  if (nativeIncidentCode === 'INGEST_WORKFLOW_WIRING_SUSPECTED') {
    return {
      compatibilityLevel: 'partially_compatible',
      canDelegateToLegacy: false,
      legacyFallbackReason: 'El wiring sospechado no equivale aún a WORKFLOW_TEST_ERROR ni WORKFLOW_RPC_EXCEPTION.',
      mappedLegacyDomain: 'workflow'
    };
  }

  if (nativeIncidentCode === 'INGEST_CONFIG_SUSPECTED') {
    return {
      compatibilityLevel: 'partially_compatible',
      canDelegateToLegacy: false,
      legacyFallbackReason: 'La configuración sospechada no tiene IncidentCode heredado directo.',
      mappedLegacyDomain: 'config'
    };
  }

  return {
    compatibilityLevel: 'preview_only',
    canDelegateToLegacy: false,
    legacyFallbackReason: 'El incidente nativo actual es útil para routing interno, pero no delegable honestamente al legado.',
    mappedLegacyDomain: null
  };
}

export function routeNativeIngestIncident(nativeIncident: IngestNativeIncident): IngestNativeRouterResult {
  if (nativeIncident.incidentCode === 'INGEST_CONFIG_SUSPECTED') {
    return {
      nativeIncidentCode: nativeIncident.incidentCode,
      routingStatus: 'routed',
      routeTarget: 'run_control_plane',
      suggestedSkillOrCapability: 'skill_ingest_control_plane',
      escalationLevel: 'operator',
      humanReviewNeeded: false,
      decisionReason: 'La sospecha principal está en configuración visible; conviene recentrar la operación en el control plane y revisar configuración.',
      confidenceLevel: nativeIncident.confidenceLevel,
      legacyCompatibility: buildLegacyCompatibility(nativeIncident.incidentCode),
      fallbackMode: 'native_with_legacy_preview',
      recommendations: [
        'Usar skill_ingest_control_plane como superficie principal antes de cualquier delegación externa.',
        'Priorizar revisión de ENVIRONMENT, CGR_BASE_URL y bindings visibles.'
      ]
    };
  }

  if (nativeIncident.incidentCode === 'INGEST_WORKFLOW_WIRING_SUSPECTED') {
    return {
      nativeIncidentCode: nativeIncident.incidentCode,
      routingStatus: 'routed',
      routeTarget: 'inspect_workflow_wiring',
      suggestedSkillOrCapability: 'skill_workflow_healthcheck',
      escalationLevel: 'operator',
      humanReviewNeeded: false,
      decisionReason: 'El incidente nativo apunta a incoherencia estructural de workflows y debe enrutarse a inspección de wiring.',
      confidenceLevel: nativeIncident.confidenceLevel,
      legacyCompatibility: buildLegacyCompatibility(nativeIncident.incidentCode),
      fallbackMode: 'native_with_legacy_preview',
      recommendations: [
        'Revisar exports, bindings y consistencia entre wrangler.jsonc, src/index.ts y src/workflows.',
        'Mantener el legado sólo como preview semántico.'
      ]
    };
  }

  if (nativeIncident.incidentCode === 'INGEST_EXTERNAL_DEPENDENCY_SUSPECTED') {
    return {
      nativeIncidentCode: nativeIncident.incidentCode,
      routingStatus: 'routed',
      routeTarget: 'inspect_external_dependency',
      suggestedSkillOrCapability: 'skill_ingest_incident_bridge',
      escalationLevel: 'operator',
      humanReviewNeeded: true,
      decisionReason: 'La estructura local ya fue saneada y el siguiente destino prudente es el boundary externo de ingestión.',
      confidenceLevel: nativeIncident.confidenceLevel,
      legacyCompatibility: buildLegacyCompatibility(nativeIncident.incidentCode),
      fallbackMode: 'native_with_legacy_preview',
      recommendations: [
        'Usar el control plane para contexto y el incident bridge para compatibilidad externa controlada.',
        'No delegar al legado como routing real hasta contar con evidencia operacional verificable.'
      ]
    };
  }

  if (nativeIncident.incidentCode === 'INGEST_LOCAL_DIAGNOSTICS_REQUIRED') {
    return {
      nativeIncidentCode: nativeIncident.incidentCode,
      routingStatus: 'routed',
      routeTarget: 'run_local_ingest_diagnostics',
      suggestedSkillOrCapability: 'skill_ingest_edge_observability',
      escalationLevel: 'operator',
      humanReviewNeeded: true,
      decisionReason: 'La evidencia actual no alcanza para una hipótesis dominante; el routing nativo debe volver a diagnósticos locales.',
      confidenceLevel: nativeIncident.confidenceLevel,
      legacyCompatibility: buildLegacyCompatibility(nativeIncident.incidentCode),
      fallbackMode: 'native_only',
      recommendations: [
        'Reejecutar observabilidad y triage antes de intentar cualquier convergencia legado.',
        'Usar el incidente nativo como estado de trabajo, no como delegación.'
      ]
    };
  }

  return {
    nativeIncidentCode: nativeIncident.incidentCode,
    routingStatus: 'needs_review',
    routeTarget: 'escalate_to_human',
    suggestedSkillOrCapability: 'skill_ingest_control_plane',
    escalationLevel: 'human',
    humanReviewNeeded: true,
    decisionReason: 'El incidente nativo requiere revisión humana y no debe forzarse a un destino automático adicional.',
    confidenceLevel: nativeIncident.confidenceLevel,
    legacyCompatibility: buildLegacyCompatibility(nativeIncident.incidentCode),
    fallbackMode: 'native_only',
    recommendations: [
      'Escalar con el contexto del control plane y del incidente nativo.',
      'Evitar routeIncident heredado mientras no exista equivalencia semántica real.'
    ]
  };
}
