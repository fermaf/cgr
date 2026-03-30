import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readWranglerConfig } from './wranglerConfig';

export interface IngestEndpointInfo {
  method: 'GET' | 'POST';
  path: string;
  workflowBinding: string | null;
  visibleAuth: string[];
  notes: string[];
}

export interface IngestTopologyScan {
  endpoints: IngestEndpointInfo[];
  workflows: Array<{
    binding: string;
    className: string;
    filePath: string;
  }>;
  visibleBindings: string[];
  visibleConfig: string[];
  storage: string[];
  associatedDiagnosticSkills: string[];
  insertionPoints: string[];
  notes: string[];
}

function includesVisibleTrigger(source: string, routePath: string): boolean {
  return source.includes(`app.post('${routePath}'`) || source.includes(`app.get('${routePath}'`);
}

export async function inspectIngestTopology(repoRoot: string): Promise<IngestTopologyScan> {
  const indexPath = path.join(repoRoot, 'cgr-platform', 'src', 'index.ts');
  const ingestWorkflowPath = path.join(repoRoot, 'cgr-platform', 'src', 'workflows', 'ingestWorkflow.ts');
  const ingestLibPath = path.join(repoRoot, 'cgr-platform', 'src', 'lib', 'ingest.ts');
  const indexSource = await readFile(indexPath, 'utf8');
  const ingestWorkflowSource = await readFile(ingestWorkflowPath, 'utf8');
  const ingestLibSource = await readFile(ingestLibPath, 'utf8');
  const { config } = await readWranglerConfig(repoRoot);

  const endpoints: IngestEndpointInfo[] = [];

  if (includesVisibleTrigger(indexSource, '/api/v1/dictamenes/crawl/range')) {
    endpoints.push({
      method: 'POST',
      path: '/api/v1/dictamenes/crawl/range',
      workflowBinding: 'WORKFLOW',
      visibleAuth: [],
      notes: ['Dispara ingestión por rango de fechas usando WORKFLOW.create.']
    });
  }

  if (includesVisibleTrigger(indexSource, '/ingest/trigger')) {
    endpoints.push({
      method: 'POST',
      path: '/ingest/trigger',
      workflowBinding: 'WORKFLOW',
      visibleAuth: ['x-admin-token in prod'],
      notes: ['Trigger manual de ingest con search, limit y options visibles en el body.']
    });
  }

  if (includesVisibleTrigger(indexSource, '/api/v1/dictamenes/:id/re-process')) {
    endpoints.push({
      method: 'POST',
      path: '/api/v1/dictamenes/:id/re-process',
      workflowBinding: null,
      visibleAuth: [],
      notes: ['Reutiliza ingestDictamen sin workflow; es un punto de reproceso manual asociado al pipeline.']
    });
  }

  const workflows = (config?.workflows ?? [])
    .filter((workflow) => workflow.binding === 'WORKFLOW' || workflow.binding === 'BACKFILL_WORKFLOW')
    .map((workflow) => ({
      binding: workflow.binding,
      className: workflow.class_name,
      filePath: path.join(repoRoot, 'cgr-platform', 'src', 'workflows', `${workflow.class_name.replace(/^[A-Z]+(?=[A-Z][a-z]|[0-9]|$)/, (match) => match.toLowerCase()).replace(/^[A-Z]/, (match) => match.toLowerCase())}.ts`)
    }));

  const visibleBindings = [
    'WORKFLOW',
    'BACKFILL_WORKFLOW',
    'DB',
    'DICTAMENES_SOURCE',
    'DICTAMENES_PASO',
    'REPAIR_QUEUE'
  ].filter((binding) => indexSource.includes(`c.env.${binding}`) || ingestWorkflowSource.includes(`env.${binding}`) || ingestLibSource.includes(`env.${binding}`));

  const visibleConfig = [
    'CGR_BASE_URL',
    'BACKFILL_BATCH_SIZE',
    'BACKFILL_DELAY_MS',
    'CRAWL_DAYS_LOOKBACK',
    'INGEST_TRIGGER_TOKEN',
    'ENVIRONMENT',
    'LOG_LEVEL'
  ].filter((key) => indexSource.includes(key) || ingestWorkflowSource.includes(key));

  const storage = [
    'D1: dictamenes / atributos / skill_events / skill_runs',
    'KV: DICTAMENES_SOURCE',
    'KV: DICTAMENES_PASO'
  ].filter((entry) => {
    if (entry.includes('DICTAMENES_SOURCE')) return ingestLibSource.includes('DICTAMENES_SOURCE') || indexSource.includes('DICTAMENES_SOURCE');
    if (entry.includes('DICTAMENES_PASO')) return indexSource.includes('DICTAMENES_PASO');
    return ingestWorkflowSource.includes('recordSkillEvent') || ingestWorkflowSource.includes('recordSkillRun') || ingestLibSource.includes('upsertDictamen');
  });

  const associatedDiagnosticSkills = [
    'check_env_sanity',
    'check_d1_schema',
    'check_router_consistency',
    'cgr_network_baseurl_verify',
    'd1_remote_schema_verify',
    'mistral_timeout_triage'
  ].filter((skillName) => ingestWorkflowSource.includes(skillName));

  const insertionPoints = [
    'Pre-routing diagnóstico antes de persistIncident en IngestWorkflow.',
    'Post-route inventory/telemetry cuando se clasifique un incidente de ingestión.',
    'Adaptadores de capacidades alrededor de /api/v1/dictamenes/crawl/range y /ingest/trigger sin tocar workflows productivos.',
    'Lectura de memoria/telemetría sobre reproceso manual en /api/v1/dictamenes/:id/re-process.'
  ];

  return {
    endpoints,
    workflows,
    visibleBindings,
    visibleConfig,
    storage,
    associatedDiagnosticSkills,
    insertionPoints,
    notes: [
      'El scan describe solo rutas, workflows, bindings y skills visibles en el repo.',
      'No verifica ejecución real de workflows ni acceso vivo a servicios externos.'
    ]
  };
}
