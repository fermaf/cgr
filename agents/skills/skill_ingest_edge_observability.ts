import type { SkillDefinition, SkillExecutionResult } from '../types/skill';
import { createSkillMetadata } from '../types/skill';
import { executeRegisteredSkill } from '../utils/executeRegisteredSkill';

interface IngestEdgeObservabilityData {
  summary: {
    overallStatus: 'ready' | 'attention_needed';
    passedChecks: number;
    totalChecks: number;
  };
  checks: Array<{
    skillName: string;
    status: 'success' | 'error';
    keyFindings: string[];
    metadata: SkillExecutionResult<object>['metadata'];
  }>;
  topology: Record<string, unknown>;
  risks: string[];
  readinessAssessment: {
    configReadiness: 'ready' | 'attention_needed';
    workflowStructure: 'ready' | 'attention_needed';
    topologyVisibility: 'mapped' | 'partial';
  };
  recommendations: string[];
}

function findLegacyCheckValue(result: SkillExecutionResult<object>, path: Array<string>): boolean {
  let current: unknown = result.data;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return false;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current === true;
}

function buildKeyFindings(skillName: string, result: SkillExecutionResult<object>): string[] {
  if (skillName === 'legacy_check_env_sanity') {
    return [
      `env_ok=${findLegacyCheckValue(result, ['legacyResult', 'metadata', 'env_ok'])}`,
      `db_binding_ok=${findLegacyCheckValue(result, ['legacyResult', 'metadata', 'db_binding_ok'])}`,
      `base_url_ok=${findLegacyCheckValue(result, ['legacyResult', 'metadata', 'base_url_ok'])}`
    ];
  }

  if (skillName === 'legacy_cgr_network_baseurl_verify') {
    return [
      `base_url_ok=${findLegacyCheckValue(result, ['legacyResult', 'metadata', 'base_url_ok'])}`,
      `scheme_ok=${findLegacyCheckValue(result, ['legacyResult', 'metadata', 'scheme_ok'])}`,
      `host_ok=${findLegacyCheckValue(result, ['legacyResult', 'metadata', 'host_ok'])}`
    ];
  }

  if (skillName === 'skill_workflow_healthcheck') {
    const data = result.data as Record<string, unknown>;
    const risks = Array.isArray(data.risks) ? data.risks.length : 0;
    return [`workflow_risks=${risks}`];
  }

  if (skillName === 'skill_ingest_topology_scan') {
    const data = result.data as Record<string, unknown>;
    const endpoints = Array.isArray(data.endpoints) ? data.endpoints.length : 0;
    const workflows = Array.isArray(data.workflows) ? data.workflows.length : 0;
    return [`mapped_endpoints=${endpoints}`, `mapped_workflows=${workflows}`];
  }

  return [];
}

export const skill: SkillDefinition<Record<string, never>, IngestEdgeObservabilityData> = {
  name: 'skill_ingest_edge_observability',
  description: 'Consolida observabilidad estructural del borde de ingestión reutilizando capacidades ya existentes en /agents.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute(context) {
    const startedAt = Date.now();
    const [envSanity, baseUrlVerify, workflowHealthcheck, topologyScan] = await Promise.all([
      executeRegisteredSkill(context, 'legacy_check_env_sanity'),
      executeRegisteredSkill(context, 'legacy_cgr_network_baseurl_verify'),
      executeRegisteredSkill(context, 'skill_workflow_healthcheck'),
      executeRegisteredSkill(context, 'skill_ingest_topology_scan')
    ]);

    const checkResults: Array<{ skillName: string; result: SkillExecutionResult<object> }> = [
      { skillName: 'legacy_check_env_sanity', result: envSanity },
      { skillName: 'legacy_cgr_network_baseurl_verify', result: baseUrlVerify },
      { skillName: 'skill_workflow_healthcheck', result: workflowHealthcheck },
      { skillName: 'skill_ingest_topology_scan', result: topologyScan }
    ];

    const checks = checkResults.map(({ skillName, result }) => ({
      skillName,
      status: result.status,
      keyFindings: buildKeyFindings(skillName, result),
      metadata: result.metadata
    }));

    const topology = topologyScan.data as Record<string, unknown>;
    const workflowRisks = Array.isArray((workflowHealthcheck.data as Record<string, unknown>).risks)
      ? (workflowHealthcheck.data as Record<string, unknown>).risks as string[]
      : [];
    const risks = [
      ...workflowRisks,
      'La observabilidad del borde sigue siendo estructural; no verifica reachability real contra CGR ni ejecución viva de workflows.'
    ];

    const configReady =
      findLegacyCheckValue(envSanity, ['legacyResult', 'metadata', 'env_ok']) &&
      findLegacyCheckValue(envSanity, ['legacyResult', 'metadata', 'base_url_ok']) &&
      findLegacyCheckValue(baseUrlVerify, ['legacyResult', 'metadata', 'base_url_ok']);
    const workflowReady = workflowRisks.length === 0;
    const topologyMapped =
      Array.isArray(topology.endpoints) &&
      Array.isArray(topology.workflows) &&
      topology.endpoints.length > 0 &&
      topology.workflows.length > 0;

    const readinessAssessment = {
      configReadiness: configReady ? 'ready' as const : 'attention_needed' as const,
      workflowStructure: workflowReady ? 'ready' as const : 'attention_needed' as const,
      topologyVisibility: topologyMapped ? 'mapped' as const : 'partial' as const
    };

    const recommendations: string[] = [];
    if (!configReady) {
      recommendations.push('Revisar ENVIRONMENT y CGR_BASE_URL visibles en wrangler.jsonc antes de ampliar troubleshooting del borde.');
    }
    if (!workflowReady) {
      recommendations.push('Corregir o aclarar inconsistencias estructurales de workflows antes de depender de diagnósticos compuestos en operación.');
    }
    recommendations.push('Usar esta skill como chequeo compuesto previo a nuevos wrappers o a una capacidad nativa de incident triage de ingestión.');

    const successfulChecks = checks.filter((check) => check.status === 'success').length;

    context.telemetry.record({
      name: 'skill_ingest_edge_observability.completed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        successfulChecks,
        totalChecks: checks.length,
        configReady,
        workflowReady
      }
    });

    return {
      status: 'success',
      data: {
        summary: {
          overallStatus: configReady && workflowReady && topologyMapped ? 'ready' : 'attention_needed',
          passedChecks: successfulChecks,
          totalChecks: checks.length
        },
        checks,
        topology,
        risks,
        readinessAssessment,
        recommendations
      },
      metadata: createSkillMetadata(
        'skill_ingest_edge_observability',
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
