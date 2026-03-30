import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-ingest-legacy-delegation-session';
  const result = await runSkill(
    {
      requestedSkill: 'skill_ingest_legacy_delegation',
      input: {}
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runIngestLegacyDelegation failed:', error);
  process.exitCode = 1;
});
