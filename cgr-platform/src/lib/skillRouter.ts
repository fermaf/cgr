// HISTORICO - NO USADO EN ETAPA 1.
// Router activo para skillgen: src/lib/incidentRouter.ts

import routerRules from '../skills/router_rules.json';

export type RouterMatch = {
  rule_id: string;
  match_type: 'string' | 'regex' | 'code';
  pattern: string;
  route_to: string;
  groups?: string[];
};

export type RouterResult = {
  matched_skill: string | null;
  matches: RouterMatch[];
};

function matchRule(errorMessage: string, rule: any): RouterMatch | null {
  const match = rule?.match;
  if (!match || !match.type || !match.pattern || !rule?.route_to) return null;
  if (match.type === 'string') {
    if (!errorMessage.includes(match.pattern)) return null;
    return {
      rule_id: String(rule.id ?? ''),
      match_type: 'string',
      pattern: String(match.pattern),
      route_to: String(rule.route_to)
    };
  }
  if (match.type === 'regex') {
    try {
      const re = new RegExp(match.pattern);
      const result = re.exec(errorMessage);
      if (!result) return null;
      return {
        rule_id: String(rule.id ?? ''),
        match_type: 'regex',
        pattern: String(match.pattern),
        route_to: String(rule.route_to),
        groups: result.slice(1)
      };
    } catch {
      return null;
    }
  }
  return null;
}

export function evaluateSkillRouter(errorMessage: string): RouterResult {
  try {
    const rules = Array.isArray((routerRules as any)?.result) ? (routerRules as any).result : [];
    console.log("router rules loaded:", rules.length);
    const matches: RouterMatch[] = [];
    for (const rule of rules) {
      const m = matchRule(errorMessage, rule);
      if (m) matches.push(m);
    }
    return { matched_skill: matches[0]?.route_to ?? null, matches };
  } catch (e) {
    console.log("router failed:", String(e));
    return { matched_skill: null, matches: [] };
  }
}

export function resolveEnvTag(): string {
  try {
    const nodeEnv = typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined;
    return nodeEnv === 'production' ? 'prod' : 'local';
  } catch {
    return 'local';
  }
}

export function resolveRemoteFlag(envTag: string): boolean {
  return envTag === 'prod';
}
