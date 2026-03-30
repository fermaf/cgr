import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-ingest-topology-session';
  const result = await runSkill(
    {
      intent: 'ingest_topology_scan',
      input: {}
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runIngestTopologyScan failed:', error);
  process.exitCode = 1;
});
