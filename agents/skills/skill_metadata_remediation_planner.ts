import type { SkillDefinition } from '../types/skill';
import {
  executeMetadataRemediationPlanner,
  type MetadataRemediationPlannerData,
  type MetadataRemediationPlannerInput
} from './diagnostics/skill_metadata_remediation_planner/executor';

export const skill: SkillDefinition<MetadataRemediationPlannerInput, MetadataRemediationPlannerData> = {
  name: 'skill_metadata_remediation_planner',
  description: 'Convierte la auditoría de metadata doctrinal en batches priorizados de saneamiento seguro.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['quick', 'standard']
      },
      targetEnvironment: {
        type: 'string',
        enum: ['staging', 'local']
      },
      maxSuggestedBatches: {
        type: 'integer'
      },
      includeExamples: {
        type: 'boolean'
      },
      includeAutoFixEligibility: {
        type: 'boolean'
      }
    },
    additionalProperties: false
  },
  async execute(context, input = {}) {
    return executeMetadataRemediationPlanner(context, input);
  }
};
