import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-ping-session';
  const result = await runSkill(
    {
      intent: 'ping',
      input: {
        message: 'ping from example'
      }
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runPing failed:', error);
  process.exitCode = 1;
});
