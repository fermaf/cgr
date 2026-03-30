import { runSkill } from '../runner/skillRunner';

function parseArgs(argv: string[]) {
  const parsed: Record<string, unknown> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) continue;

    const key = current.slice(2);
    const next = argv[index + 1];

    if (key === 'include-product-impact') {
      parsed.includeProductImpact = true;
      continue;
    }

    if (key === 'skip-product-impact') {
      parsed.includeProductImpact = false;
      continue;
    }

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
    } else if (key === 'sample-size') {
      parsed.sampleSize = Number.parseInt(next, 10);
    } else if (key === 'target-environment') {
      parsed.targetEnvironment = next;
    }

    index += 1;
  }

  return parsed;
}

async function main(): Promise<void> {
  const sessionId = `metadata-quality-${Date.now()}`;
  const input = parseArgs(process.argv.slice(2));

  const result = await runSkill(
    {
      intent: 'metadata_quality_audit',
      input
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runMetadataQualityAudit failed:', error);
  process.exitCode = 1;
});
