import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-ingest-native-incident-session';
  const result = await runSkill(
    {
      requestedSkill: 'skill_ingest_native_incident',
      input: {}
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runIngestNativeIncident failed:', error);
  process.exitCode = 1;
});
