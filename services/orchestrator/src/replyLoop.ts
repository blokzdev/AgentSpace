// Agent reply loop (SPEC §6). M2.1: multiple agents converse in one thread over the
// single orchestrator connection. A human message opens an episode (the cost/loop
// budget) and addresses one or more agents (@mention / @everyone / a default
// responder); the loop replies AS each addressed agent, tagged with its agentId,
// serialized per thread (so agent B sees agent A's reply). An agent reply may in
// turn address opted-in agents (`respondsToAgents`), inheriting the same episode —
// the reducer's per-episode budget + once-per-episode-per-agent guard make any
// volley terminate (DEC-031). Streaming is unchanged from M1.9 (begin → delta* →
// finish, append-only delta INSERTs, idle timeout, cancellation-on-supersede).
import { Identity } from 'spacetimedb';
import type { ModelGateway } from '@agentspace/gateway';
import { MAX_OUTPUT_TOKENS_PER_RUN } from '@agentspace/shared';
import { DbConnection } from '@agentspace/stdb-bindings';
import { MissingKeyError } from './byok';
import {
  buildPrompt,
  createBatcher,
  mentionStops,
  newRunId,
  resolveAddressees,
  selectPersonaById,
  stripLeadingName,
  type AgentRef,
  type PromptRow,
  type ThreadAgentInfo,
} from './prompt';

const FLUSH_MS = 100;
const IDLE_TIMEOUT_MS = 60_000;
const MAX_STOP_SEQUENCES = 4; // providers cap stop sequences (Anthropic ≈ a handful)

/** A reducer call returns a promise that REJECTS if the reducer throws (e.g. the
 *  episode budget refuses a begin). Swallow + log so a refusal never crashes the
 *  loop as an unhandled rejection. (Begin is awaited explicitly; this is for the
 *  fire-and-forget delta/finish/cancel calls.) */
function fireAndForget(p: Promise<unknown>): void {
  void p.catch((e) => console.warn('[orchestrator] reducer call rejected:', e instanceof Error ? e.message : e));
}

export interface ReplyLoopOptions {
  flushMs?: number;
  idleTimeoutMs?: number;
}

/** A reply in flight for a thread — the cancellation handle + its episode/agent tag. */
export interface InFlight {
  runId: string;
  threadId: bigint;
  agentId: bigint;
  episodeId: bigint;
  /** Mark this reply superseded by a newer-episode human message and abort its stream. */
  supersede: () => void;
}

/** Per-thread serialized fan-out state (one running reply per thread + a queue). */
export interface LoopState {
  running: Map<bigint, InFlight>;
  queue: Map<bigint, { agentId: bigint; episodeId: bigint }[]>;
  draining: Set<bigint>;
  /** `${episodeId}:${agentId}` we've already replied for — the in-memory loop guard
   *  (a pre-flight of the reducer's once-per-episode-per-agent rule; avoids wasted
   *  gateway calls when an agent↔agent volley re-addresses an agent). */
  replied: Set<string>;
}

export function createLoopState(): LoopState {
  return { running: new Map(), queue: new Map(), draining: new Set(), replied: new Set() };
}

export function startReplyLoop(
  conn: DbConnection,
  self: Identity,
  gateway: ModelGateway,
  opts: ReplyLoopOptions = {},
): void {
  const flushMs = opts.flushMs ?? FLUSH_MS;
  const idleMs = opts.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  const state = createLoopState();

  conn
    .subscriptionBuilder()
    .onApplied(() => {
      console.info('[orchestrator] reply loop subscribed');
    })
    .subscribe([
      'SELECT * FROM my_thread_messages',
      'SELECT * FROM my_thread_members',
      'SELECT * FROM my_threads',
      'SELECT * FROM my_thread_agents',
      'SELECT * FROM my_active_personas',
      'SELECT * FROM my_persona_keys',
      'SELECT * FROM user',
    ]);

  // A human message is INSERTed already `complete` (and, episode-first, with its
  // episodeId set) — handle it on insert.
  conn.db.my_thread_messages.onInsert((_ctx, msg) => {
    if (msg.streamState !== 'complete' || msg.runId !== '') return;
    void onTrigger(conn, self, gateway, flushMs, idleMs, msg, state);
  });

  // An agent reply transitions `streaming`→`complete` (the final finish UPDATE) — the
  // agent→agent trigger. Its addressees are parsed from text + gated by opt-in.
  conn.db.my_thread_messages.onUpdate((_ctx, oldMsg, newMsg) => {
    if (oldMsg.streamState === 'streaming' && newMsg.streamState === 'complete' && newMsg.runId !== '') {
      void onTrigger(conn, self, gateway, flushMs, idleMs, newMsg, state);
    }
  });
}

