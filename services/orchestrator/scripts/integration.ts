// Local end-to-end check for the M2.1 multi-agent reply loop (DEC-031), building on
// the M1.9 delta-streaming + M1.7 BYOK paths. A user seals a provider key, authors
// personas, and posts; the orchestrator resolves the sealed key and streams replies
// AS each addressed agent, tagged by agentId. We assert:
//   A) delta streaming + GC + BYOK on a single-agent DM (M1.9 regression);
//   B) a mid-stream message cancels the in-flight reply (supersede);
//   C) @a @b in a group → two replies, in mention order (tagged by agentId);
//   D) an agent↔agent volley TERMINATES within the episode budget (the existential
//      test): @Aria → "@Banjo" → "@Aria" is refused a 2nd turn — exactly 2 replies;
//   E) @everyone → each agent replies exactly once (once-per-episode-per-agent);
//   F) a DIRECT reducer assertion: a duplicate agent_reply_begin for an agent that
//      already took its episode turn is REJECTED (no run/message) — the reducer-side
//      guard, independent of orchestrator memory.
// The scheduled reaper (120s TTL) is impractical to time headlessly — it's covered by
// V-18 (on-device crash + self-heal). Needs a running local server with the
// `agentspace` module published. Not in CI.  pnpm --filter @agentspace/orchestrator integration
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

const PROVIDER = 'anthropic';
const MODEL = 'claude-opus-4-8';
const USER_KEY = 'sk-test-byok-123';
const REPLY_CHUNKS = ['Ahoy', ', ', 'matey', '!'];
const EXPECTED = REPLY_CHUNKS.join('');

interface Mention { kind: string; ref: bigint; start: number; len: number }
const atAgent = (id: bigint): Mention => ({ kind: 'agent', ref: id, start: 0, len: 0 });
const atEveryone = (): Mention => ({ kind: 'all', ref: 0n, start: 0, len: 0 });

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

async function until(label: string, pred: () => boolean, ms = 20_000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) fail(`timed out (${ms}ms) waiting for: ${label}`);
    await wait(25);
  }
}

interface MsgState { streamState: string; text: string; agentId: bigint; episodeId: bigint; sent: bigint }

