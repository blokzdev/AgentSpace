// Agent reply loop (SPEC §6): when a human posts to a thread the orchestrator is
// an `agent`-role member of, build context, stream a reply from the Model Gateway,
// and write it into STDB as a live message row. M1.9 streams via append-only delta
// INSERTs (begin → delta* → finish) instead of cumulative-text UPDATEs — small
// constant-size rows the subscription delivers reliably (OT-004/DEC-030). Robustness
// (M1.9.2): backpressure (coalescing batcher), an idle/error timeout that drives a
// stalled run to a terminal state, and cancellation-on-supersede. Correlation is a
// client-owned runId.
import { Identity } from 'spacetimedb';
import type { ModelGateway } from '@agentspace/gateway';
import { DbConnection } from '@agentspace/stdb-bindings';
import { MissingKeyError } from './byok';
import { buildPrompt, createBatcher, newRunId, selectPersona, type AgentRef, type PromptRow } from './prompt';

// Coalescing window for streamed deltas. Each flush is now a small append-only
// INSERT (not a growing cumulative UPDATE), so we can flush ~2× faster than the old
// cumulative path (was 200ms) for a smoother live feel without the OT-004 bandwidth
// penalty.
const FLUSH_MS = 100;
// No token for this long → the provider is presumed hung; abort to a terminal
// `failed` so a run never sticks in `running`/`streaming` (SPEC §1/§2). Reset on
// every token, so a legitimately long-but-active stream never trips it.
const IDLE_TIMEOUT_MS = 60_000;

export interface ReplyLoopOptions {
  flushMs?: number;
  idleTimeoutMs?: number;
}

/** A reply in flight for a thread — the loop guard + the cancellation handle. */
export interface InFlight {
  runId: string;
  /** Mark this reply superseded by a newer human message and abort its stream. */
  supersede: () => void;
}

export function startReplyLoop(
  conn: DbConnection,
  self: Identity,
  gateway: ModelGateway,
  opts: ReplyLoopOptions = {},
): void {
  const flushMs = opts.flushMs ?? FLUSH_MS;
  const idleMs = opts.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  const inFlight = new Map<bigint, InFlight>(); // threadId → in-flight reply

  conn
    .subscriptionBuilder()
    .onApplied(() => {
      console.info('[orchestrator] reply loop subscribed');
    })
    .subscribe([
      'SELECT * FROM my_thread_messages',
      'SELECT * FROM my_thread_members',
      'SELECT * FROM my_threads',
      'SELECT * FROM my_active_personas',
      'SELECT * FROM my_persona_keys',
    ]);

  conn.db.my_thread_messages.onInsert((_ctx, msg) => {
    if (msg.sender.isEqual(self)) return; // our own writes
    if (msg.streamState !== 'complete') return; // an in-flight stream
    if (msg.runId !== '') return; // another agent's reply
    if (!isAgentMemberOf(conn, self, msg.threadId)) return; // we're not the agent here
    // Cancellation-on-supersede: a newer human message interrupts the in-flight reply
    // (which finalizes itself as cancelled) and we answer the new one.
    inFlight.get(msg.threadId)?.supersede();
    void handleReply(conn, self, gateway, flushMs, idleMs, msg.threadId, inFlight);
  });
}

function isAgentMemberOf(conn: DbConnection, self: Identity, threadId: bigint): boolean {
  for (const m of conn.db.my_thread_members.iter()) {
    if (m.threadId === threadId && m.member.isEqual(self) && m.role === 'agent') return true;
  }
  return false;
}

