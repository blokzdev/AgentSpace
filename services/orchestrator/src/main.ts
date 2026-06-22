// Runtime entrypoint for the orchestrator service. Kept separate from `index.ts`
// so unit tests can import the module (`createOrchestrator` / `main`) without the
// import side-effect of launching the live SpacetimeDB connection — importing
// `index.ts` must stay pure. `pnpm --filter @agentspace/orchestrator start` runs this.
import { main } from './index';

main().catch((err: unknown) => {
  console.error('[orchestrator] fatal:', err);
  process.exit(1);
});
