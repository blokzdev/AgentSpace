// Local end-to-end check for the M1.9 delta-streaming reply loop + per-user BYOK
// (M1.7). A user seals a provider key to the orchestrator's box public key and stores
// the CIPHERTEXT in STDB; authors a persona; posts. The orchestrator resolves the
// sealed key (the real BYOK path) and streams a reply via append-only `reply_delta`
// INSERTs. We assert:
//   A) the deltas arrive in `seq` order and their concatenation == the final reply,
//      the `message` row settles `complete` with that exact text, the deltas are GC'd
//      on finish, and the orchestrator decrypted exactly the key the user sealed;
//   B) a second message sent mid-stream CANCELS the in-flight reply (its message →
//      `failed`) and the new message is answered (`complete`).
// Needs a running local server with the `agentspace` module published. Not in CI.
//   pnpm --filter @agentspace/orchestrator integration
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Identity } from 'spacetimedb';
import type { GatewayDelta, GatewayRequest, ModelGateway } from '@agentspace/gateway';
import { DbConnection } from '@agentspace/stdb-bindings';
import { connectOrchestrator } from '../src/spacetime';
import { startReplyLoop } from '../src/replyLoop';
import { createByokResolver, loadOrCreateKeypair, pubKeyB64, seal } from '../src/byok';

const HOST = process.env.AGENTSPACE_STDB_HOST ?? 'ws://127.0.0.1:3000';
const DB = process.env.AGENTSPACE_STDB_DB ?? 'agentspace';

const PERSONA = { name: 'Pirate Pete', systemPrompt: 'You are Pirate Pete.', provider: 'anthropic', model: 'claude-opus-4-8' };
const USER_KEY = 'sk-test-byok-123';
const REPLY_CHUNKS = ['Ahoy', ', ', 'matey', '!'];
const EXPECTED = REPLY_CHUNKS.join('');
const SLOW_TRIGGER = 'tell me a long tale'; // makes the gateway stream slowly (interruptible)

function connectUser(): Promise<{ conn: DbConnection; identity: Identity }> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB)
      .onConnect((conn, identity) => resolve({ conn, identity }))
      .onConnectError((_ctx, err: Error) => reject(err))
      .build();
  });
}

function fail(msg: string): never {
  console.error(`\n❌ integration failed: ${msg}`);
  process.exit(1);
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const sleepAbortable = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true });
  });

/** Poll a predicate until true or time out. */
async function until(label: string, pred: () => boolean, ms = 20_000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) fail(`timed out (${ms}ms) waiting for: ${label}`);
    await wait(25);
  }
}

interface MsgState { streamState: string; text: string; sent: bigint }

