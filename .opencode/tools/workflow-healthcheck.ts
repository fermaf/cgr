import { tool } from "@opencode-ai/plugin"
import { readFile, readdir, access } from 'node:fs/promises'
import path from 'node:path'

interface WorkflowHealthcheckData {
  configPath: string
  wranglerConfigParsed: boolean
  parseError: string | null
  configuredWorkflows: Array<{
    name: string
    binding: string
    className: string
    filePresent: boolean
    exportedFromIndex: boolean
  }>
  detectedWorkflowFiles: string[]
  visibleBindings: {
    workflowBindings: string[]
    d1Bindings: string[]
    kvBindings: string[]
    queueProducerBindings: string[]
  }
  risks: string[]
  notes: string[]
}

interface WranglerWorkflowConfig {
  name: string
  binding: string
  class_name: string
}

interface WranglerBindingConfig {
  binding: string
  [key: string]: unknown
}

interface WranglerConfig {
  name?: string
  main?: string
  workflows?: WranglerWorkflowConfig[]
  kv_namespaces?: WranglerBindingConfig[]
  d1_databases?: WranglerBindingConfig[]
  queues?: {
    producers?: Array<{ binding: string; queue?: string }>
    consumers?: Array<Record<string, unknown>>
  }
  vars?: Record<string, unknown>
}

async function readWranglerConfig(repoRoot: string): Promise<{
  configPath: string
  config: WranglerConfig | null
  parseError: string | null
}> {
  const configPath = path.join(repoRoot, 'cgr-platform', 'wrangler.jsonc')
  try {
    const raw = await readFile(configPath, 'utf8')
    return { configPath, config: JSON.parse(raw) as WranglerConfig, parseError: null }
  } catch (error) {
    return {
      configPath,
      config: null,
      parseError: error instanceof Error ? error.message : String(error)
    }
  }
}

function classNameToFileName(className: string): string {
  return `${className.replace(/^[A-Z]+(?=[A-Z][a-z]|[0-9]|$)/, (match) => match.toLowerCase()).replace(/^[A-Z]/, (match) => match.toLowerCase())}.ts`
}

async function listWorkflowFiles(workflowsRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(workflowsRoot, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

export default tool({
  description: "Valida el estado de los workflows del backend antes de un deploy",
  args: {},
  async execute(args, context) {
    const repoRoot = context.worktree
    const { configPath, config, parseError } = await readWranglerConfig(repoRoot)
    const workflowsRoot = path.join(repoRoot, 'cgr-platform', 'src', 'workflows')
    const indexPath = path.join(repoRoot, 'cgr-platform', 'src', 'index.ts')
    const indexRaw = await readFile(indexPath, 'utf8').catch(() => '')
    const detectedWorkflowFiles: string[] = await listWorkflowFiles(workflowsRoot)
    const configuredWorkflows = (config?.workflows ?? []).map((workflow) => {
      const expectedFile = classNameToFileName(workflow.class_name)
      const exportedFromIndex = indexRaw.includes(workflow.class_name)
      const filePresent = detectedWorkflowFiles.includes(expectedFile)
      return {
        name: workflow.name,
        binding: workflow.binding,
        className: workflow.class_name,
        filePresent,
        exportedFromIndex
      }
    })

    const risks: string[] = []
    const notes: string[] = [
      'Este healthcheck valida coherencia estructural visible en el repo y wrangler.jsonc.',
      'No ejecuta workflows ni infiere estado operativo real en Cloudflare.'
    ]

    if (parseError) {
      risks.push('No fue posible parsear wrangler.jsonc; la validacion queda incompleta.')
    }
    for (const workflow of configuredWorkflows) {
      if (!workflow.filePresent) {
        risks.push(`Falta archivo esperado para ${workflow.className}.`)
      }
      if (!workflow.exportedFromIndex) {
        risks.push(`${workflow.className} no aparece exportado visiblemente en src/index.ts.`)
      }
    }
    if (configuredWorkflows.length !== detectedWorkflowFiles.length && configuredWorkflows.length > 0) {
      risks.push('La cantidad de workflows configurados no coincide exactamente con los archivos detectados.')
    }

    return {
      configPath,
      wranglerConfigParsed: parseError === null,
      parseError,
      configuredWorkflows,
      detectedWorkflowFiles,
      visibleBindings: {
        workflowBindings: (config?.workflows ?? []).map((workflow) => workflow.binding),
        d1Bindings: (config?.d1_databases ?? []).map((binding) => binding.binding),
        kvBindings: (config?.kv_namespaces ?? []).map((binding) => binding.binding),
        queueProducerBindings: (config?.queues?.producers ?? []).map((binding) => binding.binding)
      },
      risks,
      notes
    } satisfies WorkflowHealthcheckData
  }
})