import type { SkillDefinition } from '../types/skill';
import { createSkillMetadata } from '../types/skill';
import { inspectIngestTopology } from '../utils/ingestTopology';

interface IngestTopologyData extends Awaited<ReturnType<typeof inspectIngestTopology>> {}

export const skill: SkillDefinition<Record<string, never>, IngestTopologyData> = {
  name: 'skill_ingest_topology_scan',
  description: 'Mapea endpoints, workflows y puntos de inserción visibles del flujo de ingestión.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute(context) {
    const startedAt = Date.now();
    const topology = await inspectIngestTopology(context.repoRoot);

    context.telemetry.record({
      name: 'skill_ingest_topology_scan.completed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        endpointCount: topology.endpoints.length,
        workflowCount: topology.workflows.length
      }
    });

    return {
      status: 'success',
      data: topology,
      metadata: createSkillMetadata(
        'skill_ingest_topology_scan',
        context.sessionId,
        'repo-scan',
        Date.now() - startedAt,
        undefined,
        {
          executionLayer: 'agents-runtime',
          capabilitySource: 'repository-inspection'
        }
      )
    };
  }
};
