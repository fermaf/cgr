import type { Incident } from '../lib/incident';
import type { RouteDecision } from '../lib/incidentRouter';
import skillCatalog from './catalog.json';

export const diagnostic_only = true;

export type CheckRouterConsistencyResult = {
  status: 'success' | 'error';
  metadata: {
    decision_structure_ok: boolean;
    fallback_present: boolean;
  };
  error?: string;
};

export async function runCheckRouterConsistency(
  _incident: Incident,
  decision: RouteDecision
): Promise<CheckRouterConsistencyResult> {
  try {
    const decisionStructureOk =
      typeof decision.matched === 'boolean' &&
      typeof decision.skill === 'string' &&
      typeof decision.reason === 'string';

    const skills = Array.isArray((skillCatalog as any)?.skills) ? (skillCatalog as any).skills : [];
    const fallbackPresent = skills.some((skill: any) => skill?.name === '__UNMATCHED__');

    return {
      status: 'success',
      metadata: {
        decision_structure_ok: decisionStructureOk,
        fallback_present: fallbackPresent
      }
    };
  } catch (error) {
    return {
      status: 'error',
      metadata: {
        decision_structure_ok: false,
        fallback_present: false
      },
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
