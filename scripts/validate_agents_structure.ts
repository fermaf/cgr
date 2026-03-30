import { access } from 'node:fs/promises';
import path from 'node:path';
import { listSkillRegistryEntries } from '../agents/skills';
import { resolveRepoRoot } from '../agents/utils/repoRoot';

const repoRoot = resolveRepoRoot(__dirname);

const requiredPaths = [
  'agents/skills',
  'agents/skills/wrappers',
  'agents/schemas',
  'agents/router',
  'agents/runner',
  'agents/types',
  'agents/examples'
];

async function exists(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const results = await Promise.all(
    requiredPaths.map(async (relativePath) => ({
      path: relativePath,
      exists: await exists(relativePath)
    }))
  );
  const registryEntries = listSkillRegistryEntries();
  const missing = results.filter((entry) => !entry.exists);

  if (missing.length > 0) {
    console.error('Faltan rutas requeridas para la base de agentes:');
    for (const entry of missing) {
      console.error(`- ${entry.path}`);
    }
    process.exitCode = 1;
    return;
  }

  if (registryEntries.length === 0) {
    console.error('El registry de skills esta vacio.');
    process.exitCode = 1;
    return;
  }

  console.log('Estructura base de agentes valida.');
  for (const entry of results) {
    console.log(`- ${entry.path}`);
  }

  console.log('Registry de skills inicializado con:');
  for (const entry of registryEntries) {
    console.log(`- ${entry.name} (${entry.source})`);
  }
}

main().catch((error: unknown) => {
  console.error('Error validando estructura de agentes:', error);
  process.exitCode = 1;
});
