import { runSkill } from '../runner/skillRunner';

async function main(): Promise<void> {
  const sessionId = 'example-repo-scan-session';
  const result = await runSkill(
    {
      intent: 'repo_scan',
      input: {
        includeCatalogEntries: true
      }
    },
    sessionId
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('agents/examples/runRepoScan failed:', error);
  process.exitCode = 1;
});
