import { getRecentEvents, storeEvent } from '../memory/agentMemory';
import { routeSkill, type SkillRouteInput, type SkillRouteResult } from '../router/skillRouter';
import { resolveSkill } from '../skills';
import type { SkillContext, SkillLogger, SkillTelemetry, TelemetryEvent } from '../types/skill';
import { resolveRepoRoot } from '../utils/repoRoot';

export interface SkillRunnerResult {
  route: SkillRouteResult;
  status: 'success' | 'error';
  result: unknown;
  recentEvents: ReturnType<typeof getRecentEvents>;
}

function createLogger(sessionId: string): SkillLogger {
  function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, extra?: Record<string, unknown>) {
    const payload = extra ? ` ${JSON.stringify(extra)}` : '';
    console[level](`[agents][${sessionId}] ${message}${payload}`);
  }

  return {
    debug(message, extra) {
      log('debug', message, extra);
    },
    info(message, extra) {
      log('info', message, extra);
    },
    warn(message, extra) {
      log('warn', message, extra);
    },
    error(message, extra) {
      log('error', message, extra);
    }
  };
}

function createTelemetry(sessionId: string): SkillTelemetry {
  const events: TelemetryEvent[] = [];

  return {
    record(event) {
      events.push(event);
    },
    flush() {
      return [...events];
    }
  };
}

export async function runSkill(input: SkillRouteInput, sessionId: string): Promise<SkillRunnerResult> {
  const route = routeSkill({
    ...input,
    sessionId
  });
  const resolvedSkill = resolveSkill(route.skillName);
  const logger = createLogger(sessionId);
  const telemetry = createTelemetry(sessionId);
  const repoRoot = resolveRepoRoot(__dirname);
  const context: SkillContext = {
    sessionId,
    repoRoot,
    logger,
    telemetry
  };

  if (!resolvedSkill) {
    const missingSkillResult = {
      status: 'error' as const,
      data: {
        message: `Skill not registered: ${route.skillName}`
      },
      metadata: {
        skillName: route.skillName,
        timestamp: new Date().toISOString(),
        durationMs: 0,
        sessionId,
        source: 'agents-native' as const,
        executionLayer: 'agents-runtime' as const,
        capabilitySource: 'native-runtime' as const
      }
    };

    storeEvent(sessionId, {
      timestamp: missingSkillResult.metadata.timestamp,
      type: 'skill_run',
      payload: {
        route,
        result: missingSkillResult,
        telemetry: telemetry.flush()
      }
    });

    return {
      route,
      status: 'error',
      result: missingSkillResult,
      recentEvents: getRecentEvents(sessionId, 10)
    };
  }

  const skillInput = (input.input && typeof input.input === 'object')
    ? input.input as Record<string, unknown>
    : {};
  const result = await resolvedSkill.skill.execute(context, skillInput);

  storeEvent(sessionId, {
    timestamp: result.metadata.timestamp,
    type: 'skill_run',
    payload: {
      route,
      status: result.status,
      skillName: result.metadata.skillName,
      source: resolvedSkill.source,
      executionLayer: result.metadata.executionLayer,
      capabilitySource: result.metadata.capabilitySource,
      legacySkillName: result.metadata.legacySkillName,
      isDeprecated: result.metadata.isDeprecated,
      data: result.data,
      telemetry: telemetry.flush()
    }
  });

  return {
    route,
    status: result.status,
    result,
    recentEvents: getRecentEvents(sessionId, 10)
  };
}