interface TriggerMsg {
  threadId: bigint;
  agentId: bigint;
  episodeId: bigint;
  text: string;
  mentions: { kind: string; ref: bigint }[];
}

function onTrigger(
  conn: DbConnection,
  self: Identity,
  gateway: ModelGateway,
  flushMs: number,
  idleMs: number,
  msg: TriggerMsg,
  state: LoopState,
): void {
  if (!isAgentMemberOf(conn, self, msg.threadId)) return; // we don't serve this thread

  const agents = threadAgentInfos(conn, msg.threadId);
  const defaultResponderId = agents.find((a) => a.isDefaultResponder)?.agentId ?? 0n;
  const addressees = resolveAddressees(
    { agentId: msg.agentId, text: msg.text, mentions: msg.mentions.map((m) => ({ kind: m.kind, ref: m.ref })) },
    agents,
    { defaultResponderId },
  );
  if (addressees.length === 0) return;

  // A new human message (new episode) supersedes older-episode work in this thread —
  // a fresh question interrupts the previous answer. Same-episode siblings are left be.
  if (msg.agentId === 0n) {
    const run = state.running.get(msg.threadId);
    if (run && run.episodeId !== msg.episodeId) run.supersede();
    const q = state.queue.get(msg.threadId);
    if (q) state.queue.set(msg.threadId, q.filter((p) => p.episodeId === msg.episodeId));
  }

  const q = state.queue.get(msg.threadId) ?? [];
  for (const agentId of addressees) {
    const key = `${msg.episodeId}:${agentId}`;
    if (state.replied.has(key)) continue; // already replied this episode
    if (q.some((p) => p.agentId === agentId && p.episodeId === msg.episodeId)) continue; // already queued
    const run = state.running.get(msg.threadId);
    if (run && run.agentId === agentId && run.episodeId === msg.episodeId) continue; // already running
    q.push({ agentId, episodeId: msg.episodeId });
  }
  state.queue.set(msg.threadId, q);
  void drain(conn, self, gateway, flushMs, idleMs, msg.threadId, state);
}

async function drain(
  conn: DbConnection,
  self: Identity,
  gateway: ModelGateway,
  flushMs: number,
  idleMs: number,
  threadId: bigint,
  state: LoopState,
): Promise<void> {
  if (state.draining.has(threadId)) return; // a worker is already serving this thread
  state.draining.add(threadId);
  try {
    for (;;) {
      const q = state.queue.get(threadId) ?? [];
      const next = q.shift();
      state.queue.set(threadId, q);
      if (!next) break;
      const key = `${next.episodeId}:${next.agentId}`;
      if (state.replied.has(key)) continue;
      state.replied.add(key); // pre-flight loop guard — mark before attempting
      await handleReply(conn, self, gateway, flushMs, idleMs, threadId, next.agentId, next.episodeId, state);
    }
  } finally {
    state.draining.delete(threadId);
  }
}

function isAgentMemberOf(conn: DbConnection, self: Identity, threadId: bigint): boolean {
  for (const m of conn.db.my_thread_members.iter()) {
    if (m.threadId === threadId && m.member.isEqual(self) && m.role === 'agent') return true;
  }
  return false;
}

