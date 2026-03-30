import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-legacy-inventory-session';
  const result = await runSkill(
    {
      intent: 'legacy_inventory',
      input: {}
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runLegacyInventory failed:', error);
  process.exitCode = 1;
});
