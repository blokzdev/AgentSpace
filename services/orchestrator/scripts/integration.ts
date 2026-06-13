// Local end-to-end check for the orchestrator <-> SpacetimeDB loop (M0.4).
// Needs a running local server with the `agentspace` module published. Not in CI.
//   pnpm --filter @agentspace/orchestrator integration
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Identity } from 'spacetimedb';
import { DbConnection } from '@agentspace/stdb-bindings';
import { connectOrchestrator } from '../src/spacetime';
import { startReplyLoop } from '../src/replyLoop';

const HOST = process.env.AGENTSPACE_STDB_HOST ?? 'ws://127.0.0.1:3000';
const DB = process.env.AGENTSPACE_STDB_DB ?? 'agentspace';

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
  // Orchestrator: isolated token file => its own stable identity + reply loop.
  const orch = await connectOrchestrator({
    tokenFile: join(tmpdir(), `agentspace-orch-int-${Date.now()}.token`),
  });
  startReplyLoop(orch.conn, orch.identity);
  console.info(`orchestrator identity: ${orch.identity.toHexString()}`);

  // User: a fresh anonymous identity.
  const user = await connectUser();
  console.info(`user identity:         ${user.identity.toHexString()}`);

  // User observes the membership-scoped views.
  await new Promise<void>((resolve) => {
    user.conn
      .subscriptionBuilder()
      .onApplied(() => {
        resolve();
      })
      .subscribe(['SELECT * FROM my_thread_messages', 'SELECT * FROM my_threads']);
  });

  const echo = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('timed out (20s) waiting for the orchestrator echo'));
    }, 20_000);
    user.conn.db.my_thread_messages.onInsert((_ctx, msg) => {
      if (msg.text.startsWith('(orchestrator echo)')) {
        clearTimeout(timer);
        resolve(msg.text);
      }
    });
  });

  // When the new thread appears, add the orchestrator as a member and post.
  let kicked = false;
  user.conn.db.my_threads.onInsert((_ctx, th) => {
    if (kicked) return;
    kicked = true;
    user.conn.reducers.addMember({ threadId: th.id, member: orch.identity, role: 'agent' });
    user.conn.reducers.sendMessage({ threadId: th.id, text: 'hello orchestrator' });
  });

  user.conn.reducers.createGroup({ title: 'integration room' });

  const echoText = await echo.catch((e: Error) => fail(e.message));
  console.info(`\n✅ orchestrator echoed: "${echoText}"`);
  process.exit(0);
}

run().catch((e: unknown) => {
  fail(e instanceof Error ? e.message : String(e));
});
