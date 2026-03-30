import { runCheckEnvSanity } from '../../../cgr-platform/src/skills/check_env_sanity';
import type { SkillDefinition } from '../../types/skill';
import { createSkillMetadata } from '../../types/skill';
import { readWranglerConfig } from '../../utils/wranglerConfig';
import { createConfigAdaptedEnv, createSyntheticIncident } from './legacyRuntimeAdapter';

interface LegacyCheckEnvSanityInput {
  environment?: string;
  cgrBaseUrl?: string;
}

interface LegacyCheckEnvSanityData {
  legacySkillName: string;
  diagnosticOnly: true;
  wrapperMode: 'config-adapted';
  adaptedEnv: {
    environment: string;
    hasDbBinding: boolean;
    hasBaseUrl: boolean;
  };
  legacyResult: {
    status: 'success' | 'error';
    metadata: {
      env_ok: boolean;
      db_binding_ok: boolean;
      base_url_ok: boolean;
    };
    error?: string;
  };
  limitations: string[];
}

export const wrappedSkill: SkillDefinition<LegacyCheckEnvSanityInput, LegacyCheckEnvSanityData> = {
  name: 'legacy_check_env_sanity',
  description: 'Wrapper del core heredado para ejecutar check_env_sanity sin modificar cgr-platform.',
  inputSchema: {
    type: 'object',
    properties: {
      environment: {
        type: 'string',
        description: 'Sobrescribe ENVIRONMENT para la prueba del wrapper.'
      },
      cgrBaseUrl: {
        type: 'string',
        description: 'Sobrescribe CGR_BASE_URL para la prueba del wrapper.'
      }
    },
    additionalProperties: false
  },
  async execute(context, input) {
    const startedAt = Date.now();
    const { config, parseError } = await readWranglerConfig(context.repoRoot);
    const { env, hasDbBinding } = createConfigAdaptedEnv(config, input);
    const incident = createSyntheticIncident(context.sessionId);
    const legacyResult = await runCheckEnvSanity(env, incident);

    context.telemetry.record({
      name: 'legacy_check_env_sanity.executed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        adaptedEnvironment: env.ENVIRONMENT ?? 'unknown',
        hasDbBinding,
        parseError
      }
    });

    return {
      status: legacyResult.status,
      data: {
        legacySkillName: 'check_env_sanity',
        diagnosticOnly: true,
        wrapperMode: 'config-adapted',
        adaptedEnv: {
          environment: env.ENVIRONMENT ?? 'unknown',
          hasDbBinding,
          hasBaseUrl: typeof env.CGR_BASE_URL === 'string' && env.CGR_BASE_URL.trim().length > 0
        },
        legacyResult,
        limitations: [
          'El wrapper adapta la skill heredada usando configuracion visible en wrangler.jsonc, no bindings vivos del Worker.',
          'db_binding_ok refleja binding declarado y adaptado, no conectividad real contra D1.',
          'La logica ejecutada es la funcion heredada runCheckEnvSanity del core.'
        ]
      },
      metadata: {
        ...createSkillMetadata(
          'legacy_check_env_sanity',
          context.sessionId,
          'Legacy Core',
          Date.now() - startedAt,
          undefined,
          {
            executionLayer: 'agents-runtime',
            capabilitySource: 'legacy-wrapper',
            legacySkillName: 'check_env_sanity',
            isDeprecated: false
          }
        )
      }
    };
  }
};
