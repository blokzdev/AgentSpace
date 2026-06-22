// Agent reply loop (SPEC §6): when a human posts to a thread the orchestrator is
// an `agent`-role member of, build context, stream a reply from the Model Gateway,
// and write it into STDB as a live message row (begin → append* → finish) via
// batched UPDATEs (BLUEPRINT §5). Correlation is a client-owned runId.
import { Identity } from 'spacetimedb';
import type { ModelGateway } from '@agentspace/gateway';
import { DbConnection } from '@agentspace/stdb-bindings';
import { MissingKeyError } from './byok';
import { buildPrompt, createBatcher, newRunId, selectPersona, type AgentRef, type PromptRow } from './prompt';

const FLUSH_MS = 50;

export interface ReplyLoopOptions {
  flushMs?: number;
}

export function startReplyLoop(
  conn: DbConnection,
  self: Identity,
  gateway: ModelGateway,
  opts: ReplyLoopOptions = {},
): void {
  const flushMs = opts.flushMs ?? FLUSH_MS;
  const active = new Set<bigint>(); // threads with a reply in flight (loop guard)

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
    if (active.has(msg.threadId)) return; // already replying in this thread
    if (!isAgentMemberOf(conn, self, msg.threadId)) return; // we're not the agent here
    void handleReply(conn, self, gateway, flushMs, msg.threadId, active);
  });
}

function isAgentMemberOf(conn: DbConnection, self: Identity, threadId: bigint): boolean {
  for (const m of conn.db.my_thread_members.iter()) {
    if (m.threadId === threadId && m.member.isEqual(self) && m.role === 'agent') return true;
  }
  return false;
}

async function handleReply(
  conn: DbConnection,
  self: Identity,
  gateway: ModelGateway,
  flushMs: number,
  threadId: bigint,
  active: Set<bigint>,
): Promise<void> {
  active.add(threadId);
  const runId = newRunId(self.toHexString());
  let acc = '';
  const batcher = createBatcher({
    intervalMs: flushMs,
    onFlush: (text) => conn.reducers.agentReplyAppend({ runId, text }),
  });

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
      if (m.threadId === threadId) {
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
    for await (const delta of gateway.stream({ model, credentialRef, messages, baseUrl: persona.baseUrl })) {
      if (delta.type === 'text') {
        acc += delta.text;
        batcher.push(acc);
      } else if (delta.type === 'finish') {
        usage = delta.usage;
      }
    }
    batcher.stop();
    conn.reducers.agentReplyFinish({
      runId,
      text: acc,
      ok: true,
      inputTokens: BigInt(usage.inputTokens),
      outputTokens: BigInt(usage.outputTokens),
    });
  } catch (err) {
    batcher.stop();
    console.warn('[orchestrator] reply failed:', err instanceof Error ? err.message : err);
    // Surface a missing-key error to the user in-chat; otherwise a generic failure.
    const text =
      err instanceof MissingKeyError
        ? `⚠️ ${err.message}`
        : acc.length > 0
          ? acc
          : '⚠️ Sorry — I could not generate a reply.';
    conn.reducers.agentReplyFinish({ runId, text, ok: false, inputTokens: 0n, outputTokens: 0n });
  } finally {
    active.delete(threadId);
  }
}
