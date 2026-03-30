import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-legacy-wrapper-session';
  const result = await runSkill(
    {
      requestedSkill: 'legacy_check_env_sanity',
      input: {}
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runLegacyWrapper failed:', error);
  process.exitCode = 1;
});
