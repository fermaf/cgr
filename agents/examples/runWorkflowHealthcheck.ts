import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-workflow-healthcheck-session';
  const result = await runSkill(
    {
      intent: 'workflow_healthcheck',
      input: {}
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runWorkflowHealthcheck failed:', error);
  process.exitCode = 1;
});