// Exported for unit tests (finalization paths: complete / failed / cancelled).
export async function handleReply(
  conn: DbConnection,
  self: Identity,
  gateway: ModelGateway,
  flushMs: number,
  idleMs: number,
  threadId: bigint,
  inFlight: Map<bigint, InFlight>,
): Promise<void> {
  const runId = newRunId(self.toHexString());
  const abort = new AbortController();
  let superseded = false;
  let timedOut = false;
  // Register synchronously (before any await) so a rapid follow-up message sees us.
  inFlight.set(threadId, {
    runId,
    supersede: () => {
      superseded = true;
      abort.abort();
    },
  });

  let acc = ''; // full cumulative text — only for the authoritative final finish
  let seq = 0n; // one per flush → strictly increasing delta ordering key
  const batcher = createBatcher({
    intervalMs: flushMs,
    onFlush: (text) => conn.reducers.agentReplyDelta({ runId, seq: seq++, text }),
  });

  // Idle watchdog: re-armed on every token; fires only if the provider goes quiet.
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
    const agents: AgentRef[] = [...conn.db.my_active_personas.iter()].map((a) => ({
      id: a.id,
      systemPrompt: a.systemPrompt,
      provider: a.provider,
      model: a.model,
      owner: a.owner.toHexString(),
      baseUrl: a.baseUrl,
    }));
    const persona = selectPersona([...conn.db.my_threads.iter()], agents, threadId);
    const rows: PromptRow[] = [];
    for (const m of conn.db.my_thread_messages.iter()) {
      // Only completed turns are context — skip in-flight streams and failed/cancelled
      // agent replies (e.g. an earlier "⚠️ Sorry…" or a cancelled partial) so they
      // aren't fed back.
      if (m.threadId === threadId && m.streamState === 'complete') {
        rows.push({ isAgent: m.sender.isEqual(self), text: m.text, sentMicros: m.sent.microsSinceUnixEpoch });
      }
    }
    const messages = buildPrompt(rows, persona.systemPrompt);
    const model = persona.model;
    const credentialRef = `${persona.ownerHex}:${model.provider}`; // BYOK key per owner+provider (M1.7)

    // A local (openai-compatible) persona needs a base URL to reach its endpoint (M1.8.2).
    if (model.provider === 'openai-compatible' && persona.baseUrl.trim().length === 0) {
      conn.reducers.agentReplyBegin({ threadId, runId, model: model.model });
      conn.reducers.agentReplyFinish({
        runId,
        text: '⚠️ This agent uses a local (OpenAI-compatible) provider but has no base URL. Edit the agent and set one (e.g. http://localhost:11434/v1).',
        ok: false,
        inputTokens: 0n,
        outputTokens: 0n,
      });
      return;
    }

    conn.reducers.agentReplyBegin({ threadId, runId, model: model.model });

    let usage = { inputTokens: 0, outputTokens: 0 };
    armWatchdog();
    for await (const delta of gateway.stream({
      model,
      credentialRef,
      messages,
      baseUrl: persona.baseUrl,
      signal: abort.signal,
    })) {
      if (delta.type === 'text') {
        acc += delta.text;
        batcher.push(delta.text); // append-only delta — not the cumulative text
        armWatchdog();
      } else if (delta.type === 'finish') {
        usage = delta.usage;
      }
    }
    disarmWatchdog();
    batcher.stop(); // final flush of any pending delta
    // The message row now gets its single authoritative final UPDATE (full text +
    // `complete`); the run's deltas are GC'd in that same reducer transaction.
    conn.reducers.agentReplyFinish({
      runId,
      text: acc,
      ok: true,
      inputTokens: BigInt(usage.inputTokens),
      outputTokens: BigInt(usage.outputTokens),
    });
  } catch (err) {
    disarmWatchdog();
    batcher.stop();
    if (superseded) {
      // A newer human message interrupted this reply: finalize it as cancelled —
      // message `failed` with the partial text (cursor clears, excluded from future
      // context), run `cancelled` (SPEC §1/§2). The new message is already being handled.
      conn.reducers.agentReplyCancel({ runId, text: acc });
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
      conn.reducers.agentReplyFinish({ runId, text, ok: false, inputTokens: 0n, outputTokens: 0n });
    }
  } finally {
    // Only clear our own entry — a supersede may have already replaced it.
    const cur = inFlight.get(threadId);
    if (cur && cur.runId === runId) inFlight.delete(threadId);
  }
}