/** The agents active in a thread, joined to their persona name + flags, in add order. */
function threadAgentInfos(conn: DbConnection, threadId: bigint): ThreadAgentInfo[] {
  const persona = new Map<bigint, { name: string; respondsToAgents: boolean }>();
  for (const a of conn.db.my_active_personas.iter()) {
    persona.set(a.id, { name: a.name, respondsToAgents: a.respondsToAgents });
  }
  const rows: (ThreadAgentInfo & { addedAt: bigint })[] = [];
  for (const ta of conn.db.my_thread_agents.iter()) {
    if (ta.threadId !== threadId) continue;
    const p = persona.get(ta.agentId);
    rows.push({
      agentId: ta.agentId,
      name: p?.name ?? '',
      respondsToAgents: p?.respondsToAgents ?? false,
      isDefaultResponder: ta.isDefaultResponder,
      addedAt: ta.addedAt.microsSinceUnixEpoch,
    });
  }
  rows.sort((a, b) => (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : a.agentId < b.agentId ? -1 : 1));
  return rows.map((r) => ({
    agentId: r.agentId,
    name: r.name,
    respondsToAgents: r.respondsToAgents,
    isDefaultResponder: r.isDefaultResponder,
  }));
}

function displayName(conn: DbConnection, identity: Identity): string {
  for (const u of conn.db.user.iter()) {
    if (u.identity.isEqual(identity)) return u.displayName ?? '';
  }
  return '';
}

/** Other participants' display names — empty in a 1:1 DM so prompts stay un-tagged. */
function rosterNames(conn: DbConnection, threadId: bigint, selfAgentId: bigint, agents: ThreadAgentInfo[]): string[] {
  const humans = [...conn.db.my_thread_members.iter()].filter((m) => m.threadId === threadId && m.role === 'human');
  const multiParty = agents.length > 1 || humans.length > 1;
  if (!multiParty) return [];
  const names: string[] = [];
  for (const a of agents) if (a.agentId !== selfAgentId && a.name.length > 0) names.push(a.name);
  for (const m of humans) {
    const n = displayName(conn, m.member);
    if (n.length > 0) names.push(n);
  }
  return names;
}

function buildRows(conn: DbConnection, threadId: bigint): PromptRow[] {
  const personaName = new Map<bigint, string>();
  for (const a of conn.db.my_active_personas.iter()) personaName.set(a.id, a.name);
  const rows: PromptRow[] = [];
  for (const m of conn.db.my_thread_messages.iter()) {
    // Only completed turns are context — skip in-flight streams and failed/cancelled
    // replies (an earlier "⚠️ …" or a cancelled partial) so they aren't fed back.
    if (m.threadId !== threadId || m.streamState !== 'complete') continue;
    const senderName = m.agentId !== 0n ? (personaName.get(m.agentId) ?? 'Agent') : displayName(conn, m.sender) || 'User';
    rows.push({ id: m.id, agentId: m.agentId, senderName, text: m.text, sentMicros: m.sent.microsSinceUnixEpoch });
  }
  return rows;
}

