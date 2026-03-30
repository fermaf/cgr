import { runSkill } from '../runner/skillRunner';

function parseArgs(argv: string[]) {
  const parsed: Record<string, unknown> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) continue;

    const key = current.slice(2);
    const next = argv[index + 1];

    if (key === 'include-examples') {
      parsed.includeExamples = true;
      continue;
    }

    if (key === 'skip-examples') {
      parsed.includeExamples = false;
      continue;
    }

    if (!next || next.startsWith('--')) continue;

    if (key === 'mode') {
      parsed.mode = next;
    } else if (key === 'target-environment') {
      parsed.targetEnvironment = next;
    } else if (key === 'max-batch-size') {
      parsed.maxBatchSize = Number.parseInt(next, 10);
    } else if (key === 'dry-run') {
      parsed.dryRun = next !== 'false';
    } else if (key === 'allow-ids') {
      parsed.allowIds = next.split(',').map((value) => value.trim()).filter(Boolean);
    } else if (key === 'reprocess-base-url') {
      parsed.reprocessBaseUrl = next;
    }

    index += 1;
  }

  return parsed;
}

async function main(): Promise<void> {
  const sessionId = `metadata-blocker-regeneration-${Date.now()}`;
  const input = parseArgs(process.argv.slice(2));

  const result = await runSkill(
    {
      intent: 'metadata_blocker_regeneration_executor',
      input
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runMetadataBlockerRegenerationExecutor failed:', error);
  process.exitCode = 1;
});
