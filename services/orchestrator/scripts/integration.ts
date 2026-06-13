// Local end-to-end check for the agent reply loop (M1.6). A user posts to a thread
// the orchestrator is an `agent` member of; the orchestrator streams a reply via a
// MOCK gateway (no API key needed) and we assert the reply row goes
// streaming → complete with the streamed text, and that an UPDATE was observed.
// Needs a running local server with the `agentspace` module published. Not in CI.
//   pnpm --filter @agentspace/orchestrator integration
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Identity } from 'spacetimedb';
import type { GatewayDelta, ModelGateway } from '@agentspace/gateway';
import { DbConnection } from '@agentspace/stdb-bindings';
import { connectOrchestrator } from '../src/spacetime';
import { startReplyLoop } from '../src/replyLoop';

const HOST = process.env.AGENTSPACE_STDB_HOST ?? 'ws://127.0.0.1:3000';
const DB = process.env.AGENTSPACE_STDB_DB ?? 'agentspace';

const REPLY_CHUNKS = ['Hello', ', ', 'world', '!'];
const EXPECTED = REPLY_CHUNKS.join('');

// A scripted gateway: streams the chunks above, then a terminal finish. Lets us
// prove the reply-loop + streaming reducers end-to-end without a provider key.
const mockGateway: ModelGateway = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async *stream(): AsyncIterable<GatewayDelta> {
    for (const text of REPLY_CHUNKS) yield { type: 'text', text };
    yield { type: 'finish', usage: { inputTokens: 7, outputTokens: 4 }, finishReason: 'stop' };
  },
  embed: () => Promise.reject(new Error('not used')),
};

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
  startReplyLoop(orch.conn, orch.identity, mockGateway, { flushMs: 20 });
  console.info(`orchestrator identity: ${orch.identity.toHexString()}`);

  const user = await connectUser();
  console.info(`user identity:         ${user.identity.toHexString()}`);

  await new Promise<void>((resolve) => {
    user.conn
      .subscriptionBuilder()
      .onApplied(() => {
        resolve();
      })
      .subscribe(['SELECT * FROM my_thread_messages', 'SELECT * FROM my_threads']);
  });

  let sawStreaming = false;
  let sawUpdate = false;
  const done = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out (20s) waiting for the agent reply')), 20_000);
    const check = (msg: { sender: Identity; streamState: string; text: string; runId: string }): void => {
      if (!msg.sender.isEqual(orch.identity) || msg.runId === '') return;
      if (msg.streamState === 'streaming') sawStreaming = true;
      if (msg.streamState === 'complete') {
        clearTimeout(timer);
        resolve(msg.text);
      }
    };
    user.conn.db.my_thread_messages.onInsert((_ctx, msg) => {
      check(msg);
    });
    user.conn.db.my_thread_messages.onUpdate((_ctx, _old, msg) => {
      sawUpdate = true;
      check(msg);
    });
  });

  let kicked = false;
  user.conn.db.my_threads.onInsert((_ctx, th) => {
    if (kicked) return;
    kicked = true;
    user.conn.reducers.addMember({ threadId: th.id, member: orch.identity, role: 'agent' });
    user.conn.reducers.sendMessage({ threadId: th.id, text: 'hi there' });
  });

  user.conn.reducers.createGroup({ title: 'integration room' });

  const text = await done.catch((e: Error) => fail(e.message));
  if (text !== EXPECTED) fail(`reply text was "${text}", expected "${EXPECTED}"`);
  if (!sawStreaming) fail('never observed a streaming reply row');
  if (!sawUpdate) fail('never observed a streamed UPDATE');
  console.info(`\n✅ agent streamed a reply: "${text}" (saw streaming row + live UPDATEs)`);
  process.exit(0);
}

run().catch((e: unknown) => {
  fail(e instanceof Error ? e.message : String(e));
});
