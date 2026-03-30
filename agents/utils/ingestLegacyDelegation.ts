import type { IngestNativeRouteTarget, IngestNativeRouterResult } from './ingestNativeRouter';
import type { IngestNativeIncidentCode } from './ingestNativeIncident';
import type { IngestToLegacyRouteAdapterResult, LegacyCompatibilityLevel } from './ingestToLegacyIncidentAdapter';

export type IngestDelegationDecision =
  | 'delegated'
  | 'not_delegated'
  | 'preview_only'
  | 'blocked_by_semantic_gap';

export interface IngestDelegationMatrixEntry {
  nativeIncidentCode: IngestNativeIncidentCode;
  routeTarget: IngestNativeRouteTarget;
  compatibilityLevel: LegacyCompatibilityLevel;
  canDelegateToLegacy: boolean;
  delegationReason: string;
  fallbackMode: 'native_only' | 'native_with_legacy_preview';
}

export interface IngestLegacyDelegationResult {
  nativeIncidentCode: IngestNativeIncidentCode | null;
  routeTarget: IngestNativeRouteTarget | null;
  delegationDecision: IngestDelegationDecision;
  delegatedToLegacy: boolean;
  legacyRouteResult: IngestToLegacyRouteAdapterResult['routeIncidentResult'];
  delegationReason: string;
  fallbackReason: string | null;
  humanReviewNeeded: boolean;
  confidenceLevel: 'medium' | 'low' | null;
  recommendations: string[];
  delegationMatrix: IngestDelegationMatrixEntry[];
}

const DELEGATION_MATRIX: IngestDelegationMatrixEntry[] = [
  {
    nativeIncidentCode: 'INGEST_CONFIG_SUSPECTED',
    routeTarget: 'run_control_plane',
    compatibilityLevel: 'partially_compatible',
    canDelegateToLegacy: false,
    delegationReason: 'La configuración sospechada no tiene IncidentCode heredado directo; la degradación a UNKNOWN no es delegación segura.',
    fallbackMode: 'native_with_legacy_preview'
  },
  {
    nativeIncidentCode: 'INGEST_WORKFLOW_WIRING_SUSPECTED',
    routeTarget: 'inspect_workflow_wiring',
    compatibilityLevel: 'partially_compatible',
    canDelegateToLegacy: false,
    delegationReason: 'El wiring sospechado no equivale todavía a errores heredados de workflow suficientemente específicos.',
    fallbackMode: 'native_with_legacy_preview'
  },
  {
    nativeIncidentCode: 'INGEST_EXTERNAL_DEPENDENCY_SUSPECTED',
    routeTarget: 'inspect_external_dependency',
    compatibilityLevel: 'partially_compatible',
    canDelegateToLegacy: false,
    delegationReason: 'La sospecha de dependencia externa aún no prueba DNS, fetch ni HTTP específicos del legado.',
    fallbackMode: 'native_with_legacy_preview'
  },
  {
    nativeIncidentCode: 'INGEST_LOCAL_DIAGNOSTICS_REQUIRED',
    routeTarget: 'run_local_ingest_diagnostics',
    compatibilityLevel: 'preview_only',
    canDelegateToLegacy: false,
    delegationReason: 'El incidente nativo expresa necesidad de diagnóstico, no un incidente heredado delegable.',
    fallbackMode: 'native_only'
  },
  {
    nativeIncidentCode: 'INGEST_HUMAN_REVIEW_REQUIRED',
    routeTarget: 'escalate_to_human',
    compatibilityLevel: 'preview_only',
    canDelegateToLegacy: false,
    delegationReason: 'La revisión humana requerida preserva contexto operativo, pero no define un código heredado enrutable.',
    fallbackMode: 'native_only'
  }
];

export function getIngestDelegationMatrix(): IngestDelegationMatrixEntry[] {
  return DELEGATION_MATRIX.map((entry) => ({ ...entry }));
}

