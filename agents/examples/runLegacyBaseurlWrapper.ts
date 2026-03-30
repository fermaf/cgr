import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-legacy-baseurl-wrapper-session';
  const result = await runSkill(
    {
      requestedSkill: 'legacy_cgr_network_baseurl_verify',
      input: {}
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runLegacyBaseurlWrapper failed:', error);
  process.exitCode = 1;
});
