import type { SkillDefinition } from '../types/skill';
import {
  executeMetadataBlockerRegenerationExecutor,
  type MetadataBlockerRegenerationExecutorData,
  type MetadataBlockerRegenerationExecutorInput
} from './diagnostics/skill_metadata_blocker_regeneration_executor/executor';

export const skill: SkillDefinition<MetadataBlockerRegenerationExecutorInput, MetadataBlockerRegenerationExecutorData> = {
  name: 'skill_metadata_blocker_regeneration_executor',
  description: 'Clasifica blockers críticos y prepara su regeneración puntual con guardas de seguridad.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['preview', 'apply']
      },
      targetEnvironment: {
        type: 'string',
        enum: ['staging', 'local']
      },
      maxBatchSize: {
        type: 'integer'
      },
      dryRun: {
        type: 'boolean'
      },
      includeExamples: {
        type: 'boolean'
      },
      allowIds: {
        type: 'array',
        items: { type: 'string' }
      },
      reprocessBaseUrl: {
        type: 'string'
      }
    },
    additionalProperties: false
  },
  async execute(context, input = {}) {
    return executeMetadataBlockerRegenerationExecutor(context, input);
  }
};
