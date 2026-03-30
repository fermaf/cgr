import { runSkill } from '../runner/skillRunner';

function parseArgs(argv: string[]) {
  const parsed: Record<string, unknown> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) continue;

    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) continue;

    if (key === 'limit') {
      parsed.limit = Number.parseInt(next, 10);
    } else if (key === 'mode') {
      parsed.mode = next;
    } else if (key === 'backend-base-url') {
      parsed.backendBaseUrl = next;
    } else if (key === 'query') {
      parsed.query = next;
    }

    index += 1;
  }

  return parsed;
}

async function main(): Promise<void> {
  const sessionId = `doctrine-coherence-${Date.now()}`;
  const input = parseArgs(process.argv.slice(2));

  const result = await runSkill(
    {
      intent: 'doctrine_coherence_audit',
      input
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runDoctrineCoherenceAudit failed:', error);
  process.exitCode = 1;
});
