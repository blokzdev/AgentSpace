// V-2 verification (headless): per-user **Views** hide non-members' data. Two ANONYMOUS
// identities — A creates a group + posts a message; B (a member of nothing) subscribes to
// the SAME `my_threads` / `my_thread_messages` views and must see NONE of A's rows. Proves
// the views scope by `ctx.sender`, not just that the positive read-path works. Needs a
// running local server with the `agentspace` module published. Not in CI.
//   pnpm --filter @agentspace/orchestrator verify:views
import { Identity } from 'spacetimedb';
import { DbConnection } from '@agentspace/stdb-bindings';

const HOST = process.env.AGENTSPACE_STDB_HOST ?? 'ws://127.0.0.1:3000';
const DB = process.env.AGENTSPACE_STDB_DB ?? 'agentspace';

// No token → the server assigns a fresh ANONYMOUS identity, so two connections = two users.
function connect(): Promise<{ conn: DbConnection; identity: Identity }> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB)
      .onConnect((conn, identity) => resolve({ conn, identity }))
      .onConnectError((_ctx, err: Error) => reject(err))
      .build();
  });
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
function fail(msg: string): never {
  console.error(`\n❌ V-2 failed: ${msg}`);
  process.exit(1);
}
async function until(label: string, pred: () => boolean, ms = 15_000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) fail(`timed out (${ms}ms) waiting for: ${label}`);
    await wait(25);
  }
}
function subscribe(conn: DbConnection): Promise<void> {
  return new Promise((resolve) => {
    conn.subscriptionBuilder().onApplied(() => resolve())
      .subscribe(['SELECT * FROM my_threads', 'SELECT * FROM my_thread_messages']);
  });
}

async function run(): Promise<void> {
  // ── A: create a private group + post, and confirm A sees it (positive control) ──
  const a = await connect();
  console.info(`A identity: ${a.identity.toHexString()}`);
  await subscribe(a.conn);
  a.conn.reducers.createGroup({ title: 'A secret room' });
  await until('A sees its own group', () => [...a.conn.db.my_threads.iter()].some((t) => t.title === 'A secret room'));
  const gid = [...a.conn.db.my_threads.iter()].find((t) => t.title === 'A secret room')!.id;
  a.conn.reducers.sendMessage({ threadId: gid, text: 'A secret message', mentions: [] });
  await until('A sees its own message', () => [...a.conn.db.my_thread_messages.iter()].some((m) => m.text === 'A secret message'));
  console.info(`✅ positive: A sees its own group (#${gid}) + message`);

  // ── B: a DIFFERENT anonymous identity, member of nothing — must see none of A's data ──
  const b = await connect();
  console.info(`B identity: ${b.identity.toHexString()}`);
  if (b.identity.isEqual(a.identity)) fail('A and B received the same identity — cannot test isolation');
  await subscribe(b.conn);
  await wait(750); // give any (erroneously) leaked rows time to arrive

  const bThreads = [...b.conn.db.my_threads.iter()];
  const bMsgs = [...b.conn.db.my_thread_messages.iter()];
  if (bThreads.some((t) => t.id === gid)) fail(`B (non-member) can see A's thread #${gid} via my_threads`);
  if (bMsgs.some((m) => m.text === 'A secret message')) fail("B (non-member) can see A's message via my_thread_messages");
  console.info(`✅ negative: B sees ${bThreads.length} threads / ${bMsgs.length} messages — NONE of A's`);

  console.info("\n✅ V-2 PASS — per-user Views scope by ctx.sender; a non-member sees none of A's threads/messages.");
  process.exit(0);
}

run().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