// Exported for unit tests (finalization paths: complete / failed / cancelled).
export async function handleReply(
  conn: DbConnection,
  self: Identity,
  gateway: ModelGateway,
  flushMs: number,
  idleMs: number,
  threadId: bigint,
  agentId: bigint,
  episodeId: bigint,
  state: LoopState,
): Promise<void> {
  const runId = newRunId(self.toHexString());
  const abort = new AbortController();
  let superseded = false;
  let timedOut = false;
  // Register synchronously (before any await) so a rapid follow-up message sees us.
  state.running.set(threadId, {
    runId,
    threadId,
    agentId,
    episodeId,
    supersede: () => {
      superseded = true;
      abort.abort();
    },
  });

  let acc = '';
  let seq = 0n;
  const batcher = createBatcher({
    intervalMs: flushMs,
    onFlush: (text) => fireAndForget(conn.reducers.agentReplyDelta({ runId, seq: seq++, text })),
  });

  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const armWatchdog = (): void => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, idleMs);
  };
  const disarmWatchdog = (): void => {
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  };

  try {
    const agentRefs: AgentRef[] = [...conn.db.my_active_personas.iter()].map((a) => ({
      id: a.id,
      name: a.name,
      systemPrompt: a.systemPrompt,
      provider: a.provider,
      model: a.model,
      owner: a.owner.toHexString(),
      baseUrl: a.baseUrl,
    }));
    const persona = selectPersonaById(agentRefs, agentId);
    const roster = rosterNames(conn, threadId, agentId, threadAgentInfos(conn, threadId));
    const rows = buildRows(conn, threadId);
    const messages = buildPrompt(rows, {
      targetAgentId: agentId,
      system: persona.systemPrompt,
      selfName: persona.name,
      roster,
    });
    const stopSequences = mentionStops(roster).slice(0, MAX_STOP_SEQUENCES);
    const model = persona.model;
    const credentialRef = `${persona.ownerHex}:${model.provider}`; // BYOK key per owner+provider (M1.7)

    // A local (openai-compatible) persona needs a base URL to reach its endpoint (M1.8.2).
    if (model.provider === 'openai-compatible' && persona.baseUrl.trim().length === 0) {
      try {
        await conn.reducers.agentReplyBegin({ threadId, runId, model: model.model, agentId, episodeId });
      } catch {
        return; // reducer refused the run — nothing to finalize
      }
      fireAndForget(
        conn.reducers.agentReplyFinish({
          runId,
          text: '⚠️ This agent uses a local (OpenAI-compatible) provider but has no base URL. Edit the agent and set one (e.g. http://localhost:11434/v1).',
          ok: false,
          inputTokens: 0n,
          outputTokens: 0n,
        }),
      );
      return;
    }

    // AWAIT begin: the episode budget enforces here (DEC-031). A refusal
    // (already_replied / turns_exhausted / budget_exhausted / concurrency_cap) means
    // NO run/message exists — skip the gateway entirely (no wasted call, nothing to
    // finalize). This is the orchestrator's pre-flight twin of the reducer guard.
    try {
      await conn.reducers.agentReplyBegin({ threadId, runId, model: model.model, agentId, episodeId });
    } catch (err) {
      console.info('[orchestrator] reply refused by episode budget:', err instanceof Error ? err.message : err);
      return;
    }

    // begin succeeded → a run + streaming message exist and MUST be finalized.
    let usage = { inputTokens: 0, outputTokens: 0 };
    armWatchdog();
    try {
      for await (const delta of gateway.stream({
        model,
        credentialRef,
        messages,
        baseUrl: persona.baseUrl,
        signal: abort.signal,
        maxOutputTokens: MAX_OUTPUT_TOKENS_PER_RUN,
        stopSequences,
      })) {
        if (delta.type === 'text') {
          acc += delta.text;
          batcher.push(delta.text);
          armWatchdog();
        } else if (delta.type === 'finish') {
          usage = delta.usage;
        }
      }
      disarmWatchdog();
      batcher.stop();
      fireAndForget(
        conn.reducers.agentReplyFinish({
          runId,
          text: stripLeadingName(acc, persona.name), // drop a leading "Self:" the model may echo
          ok: true,
          inputTokens: BigInt(usage.inputTokens),
          outputTokens: BigInt(usage.outputTokens),
        }),
      );
    } catch (err) {
      disarmWatchdog();
      batcher.stop();
      if (superseded) {
        fireAndForget(conn.reducers.agentReplyCancel({ runId, text: acc }));
      } else {
        const text = timedOut
          ? acc.length > 0
            ? acc
            : '⚠️ Sorry — the model took too long to respond.'
          : err instanceof MissingKeyError
            ? `⚠️ ${err.message}`
            : acc.length > 0
              ? acc
              : '⚠️ Sorry — I could not generate a reply.';
        console.warn('[orchestrator] reply failed:', err instanceof Error ? err.message : err);
        fireAndForget(conn.reducers.agentReplyFinish({ runId, text, ok: false, inputTokens: 0n, outputTokens: 0n }));
      }
    }
  } catch (outerErr) {
    disarmWatchdog();
    batcher.stop();
    console.warn('[orchestrator] handleReply error:', outerErr instanceof Error ? outerErr.message : outerErr);
  } finally {
    const cur = state.running.get(threadId);
    if (cur && cur.runId === runId) state.running.delete(threadId);
  }
}
