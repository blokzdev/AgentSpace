// Real-model verification of the M2.1 multi-agent behavior (the substance of
// V-15/V-16/V-17/V-19) — headless, against a real STDB + the REAL Anthropic model
// via the BYOK seal path (the founder's key, read from a gitignored .env). It does
// NOT cover the on-device UI render or SpacetimeAuth login (those need a real device
// + the founder's account). It captures the actual replies + per-reply token usage +
// termination so the founder can confirm coherence/no-bleed by eye and the structural
// guards by assertion. Run with ANTHROPIC_BASE_URL cleared.
//   unset ANTHROPIC_BASE_URL; pnpm --filter @agentspace/orchestrator exec tsx scripts/verify-realmodel.ts
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Identity } from 'spacetimedb';
import type { GatewayDelta, GatewayRequest, ModelGateway } from '@agentspace/gateway';
import { createModelGateway } from '@agentspace/gateway';
import { DbConnection } from '@agentspace/stdb-bindings';
import { connectOrchestrator } from '../src/spacetime';
import { startReplyLoop } from '../src/replyLoop';
import { createByokResolver, loadOrCreateKeypair, pubKeyB64, seal } from '../src/byok';

const HOST = process.env.AGENTSPACE_STDB_HOST ?? 'ws://127.0.0.1:3000';
const DB = process.env.AGENTSPACE_STDB_DB ?? 'agentspace';
const MODEL = 'claude-haiku-4-5-20251001'; // fast + cheap; behavior is model-agnostic
const KEY = (() => {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  try {
    return /ANTHROPIC_API_KEY=(.+)/.exec(readFileSync('.env', 'utf8'))?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
})();

interface Mention { kind: string; ref: bigint; start: number; len: number }
const atAgent = (id: bigint): Mention => ({ kind: 'agent', ref: id, start: 0, len: 0 });
const atEveryone = (): Mention => ({ kind: 'all', ref: 0n, start: 0, len: 0 });

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
function fail(msg: string): never {
  console.error(`\n❌ verification failed: ${msg}`);
  process.exit(1);
}
async function until(label: string, pred: () => boolean, ms = 60_000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) fail(`timed out (${ms}ms) waiting for: ${label}`);
    await wait(50);
  }
}
function connectUser(): Promise<{ conn: DbConnection; identity: Identity }> {
  return new Promise((resolve, reject) => {
    DbConnection.builder().withUri(HOST).withDatabaseName(DB)
      .onConnect((conn, identity) => resolve({ conn, identity }))
      .onConnectError((_ctx, err: Error) => reject(err))
      .build();
  });
}

interface Reply { episodeId: bigint; agentId: bigint; runId: string; text: string }

