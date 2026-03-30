import type { SkillDefinition } from '../types/skill';
import { createSkillMetadata } from '../types/skill';

interface PingInput {
  message?: string;
}

interface PingData {
  pong: boolean;
  message: string;
  repoRoot: string;
}

export const skill: SkillDefinition<PingInput, PingData> = {
  name: 'skill_ping',
  description: 'Skill mínima de conectividad lógica para validar el loop base del agente.',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Mensaje opcional para verificar el contrato de entrada.'
      }
    },
    additionalProperties: true
  },
  async execute(context, input = {}) {
    const startedAt = Date.now();

    context.logger.info('Executing skill_ping', {
      sessionId: context.sessionId
    });

    return {
      status: 'success',
      data: {
        pong: true,
        message: input.message ?? 'pong',
        repoRoot: context.repoRoot
      },
      metadata: createSkillMetadata(
        'skill_ping',
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
