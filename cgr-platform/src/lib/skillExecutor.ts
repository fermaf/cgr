import skillCatalog from '../skills/catalog.json';
import type { Incident } from './incident';

export type SkillMode = 'diagnostic' | 'disabled';

export type SkillDefinition = {
  name: string;
  diagnostic_only: boolean;
  mode?: SkillMode;
  description: string;
  owner: string;
  version: string;
};

export type SkillExecution = {
  skill: string;
  mode: SkillMode;
  status: 'success' | 'error';
  reason: string;
  output: Record<string, unknown>;
};

function getCatalog(): SkillDefinition[] {
  const raw = (skillCatalog as any)?.skills;
  return Array.isArray(raw) ? raw : [];
}

function findSkill(name: string): SkillDefinition | undefined {
  return getCatalog().find((skill) => skill.name === name);
}

function resolveMode(def?: SkillDefinition): SkillMode {
  if (!def) return 'disabled';
  if (def.mode === 'diagnostic' || def.mode === 'disabled') return def.mode;
  return def.diagnostic_only ? 'diagnostic' : 'disabled';
}

function buildOutput(incident: Incident): Record<string, unknown> {
  return {
    incident_code: incident.code,
    incident_system: incident.system,
    incident_service: incident.service
  };
}

export async function executeSkill(skillName: string, incident: Incident): Promise<SkillExecution> {
  const def = findSkill(skillName);
  const mode = resolveMode(def);
  if (!def) {
    return {
      skill: skillName,
      mode,
      status: 'error',
      reason: 'skill_not_in_catalog',
      output: buildOutput(incident)
    };
  }

  if (!def.diagnostic_only) {
    return {
      skill: skillName,
      mode,
      status: 'error',
      reason: 'diagnostic_only_required',
      output: buildOutput(incident)
    };
  }

  // Stub diagnostico. En Etapa 2 Iteracion 1 no se ejecutan efectos.
  return {
    skill: skillName,
    mode,
    status: 'success',
    reason: 'diagnostic_stub',
    output: buildOutput(incident)
  };
}