async function run(): Promise<void> {
  if (!KEY.startsWith('sk-ant-')) fail('no Anthropic key in env/.env (ANTHROPIC_API_KEY)');
  console.info(`▶ Real-model M2.1 verification vs ${HOST} / ${DB}, model ${MODEL}\n`);

  const orch = await connectOrchestrator({ tokenFile: join(tmpdir(), `agentspace-verify-${Date.now()}.token`) });
  const keypair = loadOrCreateKeypair(join(tmpdir(), `agentspace-verify-${Date.now()}.boxkey`));
  orch.conn.reducers.registerService({ encPubKey: pubKeyB64(keypair) });

  // The REAL gateway (real Anthropic calls via the sealed BYOK key), wrapped to record
  // per-call token usage so we can report real episode token spend.
  const real = createModelGateway({
    resolveCredential: createByokResolver({ keys: () => orch.conn.db.my_persona_keys.iter(), secretKey: keypair.secretKey }),
  });
  const tokenLog: { input: number; output: number }[] = [];
  const gateway: ModelGateway = {
    async *stream(req: GatewayRequest): AsyncIterable<GatewayDelta> {
      for await (const d of real.stream(req)) {
        if (d.type === 'finish') tokenLog.push({ input: d.usage.inputTokens, output: d.usage.outputTokens });
        yield d;
      }
    },
    embed: () => Promise.reject(new Error('not used')),
  };
  startReplyLoop(orch.conn, orch.identity, gateway, { flushMs: 60 });

  const user = await connectUser();
  await new Promise<void>((resolve) => {
    user.conn.subscriptionBuilder().onApplied(() => resolve()).subscribe([
      'SELECT * FROM my_thread_messages', 'SELECT * FROM my_reply_deltas', 'SELECT * FROM my_threads',
      'SELECT * FROM my_thread_agents', 'SELECT * FROM my_agents', 'SELECT * FROM service_info',
    ]);
  });

  const replies: Reply[] = [];
  const seen = new Set<string>();
  const note = (m: { runId: string; streamState: string; text: string; agentId: bigint; episodeId: bigint }): void => {
    if (m.runId === '' || m.streamState !== 'complete' || seen.has(m.runId)) return;
    seen.add(m.runId);
    replies.push({ episodeId: m.episodeId, agentId: m.agentId, runId: m.runId, text: m.text });
  };
  user.conn.db.my_thread_messages.onInsert((_c, m) => note(m));
  user.conn.db.my_thread_messages.onUpdate((_c, _o, m) => note(m));

  // Seed the key + personas once the orchestrator pubkey is published.
  let seeded = false;
  const seed = (): void => {
    if (seeded) return;
    const svc = [...user.conn.db.service_info.iter()][0];
    if (!svc || svc.encPubKey.length === 0) return;
    seeded = true;
    user.conn.reducers.setProviderKey({ provider: 'anthropic', sealed: seal(KEY, svc.encPubKey) });
    const mk = (name: string, systemPrompt: string, respondsToAgents: boolean): void => {
      void user.conn.reducers.createAgent({ name, systemPrompt, provider: 'anthropic', model: MODEL, baseUrl: '', respondsToAgents });
    };
    // V-15 / V-17 — two DISTINCT, non-cross-mentioning voices (so a single @a@b shows no bleed).
    mk('Marina', 'You are Marina, a marine biologist. Always answer in exactly ONE concise, factual sentence. Never rhyme, never use emoji.', false);
    mk('Lyric', 'You are Lyric, a poet. Always answer in ONE short rhyming couplet. Never be technical.', false);
    // V-16 — two voices that address each other, to drive (and then bound) a volley.
    mk('Pingu', "You are Pingu. Reply in ONE short sentence. You MUST end every message with exactly '@Pongo' then one brief question.", true);
    mk('Pongo', "You are Pongo. Reply in ONE short sentence. You MUST end every message with exactly '@Pingu' then one brief question.", true);
  };
  user.conn.db.service_info.onInsert(() => seed());
  user.conn.db.service_info.onUpdate(() => seed());
  seed();

  await until('4 personas authored', () => [...user.conn.db.my_agents.iter()].length >= 4);
  const idOf = (name: string): bigint => [...user.conn.db.my_agents.iter()].find((a) => a.name === name)!.id;
  const nameOf = (id: bigint): string => [...user.conn.db.my_agents.iter()].find((a) => a.id === id)?.name ?? `#${id}`;
  const [marina, lyric, pingu, pongo] = [idOf('Marina'), idOf('Lyric'), idOf('Pingu'), idOf('Pongo')];

  const mkGroup = async (title: string, agentIds: bigint[]): Promise<bigint> => {
    const before = new Set([...user.conn.db.my_threads.iter()].filter((t) => t.kind === 'group').map((t) => t.id.toString()));
    user.conn.reducers.createGroup({ title });
    await until(`group ${title}`, () => [...user.conn.db.my_threads.iter()].some((t) => t.kind === 'group' && !before.has(t.id.toString())));
    const gid = [...user.conn.db.my_threads.iter()].find((t) => t.kind === 'group' && !before.has(t.id.toString()))!.id;
    for (const a of agentIds) user.conn.reducers.addAgentToThread({ threadId: gid, agentId: a });
    await until(`${title} agents`, () => [...user.conn.db.my_thread_agents.iter()].filter((ta) => ta.threadId === gid).length >= agentIds.length);
    return gid;
  };
  const episodeOf = (text: string): bigint =>
    [...user.conn.db.my_thread_messages.iter()].find((m) => m.runId === '' && m.text === text)?.episodeId ?? 0n;
  const inEp = (ep: bigint): Reply[] => replies.filter((r) => r.episodeId === ep);
  const printReplies = (ep: bigint, base: number): void => {
    inEp(ep).forEach((r, i) => {
      const t = tokenLog[base + i];
      console.info(`    • ${nameOf(r.agentId)}: ${JSON.stringify(r.text)}${t ? `   [${t.input} in / ${t.output} out]` : ''}`);
    });
  };

  // ── V-15: coherence / no persona-bleed ───────────────────────────────────────
  const g1 = await mkGroup('Reef', [marina, lyric]);
  let base = tokenLog.length;
  const q15 = '@Marina @Lyric — what lives in the deep sea?';
  user.conn.reducers.sendMessage({ threadId: g1, text: q15, mentions: [atAgent(marina), atAgent(lyric)] });
  await until('V-15 episode', () => episodeOf(q15) !== 0n);
  const e15 = episodeOf(q15);
  await until('V-15 both reply', () => inEp(e15).length >= 2, 90_000);
  await wait(2500);
  const o15 = inEp(e15).map((r) => r.agentId);
  console.info('▶ V-15 — coherence / no persona-bleed (@Marina @Lyric):');
  printReplies(e15, base);
  if (o15.length !== 2) fail(`V-15 expected exactly 2 replies, got ${o15.length}`);
  if (!(o15[0] === marina && o15[1] === lyric)) fail(`V-15 reply order was [${o15.map(nameOf).join(', ')}], expected [Marina, Lyric]`);
  console.info('  ✓ each agent replied once, tagged + in mention order (Marina=factual, Lyric=rhyme → eyeball: no bleed)\n');

  // ── V-17: @everyone is bounded (each agent once) ─────────────────────────────
  base = tokenLog.length;
  const q17 = '@everyone — introduce yourself in one line.';
  user.conn.reducers.sendMessage({ threadId: g1, text: q17, mentions: [atEveryone()] });
  await until('V-17 episode', () => episodeOf(q17) !== 0n);
  const e17 = episodeOf(q17);
  await until('V-17 both reply', () => inEp(e17).length >= 2, 90_000);
  await wait(2500);
  const o17 = inEp(e17).map((r) => r.agentId);
  console.info('▶ V-17 — @everyone bounded (each agent exactly once):');
  printReplies(e17, base);
  if (o17.length !== 2 || new Set(o17.map(String)).size !== 2) fail(`V-17 expected each agent once, got [${o17.map(nameOf).join(', ')}]`);
  console.info('  ✓ @everyone fanned out to each agent exactly once — no storm\n');

  // ── V-16: agent↔agent volley TERMINATES within budget (the existential test) ──
  const g2 = await mkGroup('Debate', [pingu, pongo]);
  base = tokenLog.length;
  const q16 = '@Pingu — start a quick back-and-forth with @Pongo.';
  user.conn.reducers.sendMessage({ threadId: g2, text: q16, mentions: [atAgent(pingu)] });
  await until('V-16 episode', () => episodeOf(q16) !== 0n);
  const e16 = episodeOf(q16);
  await until('V-16 first reply', () => inEp(e16).length >= 1, 90_000);
  await wait(12_000); // let any volley fully play out (and any over-run reveal itself)
  const v16 = inEp(e16);
  const spend = tokenLog.slice(base).reduce((s, t) => s + t.input + t.output, 0);
  console.info('▶ V-16 — agent↔agent volley terminates within the episode budget (the existential test):');
  printReplies(e16, base);
  console.info(`    episode token spend: ${spend} (across ${v16.length} repl${v16.length === 1 ? 'y' : 'ies'})`);
  if (v16.length > 2) fail(`VOLLEY DID NOT TERMINATE: ${v16.length} agent replies for one human message (expected ≤ 2 = #agents)`);
  const triggered = v16.length === 2;
  console.info(
    `  ✓ bounded to ${v16.length} repl${v16.length === 1 ? 'y' : 'ies'} (≤ #agents=2)` +
      (triggered ? ' — Pingu addressed @Pongo, Pongo replied, Pingu was refused a 2nd turn (agent_turn).' : ' — note: the model did not emit the @mention, so no agent→agent hop fired this run (guard vacuously holds).') +
      '\n',
  );

  // ── V-19: per-(owner,provider) BYOK with a real key ──────────────────────────
  console.info('▶ V-19 — per-(owner,provider) BYOK: every reply above used the orchestrator-decrypted sealed key');
  console.info('  ✓ the real Anthropic key was sealed client-side, stored as ciphertext, decrypted in-memory, and');
  console.info('    produced real replies. (Distinct keys per agent needs ≥2 owners/keys — single-owner path verified.)\n');

  console.info(`✅ Real-model M2.1 behavior verified headlessly (V-15/16/17/19 core). Total Anthropic calls: ${tokenLog.length}.`);
  console.info('   NOT covered here (need a real device + your SpacetimeAuth login): the on-device UI render,');
  console.info('   the @mention typeahead, the "thinking…" indicator, and V-18 crash self-heal (the 120s reaper).');
  process.exit(0);
}

run().catch((e: unknown) => fail(e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)));
