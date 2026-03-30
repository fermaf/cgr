import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { SkillDefinition } from '../types/skill';
import { createSkillMetadata } from '../types/skill';

interface RepoContextScanInput {
  includeCatalogEntries?: boolean;
}

interface RepoContextScanData {
  repoRoot: string;
  cgrPlatformPresent: boolean;
  legacySkills: string[];
  legacySkillFiles: string[];
  workflows: string[];
  legacyRouters: string[];
  risks: string[];
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function safeReadJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function listTsFiles(directoryPath: string): Promise<string[]> {
  if (!(await pathExists(directoryPath))) {
    return [];
  }

  const entries = await readdir(directoryPath, {
    withFileTypes: true
  });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name)
    .sort();
}

export const skill: SkillDefinition<RepoContextScanInput, RepoContextScanData> = {
  name: 'skill_repo_context_scan',
  description: 'Inspecciona el repo para detectar skills heredadas, workflows y riesgos de convergencia.',
  inputSchema: {
    type: 'object',
    properties: {
      includeCatalogEntries: {
        type: 'boolean',
        description: 'Incluye nombres del catalogo legado al reporte.'
      }
    },
    additionalProperties: false
  },
  async execute(context, input = {}) {
    const startedAt = Date.now();
    const cgrPlatformRoot = path.join(context.repoRoot, 'cgr-platform');
    const skillsRoot = path.join(cgrPlatformRoot, 'src', 'skills');
    const workflowsRoot = path.join(cgrPlatformRoot, 'src', 'workflows');
    const catalogPath = path.join(skillsRoot, 'catalog.json');
    const incidentRouterPath = path.join(cgrPlatformRoot, 'src', 'lib', 'incidentRouter.ts');
    const legacySkillRouterPath = path.join(cgrPlatformRoot, 'src', 'lib', 'skillRouter.ts');

    const cgrPlatformPresent = await pathExists(cgrPlatformRoot);
    const catalog = await safeReadJson<{ skills?: Array<{ name?: string }> }>(catalogPath, {});
    const legacySkillFiles = await listTsFiles(skillsRoot);
    const workflows = await listTsFiles(workflowsRoot);
    const legacyRouters = [
      (await pathExists(incidentRouterPath)) ? 'src/lib/incidentRouter.ts' : null,
      (await pathExists(legacySkillRouterPath)) ? 'src/lib/skillRouter.ts' : null
    ].filter((value): value is string => value !== null);
    const legacySkills = input.includeCatalogEntries === false
      ? []
      : (catalog.skills ?? [])
          .map((entry) => entry.name)
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
          .sort();

    const risks: string[] = [];

    if (!cgrPlatformPresent) {
      risks.push('No se detecta cgr-platform; el bridge hacia la arquitectura heredada queda inactivo.');
    }

    if (legacyRouters.length > 1) {
      risks.push('Existen dos mecanismos de routing legado detectables: incidentRouter activo y skillRouter historico.');
    }

    if (legacySkills.includes('__UNMATCHED__')) {
      risks.push('El catalogo heredado usa __UNMATCHED__ como fallback; conviene no replicar ese nombre en /agents.');
    }

    if (legacySkillFiles.length > legacySkills.length && legacySkills.length > 0) {
      risks.push('Hay mas archivos de skills que entradas en catalog.json; no toda skill heredada esta gobernada por catalogo.');
    }

    if (workflows.length > 0) {
      risks.push('Los workflows viven solo en cgr-platform; /agents debe invocarlos via wrappers o adaptadores, no reimplementarlos.');
    }

    context.telemetry.record({
      name: 'skill_repo_context_scan.completed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        cgrPlatformPresent,
        legacySkillCount: legacySkills.length,
        workflowCount: workflows.length
      }
    });

    return {
      status: 'success',
      data: {
        repoRoot: context.repoRoot,
        cgrPlatformPresent,
        legacySkills,
        legacySkillFiles,
        workflows,
        legacyRouters,
        risks
      },
      metadata: createSkillMetadata(
        'skill_repo_context_scan',
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
