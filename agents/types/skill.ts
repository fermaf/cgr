export type JsonSchema = {
  type: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  enum?: Array<string | number | boolean | null>;
};

export type SkillExecutionStatus = 'success' | 'error';

export type SkillSource = 'agents-native' | 'legacy-wrapper' | 'repo-scan' | 'Legacy Core';
export type SkillExecutionLayer = 'agents-runtime' | 'legacy-core';
export type SkillCapabilitySource = 'native-runtime' | 'legacy-wrapper' | 'legacy-core' | 'repository-inspection';

export interface SkillExecutionMetadata {
  skillName: string;
  timestamp: string;
  durationMs: number;
  sessionId: string;
  source: SkillSource;
  executionLayer: SkillExecutionLayer;
  capabilitySource: SkillCapabilitySource;
  legacySkillName?: string;
  isDeprecated?: boolean;
}

export interface SkillExecutionResult<TData extends object = Record<string, unknown>> {
  status: SkillExecutionStatus;
  data: TData;
  metadata: SkillExecutionMetadata;
}

export interface SkillLogger {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

export interface TelemetryEvent {
  name: string;
  timestamp: string;
  sessionId: string;
  attributes?: Record<string, unknown>;
}

export interface SkillTelemetry {
  record(event: TelemetryEvent): void;
  flush(): TelemetryEvent[];
}

export interface SkillContext {
  sessionId: string;
  repoRoot: string;
  logger: SkillLogger;
  telemetry: SkillTelemetry;
}

export interface SkillDefinition<TInput extends object = Record<string, unknown>, TData extends object = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  execute(context: SkillContext, input: TInput): Promise<SkillExecutionResult<TData>>;
}

export function createSkillMetadata(
  skillName: string,
  sessionId: string,
  source: SkillSource,
  durationMs: number,
  timestamp = new Date().toISOString(),
  options?: {
    executionLayer?: SkillExecutionLayer;
    capabilitySource?: SkillCapabilitySource;
    legacySkillName?: string;
    isDeprecated?: boolean;
  }
): SkillExecutionMetadata {
  return {
    skillName,
    timestamp,
    durationMs,
    sessionId,
    source,
    executionLayer: options?.executionLayer ?? (source === 'Legacy Core' ? 'legacy-core' : 'agents-runtime'),
    capabilitySource: options?.capabilitySource ?? (
      source === 'Legacy Core'
        ? 'legacy-core'
        : source === 'legacy-wrapper'
          ? 'legacy-wrapper'
          : source === 'repo-scan'
            ? 'repository-inspection'
            : 'native-runtime'
    ),
    legacySkillName: options?.legacySkillName,
    isDeprecated: options?.isDeprecated
  };
}
