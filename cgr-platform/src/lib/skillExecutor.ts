import skillCatalog from '../skills/catalog.json';
import type { Incident } from './incident';

export type SkillMode = 'diagnostic_only';

export type SkillDefinition = {
  name: string;
  mode: SkillMode;
  description: string;
  owner: string;
  version: string;
};

export type SkillExecution = {
  skill: string;
  mode: SkillMode;
  status: 'executed' | 'skipped';
  reason: string;
  output?: Record<string, unknown>;
};

function getCatalog(): SkillDefinition[] {
  const raw = (skillCatalog as any)?.skills;
  return Array.isArray(raw) ? raw : [];
}

function findSkill(name: string): SkillDefinition | undefined {
  return getCatalog().find((skill) => skill.name === name);
}

export async function executeSkill(skillName: string, incident: Incident): Promise<SkillExecution> {
  const def = findSkill(skillName);
  if (!def) {
    return {
      skill: skillName,
      mode: 'diagnostic_only',
      status: 'skipped',
      reason: 'skill_not_in_catalog'
    };
  }

  if (def.mode !== 'diagnostic_only') {
    return {
      skill: skillName,
      mode: def.mode,
      status: 'skipped',
      reason: 'mode_not_allowed'
    };
  }

  // Stub diagnostico. En Etapa 2 Iteracion 1 no se ejecutan efectos.
  return {
    skill: skillName,
    mode: def.mode,
    status: 'executed',
    reason: 'diagnostic_stub',
    output: {
      incident_code: incident.code,
      incident_system: incident.system,
      incident_service: incident.service
    }
  };
}
