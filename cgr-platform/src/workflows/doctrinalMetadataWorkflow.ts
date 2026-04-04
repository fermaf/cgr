import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import type { Env } from '../types';
import { reprocessDoctrinalMetadata } from '../lib/doctrinalMetadata';
import { logError, logInfo, logWarn, setLogLevel } from '../lib/log';

interface DoctrinalMetadataWorkflowParams {
  limit?: number;
  offset?: number;
  recursive?: boolean;
  dictamenIds?: string[];
  delayMs?: number;
  sourceSnapshotVersion?: string;
  runTag?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class DoctrinalMetadataWorkflow extends WorkflowEntrypoint<Env, DoctrinalMetadataWorkflowParams> {
  async run(event: WorkflowEvent<DoctrinalMetadataWorkflowParams>, step: WorkflowStep) {
    try {
      const env = this.env;
      const db = env.DB;
      const params = event.payload ?? {};
      setLogLevel(env.LOG_LEVEL);

      const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
      const offset = Math.max(params.offset ?? 0, 0);
      const recursive = params.recursive ?? true;
      const delayMs = Math.min(Math.max(params.delayMs ?? 500, 0), 10000);
      const sourceSnapshotVersion = typeof params.sourceSnapshotVersion === 'string' && params.sourceSnapshotVersion.trim().length > 0
        ? params.sourceSnapshotVersion.trim()
        : 'workflow_reprocess';
      const explicitIds = Array.isArray(params.dictamenIds)
        ? [...new Set(params.dictamenIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim()))]
        : [];
      const runTag = typeof params.runTag === 'string' && params.runTag.trim().length > 0
        ? params.runTag.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)
        : event.instanceId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);

      const aiGatewayEnabled = typeof env.MISTRAL_API_URL === 'string' && env.MISTRAL_API_URL.includes('gateway.ai.cloudflare.com');
      logInfo('DOCTRINAL_METADATA_WORKFLOW_START', {
        instanceId: event.instanceId,
        limit,
        offset,
        recursive,
        delayMs,
        explicitIds: explicitIds.length,
        sourceSnapshotVersion,
        runTag,
        mistralModel: 'mistral-large-2411',
        aiGatewayEnabled,
        mistralApiUrl: env.MISTRAL_API_URL
      });

      const dictamenIds = await step.do('fetch-doctrinal-metadata-batch', async () => {
        if (explicitIds.length > 0) return explicitIds;
        const rows = await db.prepare(
          `SELECT id
           FROM dictamenes
           WHERE estado IN ('enriched', 'vectorized')
           ORDER BY COALESCE(fecha_documento, created_at) DESC, id DESC
           LIMIT ? OFFSET ?`
        ).bind(limit, offset).all<{ id: string }>();
        return rows.results?.map((row) => row.id) ?? [];
      });

      if (dictamenIds.length === 0) {
        logInfo('DOCTRINAL_METADATA_WORKFLOW_EMPTY', {
          instanceId: event.instanceId,
          offset,
          limit,
          runTag
        });
        return {
          done: true,
          processedInBatch: 0,
          nextOffset: offset
        };
      }

      let processed = 0;
      let failures = 0;

      for (const dictamenId of dictamenIds) {
        const stepName = `reprocess-doctrinal-metadata-${dictamenId}`;
        try {
          await step.do(stepName, async () => {
            const startedAt = Date.now();
            try {
              const response = await reprocessDoctrinalMetadata(env, {
                dictamenIds: [dictamenId],
                sourceSnapshotVersion
              });
              const elapsedMs = Date.now() - startedAt;
              if (response.processed !== 1) {
                throw new Error(`Unexpected processed count for ${dictamenId}: ${response.processed}`);
              }
              logInfo('DOCTRINAL_METADATA_DOC_DONE', {
                instanceId: event.instanceId,
                dictamenId,
                processed: response.processed,
                elapsedMs,
                pipelineVersion: response.pipeline_version,
                mistralModel: 'mistral-large-2411'
              });
              return {
                ok: true,
                elapsedMs
              };
            } catch (error) {
              const elapsedMs = Date.now() - startedAt;
              logError('DOCTRINAL_METADATA_DOC_ATTEMPT_ERROR', error, {
                instanceId: event.instanceId,
                dictamenId,
                elapsedMs,
                mistralModel: 'mistral-large-2411'
              });
              throw error;
            }
          });
          processed += 1;
        } catch (error) {
          failures += 1;
          logError('DOCTRINAL_METADATA_DOC_FAILED_AFTER_RETRIES', error, {
            instanceId: event.instanceId,
            dictamenId,
            mistralModel: 'mistral-large-2411'
          });
        }

        if (delayMs > 0) {
          await step.do(`sleep-after-${dictamenId}`, async () => {
            await sleep(delayMs);
            return { ok: true };
          });
        }
      }

      logInfo('DOCTRINAL_METADATA_WORKFLOW_BATCH_DONE', {
        instanceId: event.instanceId,
        offset,
        limit,
        requested: dictamenIds.length,
        processed,
        failures,
        recursive,
        explicitIds: explicitIds.length,
        runTag,
        mistralModel: 'mistral-large-2411',
        aiGatewayEnabled
      });

      if (!aiGatewayEnabled) {
        logWarn('DOCTRINAL_METADATA_WORKFLOW_NO_AIG', {
          instanceId: event.instanceId,
          mistralApiUrl: env.MISTRAL_API_URL
        });
      }

      if (explicitIds.length === 0 && recursive && dictamenIds.length === limit) {
        const nextOffset = offset + limit;
        const childInstanceId = `doctrinal-metadata-${runTag}-${nextOffset}`;
        await step.sleep('wait-next-doctrinal-batch', '5 seconds');
        await step.do('dispatch-next-doctrinal-batch', async () => {
          await env.DOCTRINAL_METADATA_WORKFLOW.create({
            id: childInstanceId,
            params: {
              limit,
              offset: nextOffset,
              recursive: true,
              delayMs,
              sourceSnapshotVersion,
              runTag
            }
          });
        });
      }

      return {
        done: explicitIds.length > 0 ? true : dictamenIds.length < limit,
        processedInBatch: processed,
        failures,
        nextOffset: offset + limit
      };
    } catch (error) {
      logError('DOCTRINAL_METADATA_WORKFLOW_ERROR', error, { instanceId: event.instanceId });
      throw error;
    }
  }
}
