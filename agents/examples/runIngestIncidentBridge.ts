import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-ingest-incident-bridge-session';
  const result = await runSkill(
    {
      requestedSkill: 'skill_ingest_incident_bridge',
      input: {}
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runIngestIncidentBridge failed:', error);
  process.exitCode = 1;
});
