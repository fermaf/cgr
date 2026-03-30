import { wrappedLegacySkills } from '../skills/wrappers';
import type { LegacySkillInspection } from './legacyCoreInspection';
import { inspectLegacyCapabilities } from './legacyCoreInspection';
import { inspectIngestTopology } from './ingestTopology';

export type ConvergenceRecommendation =
  | 'wrap_now'
  | 'wrap_later'
  | 'replace_with_native'
  | 'leave_as_is'
  | 'avoid_for_now';

export type ConvergencePriority = 'P0' | 'P1' | 'P2' | 'P3';
export type OperationalValue = 'high' | 'medium' | 'low';

export interface CapabilityConvergenceEntry {
  name: string;
  probableType: LegacySkillInspection['probableType'];
  risk: LegacySkillInspection['riskLevel'];
  operationalValueForIndubia: OperationalValue;
  visibleDependencies: string[];
  alreadyWrapped: boolean;
  plausibleNativeReplacement: string | null;
  recommendation: ConvergenceRecommendation;
  justification: string;
  suggestedPriority: ConvergencePriority;
}

export interface CapabilityConvergenceReport {
  generatedFrom: {
    legacyCapabilities: number;
    wrappedCapabilities: number;
    ingestAssociatedDiagnostics: number;
  };
  backlog: CapabilityConvergenceEntry[];
  notes: string[];
}

function hasIngestAffinity(capabilityName: string, ingestDiagnosticSkills: string[]): boolean {
  return ingestDiagnosticSkills.includes(capabilityName);
}

function determineOperationalValue(capability: LegacySkillInspection, ingestDiagnosticSkills: string[]): OperationalValue {
  if (hasIngestAffinity(capability.name, ingestDiagnosticSkills)) {
    if (capability.probableType === 'config-diagnostic' || capability.probableType === 'network-diagnostic') {
      return 'high';
    }

    return 'medium';
  }

  if (capability.probableType === 'fallback') {
    return 'low';
  }

  return capability.riskLevel === 'low' ? 'medium' : 'low';
}

function chooseRecommendation(
  capability: LegacySkillInspection,
  operationalValue: OperationalValue,
  alreadyWrapped: boolean
): { recommendation: ConvergenceRecommendation; priority: ConvergencePriority; justification: string } {
  if (capability.name === '__UNMATCHED__') {
    return {
      recommendation: 'avoid_for_now',
      priority: 'P3',
      justification: 'Es un fallback de catálogo, no una capacidad reusable de alto valor para agentes.'
    };
  }

  if (capability.suggestedIsDeprecated && capability.possibleRuntimeReplacement) {
    return {
      recommendation: 'replace_with_native',
      priority: 'P2',
      justification: `Ya existe una capacidad de /agents que cubre razonablemente esta necesidad: ${capability.possibleRuntimeReplacement}.`
    };
  }

  if (alreadyWrapped) {
    return {
      recommendation: 'leave_as_is',
      priority: operationalValue === 'high' ? 'P1' : 'P2',
      justification: 'Ya existe wrapper operativo; conviene estabilizar telemetría y uso antes de abrir otra migración.'
    };
  }

  if (operationalValue === 'high' && capability.wrappeable && capability.riskLevel === 'low') {
    return {
      recommendation: 'wrap_now',
      priority: 'P0',
      justification: 'Está cerca del flujo real de ingestión, es diagnóstica y su wrapping visible parece de bajo riesgo.'
    };
  }

  if ((operationalValue === 'high' || operationalValue === 'medium') && capability.wrappeable) {
    return {
      recommendation: 'wrap_later',
      priority: capability.riskLevel === 'medium' ? 'P1' : 'P2',
      justification: 'Tiene valor operativo, pero requiere un adaptador más cuidadoso o no supera todavía al trabajo ya en curso.'
    };
  }

  return {
    recommendation: 'avoid_for_now',
    priority: 'P3',
    justification: 'No ofrece suficiente valor inmediato frente a su riesgo o complejidad visible.'
  };
}

function priorityRank(priority: ConvergencePriority): number {
  return ['P0', 'P1', 'P2', 'P3'].indexOf(priority);
}

export async function buildCapabilityConvergenceReport(repoRoot: string): Promise<CapabilityConvergenceReport> {
  const [capabilities, ingestTopology] = await Promise.all([
    inspectLegacyCapabilities(repoRoot),
    inspectIngestTopology(repoRoot)
  ]);
  const wrappedLegacyNames = new Set(
    wrappedLegacySkills
      .map((entry) => entry.name.startsWith('legacy_') ? entry.name.slice('legacy_'.length) : entry.name)
  );

  const backlog = capabilities
    .map((capability) => {
      const operationalValueForIndubia = determineOperationalValue(capability, ingestTopology.associatedDiagnosticSkills);
      const alreadyWrapped = wrappedLegacyNames.has(capability.name);
      const decision = chooseRecommendation(capability, operationalValueForIndubia, alreadyWrapped);

      return {
        name: capability.name,
        probableType: capability.probableType,
        risk: capability.riskLevel,
        operationalValueForIndubia,
        visibleDependencies: capability.visibleDependencies,
        alreadyWrapped,
        plausibleNativeReplacement: capability.possibleRuntimeReplacement,
        recommendation: decision.recommendation,
        justification: decision.justification,
        suggestedPriority: decision.priority
      };
    })
    .sort((left, right) => {
      const priorityDelta = priorityRank(left.suggestedPriority) - priorityRank(right.suggestedPriority);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.name.localeCompare(right.name);
    });

  return {
    generatedFrom: {
      legacyCapabilities: capabilities.length,
      wrappedCapabilities: wrappedLegacyNames.size,
      ingestAssociatedDiagnostics: ingestTopology.associatedDiagnosticSkills.length
    },
    backlog,
    notes: [
      'El reporte prioriza cercanía con ingestión, utilidad diagnóstica, bajo riesgo y reutilización futura para agentes.',
      'replace_with_native no implica desactivar nada automáticamente; sólo indica que la siguiente inversión debe ir al reemplazo nativo, no a otro wrapper.',
      'wrap_now apunta a la mejor siguiente convergencia útil sin tocar producción.'
    ]
  };
}
