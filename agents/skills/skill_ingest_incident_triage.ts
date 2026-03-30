import type { SkillDefinition, SkillExecutionResult } from '../types/skill';
import { createSkillMetadata } from '../types/skill';
import { executeRegisteredSkill } from '../utils/executeRegisteredSkill';

type TriageEvidenceKind = 'repo_evidence' | 'inference' | 'not_verifiable_yet';

interface TriageSignal {
  sourceSkill: string;
  kind: TriageEvidenceKind;
  signal: string;
  detail: string;
}

interface FailureDomain {
  domain: 'configuracion' | 'bindings' | 'workflow_wiring' | 'topology_mismatch' | 'legacy_core_convergence' | 'external_dependency_boundary';
  likelihood: 'low' | 'medium' | 'high';
  basis: string[];
}

interface DiagnosticStep {
  step: number;
  domain: FailureDomain['domain'];
  action: string;
  evidenceType: TriageEvidenceKind;
}

interface OperatorAction {
  priority: 'now' | 'next' | 'later';
  action: string;
  rationale: string;
}

interface IngestIncidentTriageData {
  summary: {
    triageStatus: 'structurally_ready' | 'attention_needed';
    routeType: 'preventive_triage';
    memoryPolicy: 'parent_event_only';
  };
  detectedSignals: TriageSignal[];
  probableFailureDomains: FailureDomain[];
  recommendedDiagnosticPath: DiagnosticStep[];
  operatorActions: OperatorAction[];
  confidenceLevel: 'medium' | 'low';
  limitations: Array<{
    kind: TriageEvidenceKind;
    detail: string;
  }>;
}

function getNestedBoolean(input: unknown, path: string[]): boolean {
  let current = input;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return false;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current === true;
}

