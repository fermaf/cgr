import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-ingest-incident-decisioning-session';
  const result = await runSkill(
    {
      requestedSkill: 'skill_ingest_incident_decisioning',
      input: {}
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runIngestIncidentDecisioning failed:', error);
  process.exitCode = 1;
});
