import type { SkillDefinition } from '../types/skill';
import { createSkillMetadata } from '../types/skill';
import { inspectLegacyCapabilities } from '../utils/legacyCoreInspection';

interface LegacyCapabilitiesInventoryData {
  totalLegacySkills: number;
  wrappedCapabilities: string[];
  capabilities: Awaited<ReturnType<typeof inspectLegacyCapabilities>>;
  notes: string[];
}

export const skill: SkillDefinition<Record<string, never>, LegacyCapabilitiesInventoryData> = {
  name: 'skill_legacy_capabilities_inventory',
  description: 'Construye inventario prudente de capacidades heredadas para convergencia con /agents.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute(context) {
    const startedAt = Date.now();
    const capabilities = await inspectLegacyCapabilities(context.repoRoot);
    const wrappedCapabilities = capabilities
      .filter((capability) => capability.possibleRuntimeReplacement?.startsWith('legacy_'))
      .map((capability) => capability.name)
      .sort();

    context.telemetry.record({
      name: 'skill_legacy_capabilities_inventory.completed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        totalLegacySkills: capabilities.length,
        wrappedCapabilities: wrappedCapabilities.length
      }
    });

    return {
      status: 'success',
      data: {
        totalLegacySkills: capabilities.length,
        wrappedCapabilities,
        capabilities,
        notes: [
          'El inventario clasifica por señales visibles del repo: imports, uso de env, acceso a DB y descripción del catálogo.',
          'wrappeable no significa listo para producción; sólo indica si un wrapper conservador parece factible sin duplicar lógica.',
          'suggestedIsDeprecated solo se activa cuando ya existe un reemplazo mejor en /agents, no cuando existe un wrapper del mismo legado.'
        ]
      },
      metadata: createSkillMetadata(
        'skill_legacy_capabilities_inventory',
        context.sessionId,
        'repo-scan',
        Date.now() - startedAt,
        undefined,
        {
          executionLayer: 'agents-runtime',
          capabilitySource: 'repository-inspection'
        }
      )
    };
  }
};
