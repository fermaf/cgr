// cgr-platform/src/lib/incidentRouter.ts
import type { Incident, IncidentCode } from './incident';

export type RouteDecision = {
  matched: boolean;
  skill: string;
  reason: string;
};

const RULES: Record<IncidentCode, { skill: string; reason: string }> = {
  D1_NO_SUCH_TABLE: {
    skill: 'd1_missing_table_triage',
    reason: 'D1_NO_SUCH_TABLE'
  },
  D1_NO_SUCH_COLUMN: {
    skill: 'd1_remote_schema_verify',
    reason: 'D1_NO_SUCH_COLUMN'
  },
  D1_SQL_ERROR: {
    skill: 'd1_sql_error_triage',
    reason: 'D1_SQL_ERROR'
  },
  WORKFLOW_TEST_ERROR: {
    skill: 'skill_test_handler',
    reason: 'WORKFLOW_TEST_ERROR'
  },
  WORKFLOW_RPC_EXCEPTION: {
    skill: 'workflow_rpc_this_capture_guard',
    reason: 'WORKFLOW_RPC_EXCEPTION'
  },
  WORKER_INTERNAL_ERROR_REFERENCE: {
    skill: 'worker_internal_error_triage',
    reason: 'WORKER_INTERNAL_ERROR_REFERENCE'
  },
  NETWORK_DNS_LOOKUP_FAILED: {
    skill: 'cgr_network_baseurl_verify',
    reason: 'NETWORK_DNS_LOOKUP_FAILED'
  },
  NETWORK_FETCH_FAILED: {
    skill: 'cgr_network_retry_triage',
    reason: 'NETWORK_FETCH_FAILED'
  },
  HTTP_429_RATE_LIMIT: {
    skill: 'cgr_rate_limit_backoff',
    reason: 'HTTP_429_RATE_LIMIT'
  },
  HTTP_4XX_CLIENT_ERROR: {
    skill: 'cgr_http_4xx_triage',
    reason: 'HTTP_4XX_CLIENT_ERROR'
  },
  HTTP_5XX: {
    skill: 'cgr_http_5xx_triage',
    reason: 'HTTP_5XX'
  },
  AI_GATEWAY_TIMEOUT: {
    skill: 'mistral_timeout_triage',
    reason: 'AI_GATEWAY_TIMEOUT'
  },
  UNKNOWN: {
    skill: '__UNMATCHED__',
    reason: 'UNKNOWN'
  }
};

export function routeIncident(incident: Incident): RouteDecision {
  const matchedRule = RULES[incident.code];
  if (matchedRule && matchedRule.skill !== '__UNMATCHED__') {
    return {
      matched: true,
      skill: matchedRule.skill,
      reason: matchedRule.reason
    };
  }

  return {
    matched: false,
    skill: '__UNMATCHED__',
    reason: `NO_RULE_FOR_${incident.code}`
  };
}
