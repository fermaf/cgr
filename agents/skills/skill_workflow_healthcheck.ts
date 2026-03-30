import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { SkillDefinition } from '../types/skill';
import { createSkillMetadata } from '../types/skill';
import { readWranglerConfig } from '../utils/wranglerConfig';

interface WorkflowHealthcheckData {
  configPath: string;
  wranglerConfigParsed: boolean;
  parseError: string | null;
  configuredWorkflows: Array<{
    name: string;
    binding: string;
    className: string;
    filePresent: boolean;
    exportedFromIndex: boolean;
  }>;
  detectedWorkflowFiles: string[];
  visibleBindings: {
    workflowBindings: string[];
    d1Bindings: string[];
    kvBindings: string[];
    queueProducerBindings: string[];
  };
  risks: string[];
  notes: string[];
}

async function listWorkflowFiles(workflowsRoot: string): Promise<string[]> {
  const entries = await readdir(workflowsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name)
    .sort();
}

function classNameToFileName(className: string): string {
  return `${className.replace(/^[A-Z]+(?=[A-Z][a-z]|[0-9]|$)/, (match) => match.toLowerCase()).replace(/^[A-Z]/, (match) => match.toLowerCase())}.ts`;
}

export const skill: SkillDefinition<Record<string, never>, WorkflowHealthcheckData> = {
  name: 'skill_workflow_healthcheck',
  description: 'Inspecciona configuracion y estructura de workflows de cgr-platform sin ejecutarlos.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute(context) {
    const startedAt = Date.now();
    const { configPath, config, parseError } = await readWranglerConfig(context.repoRoot);
    const workflowsRoot = path.join(context.repoRoot, 'cgr-platform', 'src', 'workflows');
    const indexPath = path.join(context.repoRoot, 'cgr-platform', 'src', 'index.ts');
    const indexRaw = await readFile(indexPath, 'utf8').catch(() => '');
    const detectedWorkflowFiles: string[] = await listWorkflowFiles(workflowsRoot).catch(() => [] as string[]);
    const configuredWorkflows = (config?.workflows ?? []).map((workflow) => {
      const expectedFile = classNameToFileName(workflow.class_name);
      const exportedFromIndex = indexRaw.includes(workflow.class_name);
      const filePresent = detectedWorkflowFiles.includes(expectedFile);

      return {
        name: workflow.name,
        binding: workflow.binding,
        className: workflow.class_name,
        filePresent,
        exportedFromIndex
      };
    });

    const risks: string[] = [];
    const notes: string[] = [
      'Este healthcheck valida coherencia estructural visible en el repo y wrangler.jsonc.',
      'No ejecuta workflows ni infiere estado operativo real en Cloudflare.'
    ];

    if (parseError) {
      risks.push('No fue posible parsear wrangler.jsonc; la validacion queda incompleta.');
    }

    for (const workflow of configuredWorkflows) {
      if (!workflow.filePresent) {
        risks.push(`Falta archivo esperado para ${workflow.className}.`);
      }
      if (!workflow.exportedFromIndex) {
        risks.push(`${workflow.className} no aparece exportado visiblemente en src/index.ts.`);
      }
    }

    if (configuredWorkflows.length !== detectedWorkflowFiles.length && configuredWorkflows.length > 0) {
      risks.push('La cantidad de workflows configurados no coincide exactamente con los archivos detectados en src/workflows.');
    }

    context.telemetry.record({
      name: 'skill_workflow_healthcheck.completed',
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId,
      attributes: {
        configuredWorkflowCount: configuredWorkflows.length,
        detectedWorkflowFileCount: detectedWorkflowFiles.length,
        parseError
      }
    });

    return {
      status: parseError ? 'error' : 'success',
      data: {
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
      },
      metadata: createSkillMetadata(
        'skill_workflow_healthcheck',
        context.sessionId,
        'agents-native',
        Date.now() - startedAt,
        undefined,
        {
          executionLayer: 'agents-runtime',
          capabilitySource: 'native-runtime'
        }
      )
    };
  }
};
