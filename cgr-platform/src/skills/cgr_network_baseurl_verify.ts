import type { Env } from '../types';
import type { Incident } from '../lib/incident';

export const diagnostic_only = true;

export type CgrNetworkBaseurlResult = {
  status: 'success' | 'error';
  metadata: {
    base_url_ok: boolean;
    scheme_ok: boolean;
    host_ok: boolean;
    parsed_host: string | null;
  };
  error?: string;
};

export async function runCgrNetworkBaseurlVerify(
  env: Env,
  _incident: Incident
): Promise<CgrNetworkBaseurlResult> {
  try {
    const raw = env.CGR_BASE_URL ?? '';
    let parsedHost: string | null = null;
    let schemeOk = false;
    let hostOk = false;

    if (raw.trim().length > 0) {
      try {
        const parsed = new URL(raw);
        parsedHost = parsed.host;
        schemeOk = parsed.protocol === 'https:' || parsed.protocol === 'http:';
        hostOk = parsed.host.length > 0;
      } catch {
        parsedHost = null;
      }
    }

    const baseUrlOk = raw.trim().length > 0 && schemeOk && hostOk;

    return {
      status: 'success',
      metadata: {
        base_url_ok: baseUrlOk,
        scheme_ok: schemeOk,
        host_ok: hostOk,
        parsed_host: parsedHost
      }
    };
  } catch (error) {
    return {
      status: 'error',
      metadata: {
        base_url_ok: false,
        scheme_ok: false,
        host_ok: false,
        parsed_host: null
      },
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
