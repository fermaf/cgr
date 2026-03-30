import type { Incident } from '../../../cgr-platform/src/lib/incident';
import type { Env } from '../../../cgr-platform/src/types';
import type { WranglerConfig } from '../../utils/wranglerConfig';

export function createSyntheticIncident(sessionId: string): Incident {
  return {
    ts: new Date().toISOString(),
    env: 'local',
    service: 'agents-wrapper',
    kind: 'config',
    system: 'worker',
    code: 'UNKNOWN',
    message: `legacy wrapper invocation for session ${sessionId}`
  };
}

export function createConfigAdaptedEnv(
  config: WranglerConfig | null,
  overrides: {
    environment?: string;
    cgrBaseUrl?: string;
  } = {}
): {
  env: Env;
  hasDbBinding: boolean;
  hasBaseUrl: boolean;
} {
  const hasDbBinding = Array.isArray(config?.d1_databases) && config.d1_databases.length > 0;
  const environment = typeof overrides.environment === 'string'
    ? overrides.environment
    : typeof config?.vars?.ENVIRONMENT === 'string'
      ? config.vars.ENVIRONMENT
      : 'unknown';
  const cgrBaseUrl = typeof overrides.cgrBaseUrl === 'string'
    ? overrides.cgrBaseUrl
    : typeof config?.vars?.CGR_BASE_URL === 'string'
      ? config.vars.CGR_BASE_URL
      : '';

  return {
    env: {
      ENVIRONMENT: environment,
      CGR_BASE_URL: cgrBaseUrl,
      DB: hasDbBinding ? {} as Env['DB'] : undefined as unknown as Env['DB']
    } as Env,
    hasDbBinding,
    hasBaseUrl: cgrBaseUrl.trim().length > 0
  };
}
