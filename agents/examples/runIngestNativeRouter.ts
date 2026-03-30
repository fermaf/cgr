import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-ingest-native-router-session';
  const result = await runSkill(
    {
      requestedSkill: 'skill_ingest_native_router',
      input: {}
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runIngestNativeRouter failed:', error);
  process.exitCode = 1;
});
