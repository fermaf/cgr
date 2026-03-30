import type { SkillDefinition } from '../../types/skill';
import { wrappedSkill as legacyCgrNetworkBaseurlVerifySkill } from './legacy_cgr_network_baseurl_verify';
import { wrappedSkill as legacyCheckEnvSanitySkill } from './legacy_check_env_sanity';

export interface WrappedLegacySkillDescriptor {
  name: string;
  legacySource: string;
  notes: string;
  skill: SkillDefinition<object, object>;
}

export const wrappedLegacySkills: WrappedLegacySkillDescriptor[] = [
  {
    name: legacyCgrNetworkBaseurlVerifySkill.name,
    legacySource: 'cgr-platform/src/skills/cgr_network_baseurl_verify.ts',
    notes: 'Segundo wrapper operativo. Reutiliza la verificacion heredada de CGR_BASE_URL sin tocar el core.',
    skill: legacyCgrNetworkBaseurlVerifySkill
  },
  {
    name: legacyCheckEnvSanitySkill.name,
    legacySource: 'cgr-platform/src/skills/check_env_sanity.ts',
    notes: 'Wrapper inicial del core heredado. El nombre se prefija con legacy_ para evitar colisiones con el catalogo nativo futuro.',
    skill: legacyCheckEnvSanitySkill
  }
];
