import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-ingest-edge-observability-session';
  const result = await runSkill(
    {
      requestedSkill: 'skill_ingest_edge_observability',
      input: {}
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runIngestEdgeObservability failed:', error);
  process.exitCode = 1;
});