export function decideIngestLegacyDelegation(input: {
  nativeRouter: IngestNativeRouterResult | null;
  routeAdapter: IngestToLegacyRouteAdapterResult;
}): IngestLegacyDelegationResult {
  const nativeRouter = input.nativeRouter;
  if (!nativeRouter) {
    return {
      nativeIncidentCode: null,
      routeTarget: null,
      delegationDecision: 'preview_only',
      delegatedToLegacy: false,
      legacyRouteResult: null,
      delegationReason: 'No existe routing nativo disponible; no hay base suficiente para delegación controlada.',
      fallbackReason: 'El flujo permanece en evaluación nativa y no debe bajar al legado.',
      humanReviewNeeded: true,
      confidenceLevel: null,
      recommendations: [
        'Emitir primero un incidente nativo antes de evaluar delegación.',
        'Mantener el control plane como superficie principal mientras no haya ruta nativa estable.'
      ],
      delegationMatrix: getIngestDelegationMatrix()
    };
  }

  const matrixEntry = DELEGATION_MATRIX.find((entry) =>
    entry.nativeIncidentCode === nativeRouter.nativeIncidentCode && entry.routeTarget === nativeRouter.routeTarget
  );

  if (!matrixEntry) {
    return {
      nativeIncidentCode: nativeRouter.nativeIncidentCode,
      routeTarget: nativeRouter.routeTarget,
      delegationDecision: 'blocked_by_semantic_gap',
      delegatedToLegacy: false,
      legacyRouteResult: input.routeAdapter.routeIncidentResult,
      delegationReason: 'No existe regla de delegación explícita para esta combinación de incidente nativo y routeTarget.',
      fallbackReason: 'Sin matriz explícita no se permite bajar al legado.',
      humanReviewNeeded: nativeRouter.humanReviewNeeded,
      confidenceLevel: nativeRouter.confidenceLevel,
      recommendations: [
        'Ampliar la matriz sólo cuando exista equivalencia semántica verificable.',
        'Mantener la decisión dentro del router nativo.'
      ],
      delegationMatrix: getIngestDelegationMatrix()
    };
  }

  if (!matrixEntry.canDelegateToLegacy) {
    const delegationDecision: IngestDelegationDecision =
      matrixEntry.compatibilityLevel === 'preview_only' ? 'preview_only' : 'blocked_by_semantic_gap';

    return {
      nativeIncidentCode: nativeRouter.nativeIncidentCode,
      routeTarget: nativeRouter.routeTarget,
      delegationDecision,
      delegatedToLegacy: false,
      legacyRouteResult: input.routeAdapter.routeIncidentResult,
      delegationReason: matrixEntry.delegationReason,
      fallbackReason: nativeRouter.legacyCompatibility.legacyFallbackReason ?? input.routeAdapter.fallbackReason,
      humanReviewNeeded: nativeRouter.humanReviewNeeded,
      confidenceLevel: nativeRouter.confidenceLevel,
      recommendations: [
        'Mantener el caso en routing nativo y usar el legado sólo como preview de compatibilidad.',
        'No forzar delegación mientras el adapter siga degradando a UNKNOWN o preview.'
      ],
      delegationMatrix: getIngestDelegationMatrix()
    };
  }

  return {
    nativeIncidentCode: nativeRouter.nativeIncidentCode,
    routeTarget: nativeRouter.routeTarget,
    delegationDecision: 'delegated',
    delegatedToLegacy: true,
    legacyRouteResult: input.routeAdapter.routeIncidentResult,
    delegationReason: matrixEntry.delegationReason,
    fallbackReason: null,
    humanReviewNeeded: nativeRouter.humanReviewNeeded,
    confidenceLevel: nativeRouter.confidenceLevel,
    recommendations: [
      'Delegar al legado sólo porque la equivalencia semántica fue declarada segura en la matriz.',
      'Mantener trazabilidad del incidente nativo como contrato principal.'
    ],
    delegationMatrix: getIngestDelegationMatrix()
  };
}
