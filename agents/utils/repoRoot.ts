import { existsSync } from 'node:fs';
import path from 'node:path';

export function resolveRepoRoot(startDir: string): string {
  let currentDir = path.resolve(startDir);

  while (true) {
    const hasAgents = existsSync(path.join(currentDir, 'agents'));
    const hasPackageJson = existsSync(path.join(currentDir, 'package.json'));

    if (hasAgents && hasPackageJson) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return path.resolve(startDir);
    }

    currentDir = parentDir;
  }
}
