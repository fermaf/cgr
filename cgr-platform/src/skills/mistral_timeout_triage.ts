import type { Env } from '../types';
import type { Incident } from '../lib/incident';

export const diagnostic_only = true;

export type MistralTimeoutResult = {
  status: 'success' | 'error';
  metadata: {
    api_url_ok: boolean;
    model_ok: boolean;
    retry_config_present: boolean;
    incident_code: string;
  };
  error?: string;
};

export async function runMistralTimeoutTriage(
  env: Env,
  incident: Incident
): Promise<MistralTimeoutResult> {
  try {
    const apiUrlOk = typeof env.MISTRAL_API_URL === 'string' && env.MISTRAL_API_URL.trim().length > 0;
    const modelOk = typeof env.MISTRAL_MODEL === 'string' && env.MISTRAL_MODEL.trim().length > 0;
    const retryConfigPresent = Boolean(
      env.MISTRAL_RETRY_MAX ||
      env.MISTRAL_RETRY_BASE_MS ||
      env.MISTRAL_MIN_INTERVAL_MS ||
      env.MISTRAL_429_BACKOFF_MS ||
      env.MISTRAL_429_THRESHOLD
    );

    return {
      status: 'success',
      metadata: {
        api_url_ok: apiUrlOk,
        model_ok: modelOk,
        retry_config_present: retryConfigPresent,
        incident_code: incident.code
      }
    };
  } catch (error) {
    return {
      status: 'error',
      metadata: {
        api_url_ok: false,
        model_ok: false,
        retry_config_present: false,
        incident_code: incident.code
      },
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
