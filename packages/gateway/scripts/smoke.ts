// Smoke harness for the Model Gateway (VERIFICATION.md V-6). Streams a one-line
// completion from a real provider using a BYOK key in the environment, and prints
// the text + token usage. Founder-gated: needs e.g. ANTHROPIC_API_KEY (SETUP.md S-4).
//   pnpm --filter @agentspace/gateway smoke
import { DEFAULT_MODEL } from '@agentspace/shared';
import { createModelGateway, envResolver, type GatewayRequest } from '../src/index';

async function main(): Promise<void> {
  const gateway = createModelGateway({ resolveCredential: envResolver() });
  const req: GatewayRequest = {
    model: DEFAULT_MODEL,
    credentialRef: DEFAULT_MODEL.provider,
    messages: [{ role: 'user', content: 'Reply with a short one-sentence hello.' }],
  };

  process.stdout.write(`[gateway] streaming from ${DEFAULT_MODEL.provider}/${DEFAULT_MODEL.model}\n`);
  let finish: { inputTokens: number; outputTokens: number } | undefined;
  for await (const delta of gateway.stream(req)) {
    if (delta.type === 'text') process.stdout.write(delta.text);
    else if (delta.type === 'finish') finish = delta.usage;
  }
  process.stdout.write('\n');
  console.info('[gateway] usage:', finish);
}

main().catch((err: unknown) => {
  console.error('[gateway] smoke failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
