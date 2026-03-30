import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-ingest-route-adapter-session';
  const result = await runSkill(
    {
      requestedSkill: 'skill_ingest_route_adapter',
      input: {}
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runIngestRouteAdapter failed:', error);
  process.exitCode = 1;
});
