import { runSkill } from '../runner/skillRunner';

function parseArgs(argv: string[]) {
  const parsed: Record<string, unknown> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) continue;

    const key = current.slice(2);
    const next = argv[index + 1];

    if (key === 'include-metadata-audit') {
      parsed.includeMetadataAudit = true;
      continue;
    }

    if (key === 'skip-metadata-audit') {
      parsed.includeMetadataAudit = false;
      continue;
    }

    if (!next || next.startsWith('--')) continue;

    if (key === 'mode') {
      parsed.mode = next;
    } else if (key === 'namespace') {
      parsed.namespace = next;
    } else if (key === 'sample-size') {
      parsed.sampleSize = Number.parseInt(next, 10);
    } else if (key === 'target-environment') {
      parsed.targetEnvironment = next;
    } else if (key === 'search-probe') {
      parsed.searchProbe = next;
    }

    index += 1;
  }

  return parsed;
}

async function main(): Promise<void> {
  const sessionId = `embedding-consistency-${Date.now()}`;
  const input = parseArgs(process.argv.slice(2));

  const result = await runSkill(
    {
      intent: 'embedding_consistency_check',
      input
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runEmbeddingConsistencyCheck failed:', error);
  process.exitCode = 1;
});