function getNestedArray(input: unknown, key: string): unknown[] {
  if (!input || typeof input !== 'object') {
    return [];
  }

  const value = (input as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
}

export const skill: SkillDefinition<Record<string, never>, IngestIncidentTriageData> = {
  name: 'skill_ingest_incident_triage',
  description: 'Traduce observabilidad estructural del borde de ingestión en troubleshooting accionable y reusable.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute(context) {
    const startedAt = Date.now();
    const [edgeObservability, topologyScan, workflowHealthcheck, envSanity, baseUrlVerify] = await Promise.all([
      executeRegisteredSkill(context, 'skill_ingest_edge_observability'),
      executeRegisteredSkill(context, 'skill_ingest_topology_scan'),
      executeRegisteredSkill(context, 'skill_workflow_healthcheck'),
      executeRegisteredSkill(context, 'legacy_check_env_sanity'),
      executeRegisteredSkill(context, 'legacy_cgr_network_baseurl_verify')
    ]);

    const edgeData = edgeObservability.data as Record<string, unknown>;
    const topologyData = topologyScan.data as Record<string, unknown>;
    const workflowData = workflowHealthcheck.data as Record<string, unknown>;

    const configReady = getNestedBoolean(edgeData, ['readinessAssessment', 'configReadiness']) ||
      ((edgeData.readinessAssessment as Record<string, unknown> | undefined)?.configReadiness === 'ready');
    const workflowReady = ((edgeData.readinessAssessment as Record<string, unknown> | undefined)?.workflowStructure === 'ready');
    const topologyMapped = ((edgeData.readinessAssessment as Record<string, unknown> | undefined)?.topologyVisibility === 'mapped');
    const workflowRisks = getNestedArray(workflowData, 'risks').map((value) => String(value));
    const visibleEndpoints = getNestedArray(topologyData, 'endpoints').length;
    const visibleWorkflows = getNestedArray(topologyData, 'workflows').length;
    const baseUrlOk = getNestedBoolean(baseUrlVerify.data, ['legacyResult', 'metadata', 'base_url_ok']);
    const envOk = getNestedBoolean(envSanity.data, ['legacyResult', 'metadata', 'env_ok']);
    const dbBindingOk = getNestedBoolean(envSanity.data, ['legacyResult', 'metadata', 'db_binding_ok']);

    const detectedSignals: TriageSignal[] = [
      {
        sourceSkill: 'skill_ingest_edge_observability',
        kind: 'repo_evidence',
        signal: 'edge_summary',
        detail: `overallStatus=${String((edgeData.summary as Record<string, unknown> | undefined)?.overallStatus ?? 'unknown')}`
      },
      {
        sourceSkill: 'skill_ingest_topology_scan',
        kind: 'repo_evidence',
        signal: 'topology_map',
        detail: `visible_endpoints=${visibleEndpoints}, visible_workflows=${visibleWorkflows}`
      },
      {
        sourceSkill: 'legacy_check_env_sanity',
        kind: 'repo_evidence',
        signal: 'config_flags',
        detail: `env_ok=${envOk}, db_binding_ok=${dbBindingOk}`
      },
      {
        sourceSkill: 'legacy_cgr_network_baseurl_verify',
        kind: 'repo_evidence',
        signal: 'baseurl_flags',
        detail: `base_url_ok=${baseUrlOk}`
      },
      {
        sourceSkill: 'skill_workflow_healthcheck',
        kind: workflowRisks.length > 0 ? 'repo_evidence' : 'inference',
        signal: 'workflow_structure',
        detail: workflowRisks.length > 0 ? `workflow_risks=${workflowRisks.length}` : 'No se observan riesgos estructurales en workflows.'
      }
    ];

    const probableFailureDomains: FailureDomain[] = [
      {
        domain: 'configuracion',
        likelihood: configReady ? 'low' : 'high',
        basis: [
          'legacy_check_env_sanity y legacy_cgr_network_baseurl_verify inspeccionan ENVIRONMENT y CGR_BASE_URL visibles.',
          configReady ? 'Las banderas visibles de configuración están consistentes.' : 'Hay señales visibles de configuración incompleta o inconsistente.'
        ]
      },
      {
        domain: 'bindings',
        likelihood: dbBindingOk ? 'low' : 'medium',
        basis: [
          'La evidencia disponible para bindings proviene de wrangler.jsonc adaptado al runtime.',
          dbBindingOk ? 'DB aparece declarado visiblemente.' : 'DB no aparece como binding adaptado consistente.'
        ]
      },
      {
        domain: 'workflow_wiring',
        likelihood: workflowReady ? 'low' : 'high',
        basis: workflowRisks.length > 0
          ? workflowRisks
          : ['skill_workflow_healthcheck no encontró inconsistencias estructurales en wiring visible.']
      },
      {
        domain: 'topology_mismatch',
        likelihood: topologyMapped ? 'low' : 'medium',
        basis: [
          topologyMapped
            ? 'Hay endpoints y workflows de ingestión visibles y mapeados.'
            : 'La topología visible no quedó completamente mapeada.'
        ]
      },
      {
        domain: 'legacy_core_convergence',
        likelihood: 'medium',
        basis: [
          'La observabilidad depende todavía de wrappers del core heredado.',
          'La composición nativa ya reduce deuda, pero aún no reemplaza diagnósticos heredados.'
        ]
      },
      {
        domain: 'external_dependency_boundary',
        likelihood: 'medium',
        basis: [
          'La validación actual de CGR_BASE_URL es estructural y no comprueba reachability real.',
          'No se ejecutan workflows ni llamadas externas en este triage.'
        ]
      }
    ];

    const recommendedDiagnosticPath: DiagnosticStep[] = [
      {
        step: 1,
        domain: 'configuracion',
        action: 'Confirmar señales de ENVIRONMENT y CGR_BASE_URL con skill_ingest_edge_observability y wrappers heredados.',
        evidenceType: 'repo_evidence'
      },
      {
        step: 2,
        domain: 'workflow_wiring',
        action: 'Revisar skill_workflow_healthcheck para descartar fallas de wiring antes de sospechar incidentes operativos.',
        evidenceType: workflowRisks.length > 0 ? 'repo_evidence' : 'inference'
      },
      {
        step: 3,
        domain: 'topology_mismatch',
        action: 'Usar skill_ingest_topology_scan para verificar que el endpoint afectado corresponda al workflow y bindings visibles esperados.',
        evidenceType: 'repo_evidence'
      },
      {
        step: 4,
        domain: 'external_dependency_boundary',
        action: 'Si la configuración y el wiring lucen sanos, tratar el problema como boundary externa y no como fallo confirmado del runtime local.',
        evidenceType: 'inference'
      },
      {
        step: 5,
        domain: 'legacy_core_convergence',
        action: 'Si el patrón se repite, priorizar reemplazo nativo o integración más cercana con incident routing en lugar de sumar wrappers aislados.',
        evidenceType: 'inference'
      }
    ];

    const operatorActions: OperatorAction[] = [
      {
        priority: 'now',
        action: 'Ejecutar `agents:ingest:edge` como chequeo compuesto inicial antes de cualquier hipótesis operacional.',
        rationale: 'Consolida configuración, base URL, wiring y topología en una sola lectura.'
      },
      {
        priority: 'next',
        action: 'Si aparece inconsistencia, seguir el dominio con mayor likelihood en `probableFailureDomains` y evitar saltar directo a causas externas.',
        rationale: 'El triage busca ordenar la investigación y reducir tiempo perdido en hipótesis no sustentadas.'
      },
      {
        priority: 'later',
        action: 'Promover esta ruta a una integración con incident routing cuando exista evidencia operacional recurrente.',
        rationale: 'Ese paso aportará más valor que un tercer wrapper aislado.'
      }
    ];

    const limitations = [
      {
        kind: 'repo_evidence' as const,
        detail: 'La evidencia proviene de configuración, código y wiring visibles del repo.'
      },
      {
        kind: 'inference' as const,
        detail: 'Las rutas diagnósticas propuestas son inferencias prudentes a partir de señales estructurales, no de incidentes confirmados.'
      },
      {
        kind: 'not_verifiable_yet' as const,
        detail: 'No se verifica reachability real contra CGR, bindings vivos de Cloudflare ni estado de ejecución de workflows.'
      }
    ];

    context.telemetry.record({
      name: 'skill_ingest_incident_triage.completed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        configReady,
        workflowReady,
        topologyMapped,
        workflowRiskCount: workflowRisks.length
      }
    });

    return {
      status: 'success',
      data: {
        summary: {
          triageStatus: configReady && workflowReady && topologyMapped ? 'structurally_ready' : 'attention_needed',
          routeType: 'preventive_triage',
          memoryPolicy: 'parent_event_only'
        },
        detectedSignals,
        probableFailureDomains,
        recommendedDiagnosticPath,
        operatorActions,
        confidenceLevel: 'medium',
        limitations
      },
      metadata: createSkillMetadata(
        'skill_ingest_incident_triage',
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
