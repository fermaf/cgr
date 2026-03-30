import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-capability-convergence-session';
  const result = await runSkill(
    {
      requestedSkill: 'skill_capability_convergence_report',
      input: {}
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runCapabilityConvergenceReport failed:', error);
  process.exitCode = 1;
});
