import { tool } from "@opencode-ai/plugin"
import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

interface RepoContextScanData {
  repoRoot: string
  cgrPlatformPresent: boolean
  legacySkills: string[]
  legacySkillFiles: string[]
  workflows: string[]
  legacyRouters: string[]
  risks: string[]
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function safeReadJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function listTsFiles(directoryPath: string): Promise<string[]> {
  if (!(await pathExists(directoryPath))) {
    return []
  }
  const entries = await readdir(directoryPath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name)
    .sort()
}

export default tool({
  description: "Escanea la estructura del repositorio para entender el estado actual del proyecto",
  args: {
    includeCatalogEntries: tool.schema.boolean().optional().describe("Incluye nombres del catálogo legado al reporte.")
  },
  async execute(args, context) {
    const repoRoot = context.worktree
    const cgrPlatformRoot = path.join(repoRoot, 'cgr-platform')
    const skillsRoot = path.join(cgrPlatformRoot, 'src', 'skills')
    const workflowsRoot = path.join(cgrPlatformRoot, 'src', 'workflows')
    const catalogPath = path.join(skillsRoot, 'catalog.json')
    const incidentRouterPath = path.join(cgrPlatformRoot, 'src', 'lib', 'incidentRouter.ts')
    const legacySkillRouterPath = path.join(cgrPlatformRoot, 'src', 'lib', 'skillRouter.ts')

    const cgrPlatformPresent = await pathExists(cgrPlatformRoot)
    const catalog = await safeReadJson<{ skills?: Array<{ name?: string }> }>(catalogPath, {})
    const legacySkillFiles = await listTsFiles(skillsRoot)
    const workflows = await listTsFiles(workflowsRoot)
    const legacyRouters = [
      (await pathExists(incidentRouterPath)) ? 'src/lib/incidentRouter.ts' : null,
      (await pathExists(legacySkillRouterPath)) ? 'src/lib/skillRouter.ts' : null
    ].filter((value): value is string => value !== null)
    const legacySkills = args.includeCatalogEntries === false
      ? []
      : (catalog.skills ?? [])
          .map((entry) => entry.name)
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
          .sort()

    const risks: string[] = []
    if (!cgrPlatformPresent) {
      risks.push('No se detecta cgr-platform; el bridge hacia la arquitectura heredada queda inactivo.')
    }
    if (legacyRouters.length > 1) {
      risks.push('Existen dos mecanismos de routing legado detectables: incidentRouter activo y skillRouter historico.')
    }
    if (legacySkills.includes('__UNMATCHED__')) {
      risks.push('El catalogo heredado usa __UNMATCHED__ como fallback.')
    }
    if (legacySkillFiles.length > legacySkills.length && legacySkills.length > 0) {
      risks.push('Hay más archivos de skills que entradas en catalog.json.')
    }
    if (workflows.length > 0) {
      risks.push('Los workflows viven solo en cgr-platform; /agents debe invocarlos via wrappers o adaptadores.')
    }

    return {
      repoRoot,
      cgrPlatformPresent,
      legacySkills,
      legacySkillFiles,
      workflows,
      legacyRouters,
      risks
    } satisfies RepoContextScanData
  }
})