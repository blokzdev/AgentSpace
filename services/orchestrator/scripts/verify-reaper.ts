// V-18 (crash self-heal) headless proof: the scheduled reaper drives a stuck
// `streaming` message → `failed` once it's older than STREAM_TTL (120s), even with
// the orchestrator dead. We simulate a crash by calling agent_reply_begin (creating
// a streaming message + running run) and NEVER finishing it, then watching the
// reaper terminalize it. No model/key needed. Takes ~2–3 minutes.
//   pnpm --filter @agentspace/orchestrator exec tsx scripts/verify-reaper.ts
//
// PRECONDITION: stop any running orchestrator (`tsx src/main.ts`) against this DB
// first — both it and this script register the singleton `service`, and a stray one
// would steal the agent membership and get our begin refused (OT-008). The
// assertWeOwnService() guard below fails fast with that hint if it happens.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Identity } from 'spacetimedb';
import { DbConnection } from '@agentspace/stdb-bindings';
import { connectOrchestrator } from '../src/spacetime';
import { assertWeOwnService } from './_harness';

const HOST = process.env.AGENTSPACE_STDB_HOST ?? 'ws://127.0.0.1:3000';
const DB = process.env.AGENTSPACE_STDB_DB ?? 'agentspace';

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
function fail(msg: string): never { console.error(`\n❌ V-18 failed: ${msg}`); process.exit(1); }
function connectUser(): Promise<{ conn: DbConnection; identity: Identity }> {
  return new Promise((resolve, reject) => {
    DbConnection.builder().withUri(HOST).withDatabaseName(DB)
      .onConnect((conn, identity) => resolve({ conn, identity }))
      .onConnectError((_ctx, err: Error) => reject(err)).build();
  });
}
async function until(label: string, pred: () => boolean, ms: number): Promise<void> {
  const start = Date.now();
  while (!pred()) { if (Date.now() - start > ms) fail(`timed out (${ms}ms): ${label}`); await wait(250); }
}

async function run(): Promise<void> {
  console.info(`▶ V-18 reaper proof vs ${HOST} / ${DB} (expect a fail-out ~120–180s after the stuck stream)\n`);
  const orch = await connectOrchestrator({ tokenFile: join(tmpdir(), `agentspace-reap-${Date.now()}.token`) });
  orch.conn.reducers.registerService({ encPubKey: 'reaper-test' });

  const user = await connectUser();
  await new Promise<void>((resolve) => {
    user.conn.subscriptionBuilder().onApplied(() => resolve()).subscribe([
      'SELECT * FROM my_thread_messages', 'SELECT * FROM my_threads', 'SELECT * FROM my_thread_agents',
      'SELECT * FROM my_agents', 'SELECT * FROM service_info',
    ]);
  });

  // Seed a persona + a group with that agent (this adds the orchestrator as an agent member).
  let seeded = false;
  const seed = (): void => {
    if (seeded || ![...user.conn.db.service_info.iter()][0]) return;
    seeded = true;
    user.conn.reducers.createAgent({ name: 'Stuckbot', systemPrompt: 'x', provider: 'anthropic', model: 'claude-haiku-4-5-20251001', baseUrl: '', respondsToAgents: false, avatarEmoji: '🤖' });
  };
  user.conn.db.service_info.onInsert(() => seed());
  user.conn.db.service_info.onUpdate(() => seed());
  seed();
  await until('persona', () => [...user.conn.db.my_agents.iter()].length >= 1, 30_000);
  const agentId = [...user.conn.db.my_agents.iter()].find((a) => a.name === 'Stuckbot')!.id;

  const before = new Set([...user.conn.db.my_threads.iter()].filter((t) => t.kind === 'group').map((t) => t.id.toString()));
  user.conn.reducers.createGroup({ title: 'Reaper' });
  await until('group', () => [...user.conn.db.my_threads.iter()].some((t) => t.kind === 'group' && !before.has(t.id.toString())), 30_000);
  const gid = [...user.conn.db.my_threads.iter()].find((t) => t.kind === 'group' && !before.has(t.id.toString()))!.id;
  user.conn.reducers.addAgentToThread({ threadId: gid, agentId });
  await until('agent in group', () => [...user.conn.db.my_thread_agents.iter()].some((ta) => ta.threadId === gid), 30_000);

  // Human send opens an episode.
  const probe = 'reaper probe';
  user.conn.reducers.sendMessage({ threadId: gid, text: probe, mentions: [] });
  await until('episode', () => [...user.conn.db.my_thread_messages.iter()].some((m) => m.runId === '' && m.text === probe), 30_000);
  const episodeId = [...user.conn.db.my_thread_messages.iter()].find((m) => m.runId === '' && m.text === probe)!.episodeId;

  // Simulate a crash mid-stream: begin a reply (streaming message + running run) and NEVER finish it.
  // Guard: confirm WE still own the service singleton (a stray orchestrator would have stolen the
  // agent membership and the begin would be refused — OT-008), so a refusal here is real, not a clobber.
  assertWeOwnService(user.conn, orch.identity, fail);
  const runId = 'reaper-stuck-run';
  orch.conn.reducers
    .agentReplyBegin({ threadId: gid, runId, model: 'crash-sim', agentId, episodeId })
    .catch((e: unknown) => fail(`agent_reply_begin refused: ${e instanceof Error ? e.message : String(e)}`));
  await until('stuck streaming message exists', () => [...user.conn.db.my_thread_messages.iter()].some((m) => m.runId === runId && m.streamState === 'streaming'), 15_000);
  const t0 = Date.now();
  console.info(`  • stuck streaming message created (runId=${runId}); orchestrator now goes silent. Waiting for the reaper…`);

  // The reaper sweeps every 60s and fails out streaming rows older than STREAM_TTL (120s).
  await until('reaper fails out the stuck message', () => {
    const m = [...user.conn.db.my_thread_messages.iter()].find((x) => x.runId === runId);
    return m?.streamState === 'failed';
  }, 220_000);
  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.info(`\n✅ V-18 — the reaper self-healed the stuck stream: message → 'failed' after ${elapsed}s (STREAM_TTL=120s, 60s sweep).`);
  console.info('   On-device this is what clears a dangling "thinking…"/streaming bubble if the orchestrator dies mid-reply.');
  process.exit(0);
}

run().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
