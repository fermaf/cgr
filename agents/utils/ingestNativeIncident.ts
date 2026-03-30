import type { DecisionEvidenceKind, IngestRouteDecision } from './ingestDecisioning';

export type IngestNativeIncidentCode =
  | 'INGEST_CONFIG_SUSPECTED'
  | 'INGEST_WORKFLOW_WIRING_SUSPECTED'
  | 'INGEST_EXTERNAL_DEPENDENCY_SUSPECTED'
  | 'INGEST_LOCAL_DIAGNOSTICS_REQUIRED'
  | 'INGEST_HUMAN_REVIEW_REQUIRED';

export interface IngestNativeIncident {
  incidentCode: IngestNativeIncidentCode;
  incidentScope: 'ingest';
  incidentKind: 'config' | 'workflow' | 'dependency' | 'diagnostic' | 'human_review';
  incidentMessage: string;
  evidenceKinds: DecisionEvidenceKind[];
  confidenceLevel: 'medium' | 'low';
  humanReviewNeeded: boolean;
  derivedFrom: {
    controlPlane: string;
    triage: string;
    decisioning: string;
  };
  compatibilityNotes: string[];
}

export interface NativeIncidentDerivationResult {
  emissionStatus: 'emitted' | 'preview_only' | 'not_determinable';
  nativeIncident: IngestNativeIncident | null;
  previewReason: string | null;
  recommendations: string[];
}

function uniqueEvidenceKinds(kinds: DecisionEvidenceKind[]): DecisionEvidenceKind[] {
  return [...new Set(kinds)];
}

export function deriveNativeIncident(input: {
  routeDecision: IngestRouteDecision;
  decisionReason: string;
  confidenceLevel: 'medium' | 'low';
  humanReviewNeeded: boolean;
  evidenceKinds: DecisionEvidenceKind[];
  triageStatus: string;
  operationalStatus: string;
}): NativeIncidentDerivationResult {
  const common = {
    incidentScope: 'ingest' as const,
    evidenceKinds: uniqueEvidenceKinds(input.evidenceKinds),
    confidenceLevel: input.confidenceLevel,
    humanReviewNeeded: input.humanReviewNeeded,
    derivedFrom: {
      controlPlane: input.operationalStatus,
      triage: input.triageStatus,
      decisioning: input.routeDecision
    }
  };

  if (input.routeDecision === 'inspect_config') {
    return {
      emissionStatus: 'emitted',
      nativeIncident: {
        incidentCode: 'INGEST_CONFIG_SUSPECTED',
        incidentKind: 'config',
        incidentMessage: 'La evidencia estructural actual sugiere revisar configuración visible del flujo de ingestión.',
        compatibilityNotes: [
          'Este código nativo expresa sospecha operacional, no un IncidentCode heredado exacto.',
          'Puede degradarse a compatibilidad parcial con el legado, no a routing pleno.'
        ],
        ...common
      },
      previewReason: null,
      recommendations: [
        'Usar este incidente para ordenar troubleshooting local antes de sospechar otras capas.'
      ]
    };
  }

  if (input.routeDecision === 'inspect_workflow_wiring') {
    return {
      emissionStatus: 'emitted',
      nativeIncident: {
        incidentCode: 'INGEST_WORKFLOW_WIRING_SUSPECTED',
        incidentKind: 'workflow',
        incidentMessage: 'La evidencia visible apunta a revisar wiring estructural de workflows y exports.',
        compatibilityNotes: [
          'No equivale todavía a WORKFLOW_TEST_ERROR ni a WORKFLOW_RPC_EXCEPTION.',
          'Sirve como incidente nativo reusable aunque el mapping al legado siga siendo parcial.'
        ],
        ...common
      },
      previewReason: null,
      recommendations: [
        'Usar este incidente para priorizar revisión de wrangler.jsonc, src/index.ts y src/workflows.'
      ]
    };
  }

  if (input.routeDecision === 'inspect_external_dependency') {
    return {
      emissionStatus: 'emitted',
      nativeIncident: {
        incidentCode: 'INGEST_EXTERNAL_DEPENDENCY_SUSPECTED',
        incidentKind: 'dependency',
        incidentMessage: 'La estructura local luce consistente y la sospecha prudente se desplaza al boundary externo de ingestión.',
        compatibilityNotes: [
          'No prueba DNS, fetch ni HTTP específicos; expresa una sospecha operacional controlada.',
          'El mapping al legado sigue siendo parcial hasta contar con evidencia operacional real.'
        ],
        ...common
      },
      previewReason: null,
      recommendations: [
        'Usar este incidente para escalar diagnóstico fuera del runtime local sin afirmar fallo legado específico.'
      ]
    };
  }

  if (input.routeDecision === 'run_local_diagnostics') {
    return {
      emissionStatus: 'emitted',
      nativeIncident: {
        incidentCode: 'INGEST_LOCAL_DIAGNOSTICS_REQUIRED',
        incidentKind: 'diagnostic',
        incidentMessage: 'La evidencia actual no alcanza para una hipótesis dominante; se requieren diagnósticos locales adicionales.',
        compatibilityNotes: [
          'Este código nativo describe necesidad operativa, no un fallo legado clasificable.',
          'Debe permanecer como preview o fallback frente al routing heredado.'
        ],
        ...common
      },
      previewReason: null,
      recommendations: [
        'Reejecutar control plane, triage y señales locales antes de intentar mapping legado.'
      ]
    };
  }

  if (input.routeDecision === 'escalate_to_human') {
    return {
      emissionStatus: 'emitted',
      nativeIncident: {
        incidentCode: 'INGEST_HUMAN_REVIEW_REQUIRED',
        incidentKind: 'human_review',
        incidentMessage: 'La evidencia disponible no permite una decisión prudente sin revisión humana.',
        compatibilityNotes: [
          'Este código nativo preserva trazabilidad, pero no tiene equivalencia heredada directa.',
          'Debe tratarse como preview para routeIncident.'
        ],
        ...common
      },
      previewReason: null,
      recommendations: [
        'Escalar a revisión humana con el contexto del control plane y evitar sobreautomatización.'
      ]
    };
  }

  return {
    emissionStatus: 'preview_only',
    nativeIncident: null,
    previewReason: 'observe_only no emite incidente nativo; expresa ausencia actual de necesidad de routing.',
    recommendations: [
      'Mantener observación y emitir incidente nativo sólo cuando aparezca una sospecha operacional concreta.'
    ]
  };
}
