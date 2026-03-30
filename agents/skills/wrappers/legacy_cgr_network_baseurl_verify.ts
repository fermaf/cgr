import { runCgrNetworkBaseurlVerify } from '../../../cgr-platform/src/skills/cgr_network_baseurl_verify';
import type { SkillDefinition } from '../../types/skill';
import { createSkillMetadata } from '../../types/skill';
import { readWranglerConfig } from '../../utils/wranglerConfig';
import { createConfigAdaptedEnv, createSyntheticIncident } from './legacyRuntimeAdapter';

interface LegacyCgrNetworkBaseurlVerifyInput {
  environment?: string;
  cgrBaseUrl?: string;
}

interface LegacyCgrNetworkBaseurlVerifyData {
  legacySkillName: string;
  diagnosticOnly: true;
  wrapperMode: 'config-adapted';
  adaptedEnv: {
    environment: string;
    hasBaseUrl: boolean;
  };
  legacyResult: {
    status: 'success' | 'error';
    metadata: {
      base_url_ok: boolean;
      scheme_ok: boolean;
      host_ok: boolean;
      parsed_host: string | null;
    };
    error?: string;
  };
  limitations: string[];
}

export const wrappedSkill: SkillDefinition<LegacyCgrNetworkBaseurlVerifyInput, LegacyCgrNetworkBaseurlVerifyData> = {
  name: 'legacy_cgr_network_baseurl_verify',
  description: 'Wrapper del core heredado para ejecutar cgr_network_baseurl_verify sin modificar cgr-platform.',
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
    const { env, hasBaseUrl } = createConfigAdaptedEnv(config, input);
    const incident = createSyntheticIncident(context.sessionId);
    const legacyResult = await runCgrNetworkBaseurlVerify(env, incident);

    context.telemetry.record({
      name: 'legacy_cgr_network_baseurl_verify.executed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        adaptedEnvironment: env.ENVIRONMENT ?? 'unknown',
        hasBaseUrl,
        parseError
      }
    });

    return {
      status: legacyResult.status,
      data: {
        legacySkillName: 'cgr_network_baseurl_verify',
        diagnosticOnly: true,
        wrapperMode: 'config-adapted',
        adaptedEnv: {
          environment: env.ENVIRONMENT ?? 'unknown',
          hasBaseUrl
        },
        legacyResult,
        limitations: [
          'El wrapper adapta la skill heredada usando configuracion visible en wrangler.jsonc, no conectividad real contra el host remoto.',
          'base_url_ok refleja formato visible y parseable, no reachability efectiva del endpoint.',
          'La logica ejecutada es la funcion heredada runCgrNetworkBaseurlVerify del core.'
        ]
      },
      metadata: createSkillMetadata(
        'legacy_cgr_network_baseurl_verify',
        context.sessionId,
        'Legacy Core',
        Date.now() - startedAt,
        undefined,
        {
          executionLayer: 'agents-runtime',
          capabilitySource: 'legacy-wrapper',
          legacySkillName: 'cgr_network_baseurl_verify',
          isDeprecated: false
        }
      )
    };
  }
};
