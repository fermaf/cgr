import type { SkillDefinition } from '../types/skill';
import {
  executeMetadataQualityAudit,
  type MetadataQualityAuditData,
  type MetadataQualityAuditInput
} from './diagnostics/skill_metadata_quality_audit/executor';

export const skill: SkillDefinition<MetadataQualityAuditInput, MetadataQualityAuditData> = {
  name: 'skill_metadata_quality_audit',
  description: 'Audita calidad doctrinal de metadata en D1 y prioriza deuda por impacto de producto.',
  inputSchema: {
    type: 'object',
    properties: {
      sampleSize: {
        type: 'integer',
        description: 'Cantidad de dictámenes a muestrear para clasificar ruido doctrinal.'
      },
      mode: {
        type: 'string',
        enum: ['quick', 'standard'],
        description: 'quick usa un sample menor; standard profundiza más.'
      },
      targetEnvironment: {
        type: 'string',
        enum: ['staging', 'local'],
        description: 'Entorno objetivo. staging usa Cloudflare D1 read-only vía API oficial.'
      },
      includeProductImpact: {
        type: 'boolean',
        description: 'Incluye estimación por área de producto afectada.'
      },
      includeExamples: {
        type: 'boolean',
        description: 'Incluye ejemplos concretos por tipo de hallazgo.'
      }
    },
    additionalProperties: false
  },
  async execute(context, input = {}) {
    return executeMetadataQualityAudit(context, input);
  }
};
