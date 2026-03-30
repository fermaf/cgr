import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface WranglerWorkflowConfig {
  name: string;
  binding: string;
  class_name: string;
}

export interface WranglerBindingConfig {
  binding: string;
  [key: string]: unknown;
}

export interface WranglerQueueConfig {
  binding: string;
  queue?: string;
}

export interface WranglerConfig {
  name?: string;
  main?: string;
  workflows?: WranglerWorkflowConfig[];
  kv_namespaces?: WranglerBindingConfig[];
  d1_databases?: WranglerBindingConfig[];
  queues?: {
    producers?: WranglerQueueConfig[];
    consumers?: Array<Record<string, unknown>>;
  };
  vars?: Record<string, unknown>;
}

export async function readWranglerConfig(repoRoot: string): Promise<{
  configPath: string;
  config: WranglerConfig | null;
  parseError: string | null;
}> {
  const configPath = path.join(repoRoot, 'cgr-platform', 'wrangler.jsonc');

  try {
    const raw = await readFile(configPath, 'utf8');
    return {
      configPath,
      config: JSON.parse(raw) as WranglerConfig,
      parseError: null
    };
  } catch (error) {
    return {
      configPath,
      config: null,
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}