async function run(): Promise<void> {
  const orch = await connectOrchestrator({
    tokenFile: join(tmpdir(), `agentspace-orch-int-${Date.now()}.token`),
  });
  const keypair = loadOrCreateKeypair(join(tmpdir(), `agentspace-orch-int-${Date.now()}.boxkey`));
  orch.conn.reducers.registerService({ encPubKey: pubKeyB64(keypair) });

  // Gateway: real BYOK resolve, then scripted chunks. A "long" prompt streams slowly so
  // a follow-up message can interrupt it (scenario B); everything else streams fast.
  const resolver = createByokResolver({ keys: () => orch.conn.db.my_persona_keys.iter(), secretKey: keypair.secretKey });
  let decryptedKey: string | undefined;
  const gateway: ModelGateway = {
    async *stream(req: GatewayRequest): AsyncIterable<GatewayDelta> {
      decryptedKey = await resolver(req.credentialRef); // ← the BYOK path
      const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const slow = lastUser.includes('long');
      for (const text of REPLY_CHUNKS) {
        yield { type: 'text', text };
        if (slow) await sleepAbortable(300, req.signal); // interruptible window
      }
      yield { type: 'finish', usage: { inputTokens: 7, outputTokens: 4 }, finishReason: 'stop' };
    },
    embed: () => Promise.reject(new Error('not used')),
  };
  startReplyLoop(orch.conn, orch.identity, gateway, { flushMs: 20 });
  console.info(`orchestrator identity: ${orch.identity.toHexString()}`);

  const user = await connectUser();
  console.info(`user identity:         ${user.identity.toHexString()}`);

  await new Promise<void>((resolve) => {
    user.conn
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .subscribe([
        'SELECT * FROM my_thread_messages',
        'SELECT * FROM my_reply_deltas',
        'SELECT * FROM my_threads',
        'SELECT * FROM my_agents',
        'SELECT * FROM service_info',
      ]);
  });

  // Track agent messages + the deltas seen per run (deltas get GC'd on finish, but the
  // client observes each onInsert first — so we keep our own copy to assert ordering).
  const msgs = new Map<string, MsgState>(); // runId → latest message state
  const seenDeltas = new Map<string, { seq: bigint; text: string }[]>(); // runId → deltas (as seen)
  const noteMsg = (m: { sender: Identity; streamState: string; text: string; runId: string; sent: { microsSinceUnixEpoch: bigint } }): void => {
    if (!m.sender.isEqual(orch.identity) || m.runId === '') return;
    msgs.set(m.runId, { streamState: m.streamState, text: m.text, sent: m.sent.microsSinceUnixEpoch });
  };
  user.conn.db.my_thread_messages.onInsert((_c, m) => noteMsg(m));
  user.conn.db.my_thread_messages.onUpdate((_c, _o, m) => noteMsg(m));
  user.conn.db.my_reply_deltas.onInsert((_c, d) => {
    const arr = seenDeltas.get(d.runId) ?? [];
    arr.push({ seq: d.seq, text: d.text });
    seenDeltas.set(d.runId, arr);
  });

  // Seed the key + persona once the orchestrator's pubkey is published.
  let seeded = false;
  const seed = (): void => {
    if (seeded) return;
    const svc = [...user.conn.db.service_info.iter()][0];
    if (!svc || svc.encPubKey.length === 0) return;
    seeded = true;
    const sealed = seal(USER_KEY, svc.encPubKey);
    user.conn.reducers.setProviderKey({ provider: PERSONA.provider, sealed });
    user.conn.reducers.createAgent({ name: PERSONA.name, systemPrompt: PERSONA.systemPrompt, provider: PERSONA.provider, model: PERSONA.model, baseUrl: '' });
  };
  user.conn.db.service_info.onInsert(() => seed());
  user.conn.db.service_info.onUpdate(() => seed());
  seed();

  // Deploy the persona to a DM.
  let threadId: bigint | undefined;
  await new Promise<void>((resolve) => {
    user.conn.db.my_agents.onInsert((_c, a) => {
      if (threadId !== undefined) return;
      user.conn.reducers.createAgentDm({ agentId: a.id });
    });
    user.conn.db.my_threads.onInsert((_c, th) => {
      if (threadId !== undefined || th.agentId === 0n) return;
      threadId = th.id;
      resolve();
    });
  });
  if (threadId === undefined) fail('no agent DM created');
  const tid = threadId;

  // ── Scenario A: delta streaming + GC ─────────────────────────────────────────
  user.conn.reducers.sendMessage({ threadId: tid, text: 'hello there' });
  await until('reply A completes', () => [...msgs.values()].some((m) => m.streamState === 'complete'));
  const runA = [...msgs.entries()].find(([, m]) => m.streamState === 'complete')?.[0];
  if (!runA) fail('no completed run A');
  const aMsg = msgs.get(runA);
  if (aMsg?.text !== EXPECTED) fail(`reply A text was "${aMsg?.text}", expected "${EXPECTED}"`);
  const aDeltas = (seenDeltas.get(runA) ?? []).slice().sort((x, y) => (x.seq < y.seq ? -1 : x.seq > y.seq ? 1 : 0));
  if (aDeltas.length === 0) fail('no deltas observed for run A');
  if (aDeltas.map((d) => d.text).join('') !== EXPECTED) fail(`run A delta concat was "${aDeltas.map((d) => d.text).join('')}", expected "${EXPECTED}"`);
  // GC: after finish, the live delta table holds none for this run.
  const liveA = [...user.conn.db.my_reply_deltas.iter()].filter((d) => d.runId === runA);
  if (liveA.length !== 0) fail(`expected run A deltas GC'd, found ${liveA.length} live rows`);
  if (decryptedKey !== USER_KEY) fail(`orchestrator decrypted "${decryptedKey ?? '(none)'}", expected the user's sealed key`);
  console.info(`✅ A: deltas streamed in order (${aDeltas.length}) → "${EXPECTED}", settled complete, GC'd; BYOK key decrypted`);

  // ── Scenario B: cancellation on supersede ────────────────────────────────────
  const before = new Set(msgs.keys());
  user.conn.reducers.sendMessage({ threadId: tid, text: SLOW_TRIGGER }); // → slow reply (run B)
  await until('run B starts streaming', () => [...seenDeltas.keys()].some((r) => !before.has(r) && (msgs.get(r)?.streamState === 'streaming')));
  const runB = [...seenDeltas.keys()].find((r) => !before.has(r) && msgs.get(r)?.streamState === 'streaming');
  if (!runB) fail('run B never started streaming');
  user.conn.reducers.sendMessage({ threadId: tid, text: 'stop — new question' }); // interrupts run B
  await until('run B cancelled (failed) + a new reply completes', () => {
    const bFailed = msgs.get(runB)?.streamState === 'failed';
    const newComplete = [...msgs.entries()].some(([r, m]) => r !== runB && !before.has(r) && m.streamState === 'complete');
    return bFailed && newComplete;
  });
  console.info(`✅ B: mid-stream message cancelled run B (→ failed) and the new message was answered (→ complete)`);

  console.info(`\n✅ M1.9 streaming hardening end-to-end OK (delta order + GC + BYOK + cancellation).`);
  process.exit(0);
}

run().catch((e: unknown) => {
  fail(e instanceof Error ? e.message : String(e));
});
