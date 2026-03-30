import type { SkillDefinition } from '../types/skill';
import {
  executeEmbeddingConsistencyCheck,
  type EmbeddingConsistencyCheckData,
  type EmbeddingConsistencyCheckInput
} from './diagnostics/skill_embedding_consistency_check/executor';

export const skill: SkillDefinition<EmbeddingConsistencyCheckInput, EmbeddingConsistencyCheckData> = {
  name: 'skill_embedding_consistency_check',
  description: 'Audita consistencia entre D1, Pinecone, namespace activo y metadata doctrinal del corpus.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'Namespace Pinecone a inspeccionar. Si se omite, usa el namespace activo del entorno seleccionado.'
      },
      sampleSize: {
        type: 'integer',
        description: 'Cantidad de dictámenes a muestrear para contraste D1 ↔ Pinecone.'
      },
      mode: {
        type: 'string',
        enum: ['quick', 'standard'],
        description: 'quick usa un sample pequeño; standard profundiza más en la cohorte.'
      },
      includeMetadataAudit: {
        type: 'boolean',
        description: 'Incluye auditoría mínima de materia, labels y campos doctrinales.'
      },
      targetEnvironment: {
        type: 'string',
        enum: ['staging', 'local'],
        description: 'Entorno objetivo. staging usa Cloudflare D1 read-only vía API oficial.'
      },
      searchProbe: {
        type: 'string',
        description: 'Consulta semántica de prueba para verificar salud mínima del retrieval.'
      }
    },
    additionalProperties: false
  },
  async execute(context, input = {}) {
    return executeEmbeddingConsistencyCheck(context, input);
  }
};
