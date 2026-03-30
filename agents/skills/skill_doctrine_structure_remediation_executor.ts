import type { SkillDefinition } from '../types/skill';
import {
  executeDoctrineStructureRemediationExecutor,
  type DoctrineStructureRemediationExecutorData,
  type DoctrineStructureRemediationExecutorInput
} from './diagnostics/skill_doctrine_structure_remediation_executor/executor';

export const skill: SkillDefinition<DoctrineStructureRemediationExecutorInput, DoctrineStructureRemediationExecutorData> = {
  name: 'skill_doctrine_structure_remediation_executor',
  description: 'Prepara y ejecuta un merge doctrinal derivado de bajo riesgo sobre líneas equivalentes.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['preview', 'apply'],
        description: 'preview no escribe; apply persiste una sola remediación derivada.'
      },
      targetEnvironment: {
        type: 'string',
        enum: ['production', 'local'],
        description: 'Entorno explícito contra el que se ejecutará la skill.'
      },
      limit: {
        type: 'integer',
        description: 'Cantidad de líneas visibles que se revisarán para seleccionar merge candidate.'
      },
      candidateIndex: {
        type: 'integer',
        description: 'Índice del merge candidate a usar dentro del ranking visible.'
      },
      backendBaseUrl: {
        type: 'string',
        description: 'Base URL del backend a inspeccionar.'
      },
      dryRun: {
        type: 'boolean',
        description: 'Si es true, no escribe aunque mode sea apply.'
      },
      confirmRepresentativeIds: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Allowlist explícita de representative IDs del merge a aplicar.'
      }
    },
    additionalProperties: false
  },
  async execute(context, input = {}) {
    return executeDoctrineStructureRemediationExecutor(context, input);
  }
};
