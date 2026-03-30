import { resolveSkill } from '../skills';
import type { SkillContext, SkillExecutionResult } from '../types/skill';

export async function executeRegisteredSkill(
  context: SkillContext,
  skillName: string,
  input: Record<string, unknown> = {}
): Promise<SkillExecutionResult<object>> {
  const resolved = resolveSkill(skillName);

  if (!resolved) {
    throw new Error(`Skill not registered for composition: ${skillName}`);
  }

  return resolved.skill.execute(context, input);
}
