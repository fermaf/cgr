import type { SkillDefinition } from '../types/skill';
import {
  executeDoctrineCoherenceAudit,
  type DoctrineCoherenceAuditData,
  type DoctrineCoherenceAuditInput
} from './diagnostics/skill_doctrine_coherence_audit/executor';

export const skill: SkillDefinition<DoctrineCoherenceAuditInput, DoctrineCoherenceAuditData> = {
  name: 'skill_doctrine_coherence_audit',
  description: 'Audita fragmentación, ruido y outliers doctrinales en las líneas visibles del corpus.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        description: 'Cantidad de líneas doctrinales a revisar.'
      },
      mode: {
        type: 'string',
        enum: ['quick', 'standard'],
        description: 'quick revisa pocas líneas; standard amplía la muestra.'
      },
      backendBaseUrl: {
        type: 'string',
        description: 'Base URL del backend a inspeccionar.'
      }
    },
    additionalProperties: false
  },
  async execute(context, input = {}) {
    return executeDoctrineCoherenceAudit(context, input);
  }
};
