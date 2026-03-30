import { runSkill } from '../runner/skillRunner';

function parseArgs(argv: string[]) {
  const parsed: Record<string, unknown> = {};
  const confirmRepresentativeIds: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) continue;

    const key = current.slice(2);

    if (key === 'dry-run') {
      parsed.dryRun = true;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith('--')) continue;

    if (key === 'mode') {
      parsed.mode = next;
    } else if (key === 'target-environment') {
      parsed.targetEnvironment = next;
    } else if (key === 'limit') {
      parsed.limit = Number.parseInt(next, 10);
    } else if (key === 'candidate-index') {
      parsed.candidateIndex = Number.parseInt(next, 10);
    } else if (key === 'backend-base-url') {
      parsed.backendBaseUrl = next;
    } else if (key === 'query') {
      parsed.query = next;
    } else if (key === 'confirm-representative-id') {
      confirmRepresentativeIds.push(next);
    }

    index += 1;
  }

  if (confirmRepresentativeIds.length > 0) {
    parsed.confirmRepresentativeIds = confirmRepresentativeIds;
  }

  return parsed;
}

async function main(): Promise<void> {
  const sessionId = `doctrine-structure-remediation-${Date.now()}`;
  const input = parseArgs(process.argv.slice(2));

  const result = await runSkill(
    {
      intent: 'doctrine_structure_remediation_executor',
      input
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runDoctrineStructureRemediationExecutor failed:', error);
  process.exitCode = 1;
});
