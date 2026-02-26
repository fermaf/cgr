import type { Env } from '../types';
import type { Incident } from '../lib/incident';

export const diagnostic_only = true;

export type CheckEnvSanityResult = {
  status: 'success' | 'error';
  metadata: {
    env_ok: boolean;
    db_binding_ok: boolean;
    base_url_ok: boolean;
  };
  error?: string;
};

export async function runCheckEnvSanity(
  env: Env,
  _incident: Incident
): Promise<CheckEnvSanityResult> {
  try {
    const envValue = env.ENVIRONMENT ?? 'unknown';
    const envOk = envValue === 'local' || envValue === 'prod' || envValue === 'staging';
    const dbBindingOk = Boolean(env.DB);
    const baseUrlOk = typeof env.CGR_BASE_URL === 'string' && env.CGR_BASE_URL.trim().length > 0;

    return {
      status: 'success',
      metadata: {
        env_ok: envOk,
        db_binding_ok: dbBindingOk,
        base_url_ok: baseUrlOk
      }
    };
  } catch (error) {
    return {
      status: 'error',
      metadata: {
        env_ok: false,
        db_binding_ok: false,
        base_url_ok: false
      },
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
