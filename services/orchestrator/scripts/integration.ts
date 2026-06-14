// Local end-to-end check for Agent Studio + the agent reply loop (M1.5/M1.6). A
// user authors a persona, deploys it to a DM, and posts; the orchestrator streams a
// reply via a MOCK gateway (no API key) — we assert the reply row goes
// streaming → complete AND that the gateway received the *persona's* system prompt +
// model (proving persona injection end-to-end).
// Needs a running local server with the `agentspace` module published. Not in CI.
//   pnpm --filter @agentspace/orchestrator integration
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Identity } from 'spacetimedb';
import type { GatewayDelta, GatewayRequest, ModelGateway } from '@agentspace/gateway';
import { DbConnection } from '@agentspace/stdb-bindings';
import { connectOrchestrator } from '../src/spacetime';
import { startReplyLoop } from '../src/replyLoop';

const HOST = process.env.AGENTSPACE_STDB_HOST ?? 'ws://127.0.0.1:3000';
const DB = process.env.AGENTSPACE_STDB_DB ?? 'agentspace';

const PERSONA = {
  name: 'Pirate Pete',
  systemPrompt: 'You are Pirate Pete. Reply only in pirate speak.',
  provider: 'anthropic',
  model: 'claude-opus-4-8',
};
const REPLY_CHUNKS = ['Ahoy', ', ', 'matey', '!'];
const EXPECTED = REPLY_CHUNKS.join('');

// Mock gateway that records the request it was handed, then streams scripted chunks.
function makeMockGateway(): { gateway: ModelGateway; lastRequest: () => GatewayRequest | undefined } {
  let seen: GatewayRequest | undefined;
  const gateway: ModelGateway = {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *stream(req: GatewayRequest): AsyncIterable<GatewayDelta> {
      seen = req;
      for (const text of REPLY_CHUNKS) yield { type: 'text', text };
      yield { type: 'finish', usage: { inputTokens: 7, outputTokens: 4 }, finishReason: 'stop' };
    },
    embed: () => Promise.reject(new Error('not used')),
  };
  return { gateway, lastRequest: () => seen };
}

function connectUser(): Promise<{ conn: DbConnection; identity: Identity }> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB)
      .onConnect((conn, identity) => {
        resolve({ conn, identity });
      })
      .onConnectError((_ctx, err: Error) => {
        reject(err);
      })
      .build();
  });
}

function fail(msg: string): never {
  console.error(`\n❌ integration failed: ${msg}`);
  process.exit(1);
}

async function run(): Promise<void> {
  const orch = await connectOrchestrator({
    tokenFile: join(tmpdir(), `agentspace-orch-int-${Date.now()}.token`),
  });
  orch.conn.reducers.registerService({}); // claim the agent service identity
  const mock = makeMockGateway();
  startReplyLoop(orch.conn, orch.identity, mock.gateway, { flushMs: 20 });
  console.info(`orchestrator identity: ${orch.identity.toHexString()}`);

  const user = await connectUser();
  console.info(`user identity:         ${user.identity.toHexString()}`);

  await new Promise<void>((resolve) => {
    user.conn
      .subscriptionBuilder()
      .onApplied(() => {
        resolve();
      })
      .subscribe(['SELECT * FROM my_thread_messages', 'SELECT * FROM my_threads', 'SELECT * FROM my_agents']);
  });

  const done = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out (20s) waiting for the agent reply')), 20_000);
    const check = (msg: { sender: Identity; streamState: string; text: string; runId: string }): void => {
      if (!msg.sender.isEqual(orch.identity) || msg.runId === '') return;
      if (msg.streamState === 'complete') {
        clearTimeout(timer);
        resolve(msg.text);
      }
    };
    user.conn.db.my_thread_messages.onInsert((_ctx, msg) => {
      check(msg);
    });
    user.conn.db.my_thread_messages.onUpdate((_ctx, _old, msg) => {
      check(msg);
    });
  });

  // Author the persona; when it lands, deploy it to a DM.
  let deployed = false;
  user.conn.db.my_agents.onInsert((_ctx, a) => {
    if (deployed) return;
    deployed = true;
    user.conn.reducers.createAgentDm({ agentId: a.id });
  });
  // When the agent DM appears, post into it.
  let posted = false;
  user.conn.db.my_threads.onInsert((_ctx, th) => {
    if (posted || th.agentId === 0n) return;
    posted = true;
    user.conn.reducers.sendMessage({ threadId: th.id, text: 'hello there' });
  });

  user.conn.reducers.createAgent({
    name: PERSONA.name,
    systemPrompt: PERSONA.systemPrompt,
    provider: PERSONA.provider,
    model: PERSONA.model,
  });

  const text = await done.catch((e: Error) => fail(e.message));
  if (text !== EXPECTED) fail(`reply text was "${text}", expected "${EXPECTED}"`);

  const req = mock.lastRequest();
  if (!req) fail('gateway was never called');
  if (req.model.model !== PERSONA.model || req.model.provider !== PERSONA.provider) {
    fail(`gateway model was ${req.model.provider}/${req.model.model}, expected ${PERSONA.provider}/${PERSONA.model}`);
  }
  const system = req.messages.find((m) => m.role === 'system')?.content;
  if (system !== PERSONA.systemPrompt) fail(`system prompt was "${system ?? '(none)'}", expected the persona's`);

  console.info(`\n✅ persona "${PERSONA.name}" drove the reply:`);
  console.info(`   model:  ${req.model.provider}/${req.model.model}`);
  console.info(`   system: "${system}"`);
  console.info(`   reply:  "${text}" (streaming → complete)`);
  process.exit(0);
}

run().catch((e: unknown) => {
  fail(e instanceof Error ? e.message : String(e));
});
