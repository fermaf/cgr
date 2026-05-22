import type { Env } from '../types';
import type { DictamenMetadataLean } from '../lib/doctrinalMetadata';
import { fetchMetadataFromD1 } from '../lib/doctrinalMetadata';
import { logDictamenEvent } from '../storage/d1';

export async function getDoctrinalMetadata(
  env: Env,
  dictamenId: string
): Promise<DictamenMetadataLean | null> {
  const metadata = await fetchMetadataFromD1(env, dictamenId);
  if (metadata) return metadata;

  await logDictamenEvent(env.DB, {
    dictamen_id: dictamenId,
    event_type: 'DOCTRINAL_METADATA_ERROR',
    metadata: {
      reason: 'd1_miss',
      pipeline_version: 'doctrinal_metadata_v1',
      source: 'doctrinal_service'
    }
  });

  return null;
}
