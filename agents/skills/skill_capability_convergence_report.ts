import type { SkillDefinition } from '../types/skill';
import { createSkillMetadata } from '../types/skill';
import { buildCapabilityConvergenceReport } from '../utils/capabilityConvergence';

interface CapabilityConvergenceReportData extends Awaited<ReturnType<typeof buildCapabilityConvergenceReport>> {}

export const skill: SkillDefinition<Record<string, never>, CapabilityConvergenceReportData> = {
  name: 'skill_capability_convergence_report',
  description: 'Genera backlog priorizado de convergencia entre /agents y capacidades heredadas.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute(context) {
    const startedAt = Date.now();
    const report = await buildCapabilityConvergenceReport(context.repoRoot);

    context.telemetry.record({
      name: 'skill_capability_convergence_report.completed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        backlogSize: report.backlog.length,
        p0Count: report.backlog.filter((entry) => entry.suggestedPriority === 'P0').length
      }
    });

    return {
      status: 'success',
      data: report,
      metadata: createSkillMetadata(
        'skill_capability_convergence_report',
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
