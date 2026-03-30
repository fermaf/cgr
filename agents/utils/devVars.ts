import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type DevVars = Record<string, string>;

export async function readDevVars(repoRoot: string): Promise<{
  filePath: string;
  values: DevVars;
  parseError: string | null;
}> {
  const filePath = path.join(repoRoot, 'cgr-platform', '.dev.vars');

  try {
    const raw = await readFile(filePath, 'utf8');
    const values: DevVars = {};

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const commentIndex = trimmed.indexOf(' #');
      const clean = commentIndex >= 0 ? trimmed.slice(0, commentIndex).trim() : trimmed;
      const equalIndex = clean.indexOf('=');
      if (equalIndex <= 0) continue;

      const key = clean.slice(0, equalIndex).trim();
      const value = clean.slice(equalIndex + 1).trim().replace(/^"(.*)"$/, '$1');
      values[key] = value;
    }

    return {
      filePath,
      values,
      parseError: null
    };
  } catch (error) {
    return {
      filePath,
      values: {},
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}