async function run(): Promise<void> {
  const orch = await connectOrchestrator({
    tokenFile: join(tmpdir(), `agentspace-orch-int-${Date.now()}.token`),
  });
  const keypair = loadOrCreateKeypair(join(tmpdir(), `agentspace-orch-int-${Date.now()}.boxkey`));
  orch.conn.reducers.registerService({ encPubKey: pubKeyB64(keypair) });

  // Gateway: real BYOK resolve, then scripted per-agent chunks. The agent is identified
  // by the "You are \"X\"" roster line (group mode); a "long" prompt streams slowly so a
  // follow-up can interrupt it (B). In the volley flow each agent hands off to the OTHER
  // by name (agent→agent addressing); otherwise a plain, @-free reply (no re-trigger).
  const resolver = createByokResolver({ keys: () => orch.conn.db.my_persona_keys.iter(), secretKey: keypair.secretKey });
  let decryptedKey: string | undefined;
  const gateway: ModelGateway = {
    async *stream(req: GatewayRequest): AsyncIterable<GatewayDelta> {
      decryptedKey = await resolver(req.credentialRef);
      const system = req.messages.find((m) => m.role === 'system')?.content ?? '';
      const self = /You are "([^"]+)"/.exec(system)?.[1] ?? '';
      const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const slow = lastUser.includes('long');

      let chunks: string[];
      if (lastUser.includes('volley') || lastUser.includes('handing off')) {
        chunks = [self === 'Aria' ? 'handing off to @Banjo now' : self === 'Banjo' ? 'handing off to @Aria now' : 'handing off'];
      } else if (self.length > 0) {
        chunks = [`Hi, ${self} here.`]; // group reply, no @mention → no re-trigger
      } else {
        chunks = REPLY_CHUNKS; // single-agent DM (Pirate Pete)
      }

      for (const text of chunks) {
        yield { type: 'text', text };
        if (slow) await sleepAbortable(300, req.signal);
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
        'SELECT * FROM my_thread_agents',
        'SELECT * FROM my_agents',
        'SELECT * FROM service_info',
      ]);
  });

  const msgs = new Map<string, MsgState>(); // runId → latest agent message state
  const seenDeltas = new Map<string, { seq: bigint; text: string }[]>();
  const completedOrder: { runId: string; agentId: bigint; episodeId: bigint }[] = [];
  const completedRuns = new Set<string>();
  const noteMsg = (m: { sender: Identity; streamState: string; text: string; runId: string; agentId: bigint; episodeId: bigint; sent: { microsSinceUnixEpoch: bigint } }): void => {
    if (m.runId === '') return; // human message — read directly off the table when needed
    msgs.set(m.runId, { streamState: m.streamState, text: m.text, agentId: m.agentId, episodeId: m.episodeId, sent: m.sent.microsSinceUnixEpoch });
    if (m.streamState === 'complete' && !completedRuns.has(m.runId)) {
      completedRuns.add(m.runId);
      completedOrder.push({ runId: m.runId, agentId: m.agentId, episodeId: m.episodeId });
    }
  };
  user.conn.db.my_thread_messages.onInsert((_c, m) => noteMsg(m));
  user.conn.db.my_thread_messages.onUpdate((_c, _o, m) => noteMsg(m));
  user.conn.db.my_reply_deltas.onInsert((_c, d) => {
    const arr = seenDeltas.get(d.runId) ?? [];
    arr.push({ seq: d.seq, text: d.text });
    seenDeltas.set(d.runId, arr);
  });

  // Seed the key + 3 personas once the orchestrator's pubkey is published.
  let seeded = false;
  const seed = (): void => {
    if (seeded) return;
    const svc = [...user.conn.db.service_info.iter()][0];
    if (!svc || svc.encPubKey.length === 0) return;
    seeded = true;
    user.conn.reducers.setProviderKey({ provider: PROVIDER, sealed: seal(USER_KEY, svc.encPubKey) });
    user.conn.reducers.createAgent({ name: 'Pirate Pete', systemPrompt: 'You are Pirate Pete.', provider: PROVIDER, model: MODEL, baseUrl: '', respondsToAgents: false });
    user.conn.reducers.createAgent({ name: 'Aria', systemPrompt: 'You are Aria.', provider: PROVIDER, model: MODEL, baseUrl: '', respondsToAgents: true });
    user.conn.reducers.createAgent({ name: 'Banjo', systemPrompt: 'You are Banjo.', provider: PROVIDER, model: MODEL, baseUrl: '', respondsToAgents: true });
  };
  user.conn.db.service_info.onInsert(() => seed());
  user.conn.db.service_info.onUpdate(() => seed());
  seed();

  await until('3 personas authored', () => [...user.conn.db.my_agents.iter()].length >= 3);
  const agentId = (name: string): bigint => {
    const a = [...user.conn.db.my_agents.iter()].find((x) => x.name === name);
    if (!a) fail(`agent ${name} not found`);
    return a.id;
  };
  const peteId = agentId('Pirate Pete');
  const ariaId = agentId('Aria');
  const banjoId = agentId('Banjo');

  const humanEpisodeOf = (text: string): bigint => {
    const m = [...user.conn.db.my_thread_messages.iter()].find((x) => x.runId === '' && x.text === text);
    return m?.episodeId ?? 0n;
  };
  const completedIn = (ep: bigint): { runId: string; agentId: bigint; episodeId: bigint }[] =>
    completedOrder.filter((c) => c.episodeId === ep);

  // ── Scenario A: delta streaming + GC + BYOK (single-agent DM) ─────────────────
  user.conn.reducers.createAgentDm({ agentId: peteId });
  await until('agent DM created', () => [...user.conn.db.my_threads.iter()].some((t) => t.agentId === peteId));
  const dmId = [...user.conn.db.my_threads.iter()].find((t) => t.agentId === peteId)!.id;

  user.conn.reducers.sendMessage({ threadId: dmId, text: 'hello there', mentions: [] });
  await until('reply A completes', () => completedOrder.some((c) => c.agentId === peteId && msgs.get(c.runId)?.streamState === 'complete'));
  const runA = completedOrder.find((c) => c.agentId === peteId)!.runId;
  const aMsg = msgs.get(runA);
  if (aMsg?.text !== EXPECTED) fail(`reply A text was "${aMsg?.text}", expected "${EXPECTED}"`);
  const aDeltas = (seenDeltas.get(runA) ?? []).slice().sort((x, y) => (x.seq < y.seq ? -1 : x.seq > y.seq ? 1 : 0));
  if (aDeltas.length === 0 || aDeltas.map((d) => d.text).join('') !== EXPECTED) fail(`run A delta concat mismatch: "${aDeltas.map((d) => d.text).join('')}"`);
  if ([...user.conn.db.my_reply_deltas.iter()].filter((d) => d.runId === runA).length !== 0) fail('expected run A deltas GC\'d');
  if (decryptedKey !== USER_KEY) fail(`orchestrator decrypted "${decryptedKey ?? '(none)'}", expected the sealed key`);
  if (aMsg.agentId !== peteId) fail(`reply A agentId tag was ${aMsg.agentId}, expected ${peteId}`);
  console.info(`✅ A: DM delta stream in order (${aDeltas.length}) → "${EXPECTED}", GC'd, BYOK decrypted, tagged agentId=${peteId}`);

  // ── Scenario B: cancellation on supersede ────────────────────────────────────
  const beforeB = new Set(msgs.keys());
  user.conn.reducers.sendMessage({ threadId: dmId, text: 'tell me a long tale', mentions: [] });
  await until('run B streaming', () => [...seenDeltas.keys()].some((r) => !beforeB.has(r) && msgs.get(r)?.streamState === 'streaming'));
  const runB = [...seenDeltas.keys()].find((r) => !beforeB.has(r) && msgs.get(r)?.streamState === 'streaming')!;
  user.conn.reducers.sendMessage({ threadId: dmId, text: 'stop — new question', mentions: [] });
  await until('run B cancelled + new reply completes', () => {
    const bFailed = msgs.get(runB)?.streamState === 'failed';
    const newComplete = [...msgs.entries()].some(([r, m]) => r !== runB && !beforeB.has(r) && m.streamState === 'complete');
    return bFailed && newComplete;
  });
  console.info('✅ B: mid-stream message cancelled run B (→ failed); the new message was answered (→ complete)');

  // ── Group with two agents (Aria + Banjo) for C/D/E/F ─────────────────────────
  const groupsBefore = new Set([...user.conn.db.my_threads.iter()].filter((t) => t.kind === 'group').map((t) => t.id.toString()));
  user.conn.reducers.createGroup({ title: 'Squad' });
  await until('group created', () => [...user.conn.db.my_threads.iter()].some((t) => t.kind === 'group' && !groupsBefore.has(t.id.toString())));
  const groupId = [...user.conn.db.my_threads.iter()].find((t) => t.kind === 'group' && !groupsBefore.has(t.id.toString()))!.id;
  user.conn.reducers.addAgentToThread({ threadId: groupId, agentId: ariaId });
  user.conn.reducers.addAgentToThread({ threadId: groupId, agentId: banjoId });
  await until('both agents in the group', () => [...user.conn.db.my_thread_agents.iter()].filter((ta) => ta.threadId === groupId).length >= 2);

  // ── Scenario C: @a @b → two replies, in mention order ────────────────────────
  user.conn.reducers.sendMessage({ threadId: groupId, text: '@Aria @Banjo hello both', mentions: [atAgent(ariaId), atAgent(banjoId)] });
  const epC = await (async () => { await until('episode C opened', () => humanEpisodeOf('@Aria @Banjo hello both') !== 0n); return humanEpisodeOf('@Aria @Banjo hello both'); })();
  await until('both reply in C', () => completedIn(epC).length >= 2);
  await wait(400); // settle — make sure no extra replies sneak in
  const cOrder = completedIn(epC).map((c) => c.agentId);
  if (cOrder.length !== 2) fail(`scenario C produced ${cOrder.length} replies, expected exactly 2`);
  if (!(cOrder[0] === ariaId && cOrder[1] === banjoId)) fail(`scenario C order was [${cOrder.join(', ')}], expected [${ariaId}, ${banjoId}] (mention order)`);
  console.info('✅ C: @Aria @Banjo → two replies, tagged in mention order (Aria, then Banjo)');

  // ── Scenario D: agent↔agent volley TERMINATES (the existential test) ──────────
  user.conn.reducers.sendMessage({ threadId: groupId, text: '@Aria volley', mentions: [atAgent(ariaId)] });
  await until('episode D opened', () => humanEpisodeOf('@Aria volley') !== 0n);
  const epD = humanEpisodeOf('@Aria volley');
  await until('Aria + Banjo both replied in D', () => completedIn(epD).length >= 2);
  await wait(1200); // give any (incorrectly) un-bounded volley time to over-run
  const dReplies = completedIn(epD);
  if (dReplies.length !== 2) fail(`VOLLEY DID NOT TERMINATE: episode D had ${dReplies.length} agent replies, expected exactly 2 (Aria, Banjo). Texts: ${dReplies.map((c) => msgs.get(c.runId)?.text).join(' | ')}`);
  const dAgents = dReplies.map((c) => c.agentId);
  if (!(dAgents.includes(ariaId) && dAgents.includes(banjoId))) fail(`episode D agents were [${dAgents.join(', ')}], expected Aria + Banjo`);
  console.info('✅ D: agent↔agent volley terminated within the episode budget — exactly 2 replies (Aria→@Banjo→@Aria refused a 2nd turn)');

  // ── Scenario E: @everyone → each agent replies exactly once ──────────────────
  user.conn.reducers.sendMessage({ threadId: groupId, text: '@everyone status check', mentions: [atEveryone()] });
  await until('episode E opened', () => humanEpisodeOf('@everyone status check') !== 0n);
  const epE = humanEpisodeOf('@everyone status check');
  await until('both reply in E', () => completedIn(epE).length >= 2);
  await wait(400);
  const eAgents = completedIn(epE).map((c) => c.agentId);
  if (eAgents.length !== 2) fail(`@everyone produced ${eAgents.length} replies, expected exactly 2 (each agent once)`);
  if (new Set(eAgents.map(String)).size !== 2) fail(`@everyone replies were not one-per-agent: [${eAgents.join(', ')}]`);
  console.info('✅ E: @everyone → each agent replied exactly once (once-per-episode-per-agent)');

  // ── Scenario F: DIRECT reducer guard (duplicate begin REJECTED) ──────────────
  user.conn.reducers.sendMessage({ threadId: groupId, text: '@Aria probe once', mentions: [atAgent(ariaId)] });
  await until('episode F opened', () => humanEpisodeOf('@Aria probe once') !== 0n);
  const epF = humanEpisodeOf('@Aria probe once');
  await until('Aria replied in F', () => completedIn(epF).some((c) => c.agentId === ariaId));
  // Aria has taken her turn in episode F. A second begin for (epF, Aria) must be refused
  // by the reducer (agent_turn) — independent of the orchestrator's in-memory guard.
  orch.conn.reducers
    .agentReplyBegin({ threadId: groupId, runId: 'manual-dup-probe', model: 'manual', agentId: ariaId, episodeId: epF })
    .catch(() => { /* expected: the reducer rejects with `already_replied` */ });
  await wait(700);
  if ([...user.conn.db.my_thread_messages.iter()].some((m) => m.runId === 'manual-dup-probe')) {
    fail('reducer accepted a duplicate agent_reply_begin for an agent that already took its episode turn');
  }
  console.info('✅ F: reducer REFUSED a duplicate agent turn (no run/message) — the loop bound is enforced server-side');

  console.info('\n✅ M2.1 multi-agent group threads end-to-end OK (tag-based replies, mention order, terminating volley, bounded @everyone, reducer-enforced budget).');
  process.exit(0);
}

run().catch((e: unknown) => {
  fail(e instanceof Error ? e.message : String(e));
});
