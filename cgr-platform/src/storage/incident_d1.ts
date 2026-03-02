import { normalizeIncident } from '../lib/incident';
import { routeIncident } from '../lib/incidentRouter';
import { recordSkillEvent } from '../storage/skillEvents';
import { recordSkillRun } from '../storage/skillRuns';
import { logInfo, logWarn } from '../lib/log';
import type { Env } from '../types';
import type { Incident } from '../lib/incident';
import { runCheckEnvSanity } from '../skills/check_env_sanity';
import { runCheckD1Schema } from '../skills/check_d1_schema';
import { runCheckRouterConsistency } from '../skills/check_router_consistency';
import { runCgrNetworkBaseurlVerify } from '../skills/cgr_network_baseurl_verify';
import { runD1RemoteSchemaVerify } from '../skills/d1_remote_schema_verify';
import { runMistralTimeoutTriage } from '../skills/mistral_timeout_triage';

function toIncidentEnv(envStr?: string): Incident['env'] {
    if (envStr === 'production') return 'prod';
    if (envStr === 'local' || envStr === 'staging') return 'local';
    return 'unknown';
}

export async function persistIncident(
    env: Env,
    rawError: unknown,
    serviceName: string,
    workflowName: string,
    instanceId: string,
    extraContext?: Record<string, unknown>
): Promise<void> {
    const incident = normalizeIncident({
        error: rawError,
        env: toIncidentEnv(env.ENVIRONMENT),
        service: serviceName,
        workflow: workflowName,
        context: {
            instanceId: instanceId,
            environment: env.ENVIRONMENT ?? 'unknown',
            ...extraContext
        }
    });

    const decision = routeIncident(incident);
    console.log('[INCIDENT]', JSON.stringify(incident));
    console.log('[SKILL_DECISION]', JSON.stringify(decision));
    console.log(`Skill sugerido: ${decision.skill}`);

    const skillExecutionEnabled = env.SKILL_EXECUTION_ENABLED === '1';
    try {
        await recordSkillEvent(env.DB, incident, decision, env.DICTAMENES_PASO);
    } catch (insertError) {
        logWarn('SKILL_EVENT_INSERT_WARN', { reason: 'failed_to_insert_skill_event', error: insertError });
    }

    if (skillExecutionEnabled) {
        type SkillExecution = {
            skill: string;
            mode: 'diagnostic' | 'disabled';
            status: 'success' | 'error';
            reason: string;
            output: Record<string, unknown>;
        };

        const skillExecutions: Array<{ name: string; run: () => Promise<SkillExecution> }> = [
            {
                name: 'check_env_sanity',
                run: async () => {
                    const result = await runCheckEnvSanity(env, incident);
                    return { skill: 'check_env_sanity', mode: 'diagnostic', status: result.status, reason: result.status === 'success' ? 'diagnostic_ok' : 'diagnostic_failed', output: { ...result.metadata, error: result.error ?? null } };
                }
            },
            {
                name: 'check_d1_schema',
                run: async () => {
                    const result = await runCheckD1Schema(env, incident);
                    return { skill: 'check_d1_schema', mode: 'diagnostic', status: result.status, reason: result.status === 'success' ? 'diagnostic_ok' : 'diagnostic_failed', output: { ...result.metadata, error: result.error ?? null } };
                }
            },
            {
                name: 'check_router_consistency',
                run: async () => {
                    const result = await runCheckRouterConsistency(incident, decision);
                    return { skill: 'check_router_consistency', mode: 'diagnostic', status: result.status, reason: result.status === 'success' ? 'diagnostic_ok' : 'diagnostic_failed', output: { ...result.metadata, error: result.error ?? null } };
                }
            },
            {
                name: 'cgr_network_baseurl_verify',
                run: async () => {
                    const result = await runCgrNetworkBaseurlVerify(env, incident);
                    return { skill: 'cgr_network_baseurl_verify', mode: 'diagnostic', status: result.status, reason: result.status === 'success' ? 'diagnostic_ok' : 'diagnostic_failed', output: { ...result.metadata, error: result.error ?? null } };
                }
            },
            {
                name: 'd1_remote_schema_verify',
                run: async () => {
                    const result = await runD1RemoteSchemaVerify(env, incident);
                    return { skill: 'd1_remote_schema_verify', mode: 'diagnostic', status: result.status, reason: result.status === 'success' ? 'diagnostic_ok' : 'diagnostic_failed', output: { ...result.metadata, error: result.error ?? null } };
                }
            },
            {
                name: 'mistral_timeout_triage',
                run: async () => {
                    const result = await runMistralTimeoutTriage(env, incident);
                    return { skill: 'mistral_timeout_triage', mode: 'diagnostic', status: result.status, reason: result.status === 'success' ? 'diagnostic_ok' : 'diagnostic_failed', output: { ...result.metadata, error: result.error ?? null } };
                }
            }
        ];

        for (const skill of skillExecutions) {
            try {
                const execution = await skill.run();
                await recordSkillRun(env.DB, incident, { ...decision, skill: skill.name }, execution);
            } catch (skillError) {
                logWarn('SKILL_RUN_WARN', { reason: 'failed_to_execute_skill', error: skillError });
            }
        }
    } else if (decision.matched) {
        logInfo('SKILL_EXECUTION_SKIPPED', { skill: decision.skill, reason: 'disabled' });
    }
}
