// M2.4 (lean) verification (headless): the PUBLIC agent face via `thread_agent_cards`
// (BL-021). Two ANONYMOUS owners — A creates a group + agent "Marina"; B creates agent
// "Lyric" (with a SECRET system prompt); A adds BOTH to the group (add_agent_to_thread is
// member-gated, not owner-gated). A subscribes to thread_agent_cards and must see BOTH
// cards — INCLUDING B's cross-owner agent — with the right name + avatarEmoji, and the
// card must NOT leak the secret persona columns. Needs a running local server with the
// `agentspace` module published. Not in CI.
//   pnpm --filter @agentspace/orchestrator verify:cards
import { Identity } from 'spacetimedb';
import { DbConnection } from '@agentspace/stdb-bindings';

const HOST = process.env.AGENTSPACE_STDB_HOST ?? 'ws://127.0.0.1:3000';
const DB = process.env.AGENTSPACE_STDB_DB ?? 'agentspace';

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
  console.error(`\n❌ M2.4 cards failed: ${msg}`);
  process.exit(1);
}
async function until(label: string, pred: () => boolean, ms = 15_000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) fail(`timed out (${ms}ms): ${label}`);
    await wait(25);
  }
}
const sub = (conn: DbConnection, queries: string[]): Promise<void> =>
  new Promise((resolve) => {
    conn.subscriptionBuilder().onApplied(() => resolve()).subscribe(queries);
  });

const SECRET = 'SECRET-LYRIC-SYSTEM-PROMPT';

async function run(): Promise<void> {
  const a = await connect();
  const b = await connect();
  if (a.identity.isEqual(b.identity)) fail('A and B received the same identity');
  console.info(`A: ${a.identity.toHexString()}\nB: ${b.identity.toHexString()}`);
  await sub(a.conn, ['SELECT * FROM my_threads', 'SELECT * FROM my_agents', 'SELECT * FROM my_thread_agents', 'SELECT * FROM thread_agent_cards']);
  await sub(b.conn, ['SELECT * FROM my_agents']);

  // A: a group + its own agent Marina (🌊). B: a separate agent Lyric (🎵, secret prompt).
  a.conn.reducers.createGroup({ title: 'Cards room' });
  await until('A group', () => [...a.conn.db.my_threads.iter()].some((t) => t.title === 'Cards room'));
  const gid = [...a.conn.db.my_threads.iter()].find((t) => t.title === 'Cards room')!.id;
  a.conn.reducers.createAgent({ name: 'Marina', systemPrompt: 'sea facts', provider: 'anthropic', model: 'm', baseUrl: '', respondsToAgents: false, avatarEmoji: '🌊' });
  b.conn.reducers.createAgent({ name: 'Lyric', systemPrompt: SECRET, provider: 'openai', model: 'l', baseUrl: '', respondsToAgents: false, avatarEmoji: '🎵' });
  await until('Marina', () => [...a.conn.db.my_agents.iter()].some((x) => x.name === 'Marina'));
  await until('Lyric', () => [...b.conn.db.my_agents.iter()].some((x) => x.name === 'Lyric'));
  const marinaId = [...a.conn.db.my_agents.iter()].find((x) => x.name === 'Marina')!.id;
  const lyricId = [...b.conn.db.my_agents.iter()].find((x) => x.name === 'Lyric')!.id;

  // A adds BOTH agents to its group — including B's (cross-owner; member-gated reducer).
  a.conn.reducers.addAgentToThread({ threadId: gid, agentId: marinaId });
  a.conn.reducers.addAgentToThread({ threadId: gid, agentId: lyricId });

  await until('A sees both cards', () => [...a.conn.db.thread_agent_cards.iter()].filter((c) => c.threadId === gid).length >= 2);
  const cards = [...a.conn.db.thread_agent_cards.iter()].filter((c) => c.threadId === gid);
  const marina = cards.find((c) => c.agentId === marinaId);
  const lyric = cards.find((c) => c.agentId === lyricId);
  if (marina?.name !== 'Marina' || marina?.avatarEmoji !== '🌊') fail(`own agent card wrong: ${JSON.stringify(marina)}`);
  if (lyric?.name !== 'Lyric' || lyric?.avatarEmoji !== '🎵') fail(`A cannot see B's CROSS-OWNER agent card (BL-021): ${JSON.stringify(lyric)}`);
  console.info(`✅ A (who owns neither) sees the public card for B's agent: "${lyric.name}" ${lyric.avatarEmoji}`);

  // No secret leak: the projected card carries name + avatar only — never B's systemPrompt.
  const dump = JSON.stringify(cards, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  if (dump.includes(SECRET)) fail('the agent card LEAKED the secret systemPrompt');
  console.info('✅ M2.4 PASS — public agent cards (incl. cross-owner) via thread_agent_cards; name + avatar only, no secret leak (BL-021 fixed).');
  process.exit(0);
}

run().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
