import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { wrappedLegacySkills } from '../skills/wrappers';

export interface LegacyCatalogSkill {
  name: string;
  diagnostic_only?: boolean;
  mode?: string;
  description?: string;
  owner?: string;
  version?: string;
}

export interface LegacySkillInspection {
  name: string;
  fileName: string | null;
  filePath: string | null;
  description: string;
  owner: string | null;
  mode: string | null;
  diagnosticOnly: boolean;
  imports: string[];
  visibleDependencies: string[];
  probableType: 'config-diagnostic' | 'schema-diagnostic' | 'router-diagnostic' | 'network-diagnostic' | 'ai-diagnostic' | 'fallback' | 'unknown';
  wrappeable: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  convergenceNotes: string[];
  possibleRuntimeReplacement: string | null;
  suggestedIsDeprecated: boolean;
}

function classifyProbableType(skillName: string, description: string): LegacySkillInspection['probableType'] {
  if (skillName === '__UNMATCHED__') return 'fallback';
  if (skillName.includes('env') || description.includes('bindings') || description.includes('entorno')) return 'config-diagnostic';
  if (skillName.includes('schema')) return 'schema-diagnostic';
  if (skillName.includes('router')) return 'router-diagnostic';
  if (skillName.includes('network') || skillName.includes('baseurl')) return 'network-diagnostic';
  if (skillName.includes('mistral') || description.includes('Mistral') || description.includes('timeouts')) return 'ai-diagnostic';
  return 'unknown';
}

function extractImports(source: string): string[] {
  const matches = source.matchAll(/import\s+(?:type\s+)?(?:[^'"]+)\s+from\s+['"]([^'"]+)['"]/g);
  return Array.from(matches, (match) => match[1]).sort();
}

function detectVisibleDependencies(source: string): string[] {
  const dependencies = new Set<string>();

  if (source.includes('env.DB')) dependencies.add('D1 binding (DB)');
  if (source.includes('CGR_BASE_URL')) dependencies.add('Var (CGR_BASE_URL)');
  if (source.includes('ENVIRONMENT')) dependencies.add('Var (ENVIRONMENT)');
  if (source.includes('MISTRAL_API_URL')) dependencies.add('Var (MISTRAL_API_URL)');
  if (source.includes('MISTRAL_MODEL')) dependencies.add('Var (MISTRAL_MODEL)');
  if (source.includes('incident.code')) dependencies.add('Incident code');
  if (source.includes('catalog.json')) dependencies.add('Legacy catalog.json');
  if (source.includes('incidentRouter')) dependencies.add('incidentRouter types');
  if (source.includes('db.prepare(')) dependencies.add('D1 PRAGMA access');

  return Array.from(dependencies).sort();
}

function determineWrappeability(skillName: string, dependencies: string[]): { wrappeable: boolean; riskLevel: LegacySkillInspection['riskLevel']; notes: string[] } {
  const notes: string[] = [];

  if (skillName === '__UNMATCHED__') {
    notes.push('Es un fallback de catálogo, no una capacidad ejecutable útil para wrapper directo.');
    return { wrappeable: false, riskLevel: 'high', notes };
  }

  if (dependencies.includes('D1 PRAGMA access') || dependencies.includes('D1 binding (DB)')) {
    notes.push('Depende de DB real o de PRAGMA; requiere adaptador más fuerte para evitar falsas garantías.');
    return { wrappeable: true, riskLevel: 'medium', notes };
  }

  if (dependencies.includes('Legacy catalog.json') || dependencies.includes('incidentRouter types')) {
    notes.push('Puede envolverse, pero conviene hacerlo junto con contratos de routing para no duplicar semántica.');
    return { wrappeable: true, riskLevel: 'medium', notes };
  }

  notes.push('La dependencia visible es principalmente configuración/incidentes; es candidata segura para wrapper.');
  return { wrappeable: true, riskLevel: 'low', notes };
}

function possibleRuntimeReplacement(skillName: string): string | null {
  if (wrappedLegacySkills.some((entry) => entry.notes && entry.name === `legacy_${skillName}`)) {
    return `legacy_${skillName}`;
  }

  if (skillName === 'check_router_consistency') {
    return 'skill_repo_context_scan';
  }

  return null;
}

export async function inspectLegacyCapabilities(repoRoot: string): Promise<LegacySkillInspection[]> {
  const skillsRoot = path.join(repoRoot, 'cgr-platform', 'src', 'skills');
  const catalogPath = path.join(skillsRoot, 'catalog.json');
  const catalogRaw = await readFile(catalogPath, 'utf8');
  const catalogJson = JSON.parse(catalogRaw) as { skills?: LegacyCatalogSkill[] };
  const files = await readdir(skillsRoot, { withFileTypes: true });
  const skillFiles = files.filter((entry) => entry.isFile() && entry.name.endsWith('.ts'));

  return Promise.all((catalogJson.skills ?? []).map(async (catalogSkill) => {
    const matchingFile = skillFiles.find((file) => file.name === `${catalogSkill.name}.ts`) ?? null;
    const filePath = matchingFile ? path.join(skillsRoot, matchingFile.name) : null;
    const source = filePath ? await readFile(filePath, 'utf8') : '';
    const imports = extractImports(source);
    const visibleDependencies = detectVisibleDependencies(source);
    const probableType = classifyProbableType(catalogSkill.name, catalogSkill.description ?? '');
    const wrapAssessment = determineWrappeability(catalogSkill.name, visibleDependencies);
    const replacement = possibleRuntimeReplacement(catalogSkill.name);

    return {
      name: catalogSkill.name,
      fileName: matchingFile?.name ?? null,
      filePath,
      description: catalogSkill.description ?? '',
      owner: catalogSkill.owner ?? null,
      mode: catalogSkill.mode ?? null,
      diagnosticOnly: Boolean(catalogSkill.diagnostic_only),
      imports,
      visibleDependencies,
      probableType,
      wrappeable: wrapAssessment.wrappeable,
      riskLevel: wrapAssessment.riskLevel,
      convergenceNotes: [
        ...wrapAssessment.notes,
        replacement
          ? `Ya existe o se aproxima un punto de reemplazo en /agents: ${replacement}.`
          : 'Aun no existe reemplazo claro en /agents; conviene evaluar valor operativo antes de envolver.'
      ],
      possibleRuntimeReplacement: replacement,
      suggestedIsDeprecated: replacement !== null && replacement !== `legacy_${catalogSkill.name}`
    };
  }));
}
