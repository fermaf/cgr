import type { SkillDefinition } from '../types/skill';
import {
  executeMetadataAutoNormalizationExecutor,
  type MetadataAutoNormalizationExecutorData,
  type MetadataAutoNormalizationExecutorInput
} from './diagnostics/skill_metadata_auto_normalization_executor/executor';

export const skill: SkillDefinition<MetadataAutoNormalizationExecutorInput, MetadataAutoNormalizationExecutorData> = {
  name: 'skill_metadata_auto_normalization_executor',
  description: 'Ejecuta normalización automática controlada solo sobre etiquetas_json de bajo riesgo.',
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
      allowedNormalizationTypes: {
        type: 'array',
        items: { type: 'string' }
      },
      allowIds: {
        type: 'array',
        items: { type: 'string' }
      },
      includeExamples: {
        type: 'boolean'
      }
    },
    additionalProperties: false
  },
  async execute(context, input = {}) {
    return executeMetadataAutoNormalizationExecutor(context, input);
  }
};
