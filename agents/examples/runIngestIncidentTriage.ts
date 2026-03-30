import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-ingest-incident-triage-session';
  const result = await runSkill(
    {
      requestedSkill: 'skill_ingest_incident_triage',
      input: {}
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runIngestIncidentTriage failed:', error);
  process.exitCode = 1;
});
