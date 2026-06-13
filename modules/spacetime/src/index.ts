// AgentSpace realtime-core SpacetimeDB module (M0.3).
// Source of truth for chat state. Tables are private; clients read through the
// per-user Views at the bottom (membership-scoped access control — DEC-007).
// Agent/run/knowledge tables arrive in M1+. See BLUEPRINT.md §3 and SPEC.md.
import { schema, t, table, SenderError } from 'spacetimedb/server';

// ── Tables ───────────────────────────────────────────────────────────────────

// Profiles. Public so members can see each other's name/presence.
const user = table(
  { name: 'user', public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string().optional(),
    online: t.bool(),
  }
);

// Threads (private — exposed only via my_threads).
const thread = table(
  { name: 'thread' },
  {
    id: t.u64().primaryKey().autoInc(),
    kind: t.string(), // 'dm' | 'group'
    title: t.string().optional(),
    createdBy: t.identity(),
    createdAt: t.timestamp(),
  }
);

// Membership — the authorization spine (private).
const threadMember = table(
  {
    name: 'thread_member',
    indexes: [
      { accessor: 'by_thread', algorithm: 'btree', columns: ['threadId'] },
      { accessor: 'by_member', algorithm: 'btree', columns: ['member'] },
      { accessor: 'by_thread_member', algorithm: 'btree', columns: ['threadId', 'member'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    threadId: t.u64(),
    member: t.identity(),
    role: t.string(), // 'human' | 'agent'
    joinedAt: t.timestamp(),
  }
);

// Messages (private — exposed only via my_thread_messages).
const message = table(
  {
    name: 'message',
    indexes: [
      { accessor: 'by_thread', algorithm: 'btree', columns: ['threadId'] },
      { accessor: 'by_run', algorithm: 'btree', columns: ['runId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    threadId: t.u64(),
    sender: t.identity(),
    text: t.string(),
    sent: t.timestamp(),
    streamState: t.string(), // 'streaming' | 'complete' | 'failed' (SPEC §1)
    runId: t.string(), // agent reply correlation key ('' for human messages) — SPEC §6
  }
);

// Agent runs — the ledger for a single agent turn (private; orchestrator-owned).
// Keyed by a client-supplied runId so the orchestrator streams without an id
// round-trip. Tokens/cost feed metering (M5). SPEC §2.
const run = table(
  {
    name: 'run',
    indexes: [{ accessor: 'by_run', algorithm: 'btree', columns: ['runId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    runId: t.string(),
    threadId: t.u64(),
    agent: t.identity(),
    model: t.string(),
    status: t.string(), // 'queued'|'running'|'succeeded'|'failed'|'cancelled' (SPEC §2)
    inputTokens: t.u64(),
    outputTokens: t.u64(),
    startedAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

const spacetimedb = schema({ user, thread, threadMember, message, run });
export default spacetimedb;

// ── Reducers ─────────────────────────────────────────────────────────────────
// All writes go through reducers; ctx.sender is the only trusted identity.

export const set_display_name = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    if (!name) throw new SenderError('Display name must not be empty');
    const u = ctx.db.user.identity.find(ctx.sender);
    if (!u) throw new SenderError('Unknown user');
    ctx.db.user.identity.update({ ...u, displayName: name });
  }
);

export const create_dm = spacetimedb.reducer(
  { other: t.identity() },
  (ctx, { other }) => {
    if (ctx.sender.isEqual(other)) throw new SenderError('Cannot DM yourself');
    const th = ctx.db.thread.insert({
      id: 0n,
      kind: 'dm',
      title: undefined,
      createdBy: ctx.sender,
      createdAt: ctx.timestamp,
    });
    ctx.db.threadMember.insert({ id: 0n, threadId: th.id, member: ctx.sender, role: 'human', joinedAt: ctx.timestamp });
    ctx.db.threadMember.insert({ id: 0n, threadId: th.id, member: other, role: 'human', joinedAt: ctx.timestamp });
  }
);

export const create_group = spacetimedb.reducer(
  { title: t.string() },
  (ctx, { title }) => {
    const th = ctx.db.thread.insert({
      id: 0n,
      kind: 'group',
      title,
      createdBy: ctx.sender,
      createdAt: ctx.timestamp,
    });
    ctx.db.threadMember.insert({ id: 0n, threadId: th.id, member: ctx.sender, role: 'human', joinedAt: ctx.timestamp });
  }
);

export const add_member = spacetimedb.reducer(
  { threadId: t.u64(), member: t.identity(), role: t.string() },
  (ctx, { threadId, member, role }) => {
    // Only an existing member may add others.
    if ([...ctx.db.threadMember.by_thread_member.filter([threadId, ctx.sender])].length === 0) {
      throw new SenderError('Not a member of this thread');
    }
    if ([...ctx.db.threadMember.by_thread_member.filter([threadId, member])].length > 0) return;
    ctx.db.threadMember.insert({ id: 0n, threadId, member, role: role || 'human', joinedAt: ctx.timestamp });
  }
);

export const send_message = spacetimedb.reducer(
  { threadId: t.u64(), text: t.string() },
  (ctx, { threadId, text }) => {
    if (!text) throw new SenderError('Message must not be empty');
    if ([...ctx.db.threadMember.by_thread_member.filter([threadId, ctx.sender])].length === 0) {
      throw new SenderError('Not a member of this thread');
    }
    ctx.db.message.insert({
      id: 0n,
      threadId,
      sender: ctx.sender,
      text,
      sent: ctx.timestamp,
      streamState: 'complete',
      runId: '',
    });
  }
);

// ── Agent reply streaming (SPEC §6) ──────────────────────────────────────────
// The orchestrator (an `agent`-role member) writes a reply as a live message row:
// begin (empty `streaming` row + run) → append* (cumulative text) → finish
// (`complete`/`failed`). Correlation is the client-owned `runId`, so no row id is
// round-tripped. Each reducer re-checks `ctx.sender` owns the work.

export const agent_reply_begin = spacetimedb.reducer(
  { threadId: t.u64(), runId: t.string(), model: t.string() },
  (ctx, { threadId, runId, model }) => {
    if (!runId) throw new SenderError('runId must not be empty');
    const membership = [...ctx.db.threadMember.by_thread_member.filter([threadId, ctx.sender])];
    if (membership.length === 0 || !membership.some((m) => m.role === 'agent')) {
      throw new SenderError('Not an agent member of this thread');
    }
    if ([...ctx.db.run.by_run.filter(runId)].length > 0) throw new SenderError('Duplicate runId');
    ctx.db.run.insert({
      id: 0n,
      runId,
      threadId,
      agent: ctx.sender,
      model,
      status: 'running',
      inputTokens: 0n,
      outputTokens: 0n,
      startedAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    ctx.db.message.insert({
      id: 0n,
      threadId,
      sender: ctx.sender,
      text: '',
      sent: ctx.timestamp,
      streamState: 'streaming',
      runId,
    });
  }
);

export const agent_reply_append = spacetimedb.reducer(
  { runId: t.string(), text: t.string() },
  (ctx, { runId, text }) => {
    const msg = [...ctx.db.message.by_run.filter(runId)].find((m) => m.sender.isEqual(ctx.sender));
    if (!msg) throw new SenderError('No streaming reply for this runId');
    if (msg.streamState !== 'streaming') throw new SenderError('Reply already finished');
    ctx.db.message.id.update({ ...msg, text });
  }
);

export const agent_reply_finish = spacetimedb.reducer(
  {
    runId: t.string(),
    text: t.string(),
    ok: t.bool(),
    inputTokens: t.u64(),
    outputTokens: t.u64(),
  },
  (ctx, { runId, text, ok, inputTokens, outputTokens }) => {
    const msg = [...ctx.db.message.by_run.filter(runId)].find((m) => m.sender.isEqual(ctx.sender));
    if (!msg) throw new SenderError('No streaming reply for this runId');
    ctx.db.message.id.update({ ...msg, text, streamState: ok ? 'complete' : 'failed' });
    const r = [...ctx.db.run.by_run.filter(runId)].find((x) => x.agent.isEqual(ctx.sender));
    if (r) {
      ctx.db.run.id.update({
        ...r,
        status: ok ? 'succeeded' : 'failed',
        inputTokens,
        outputTokens,
        updatedAt: ctx.timestamp,
      });
    }
  }
);

export const leave_thread = spacetimedb.reducer(
  { threadId: t.u64() },
  (ctx, { threadId }) => {
    for (const m of [...ctx.db.threadMember.by_thread_member.filter([threadId, ctx.sender])]) {
      ctx.db.threadMember.id.delete(m.id);
    }
  }
);

// ── Lifecycle ────────────────────────────────────────────────────────────────

export const init = spacetimedb.init(() => {});

export const onConnect = spacetimedb.clientConnected((ctx) => {
  const u = ctx.db.user.identity.find(ctx.sender);
  if (u) {
    ctx.db.user.identity.update({ ...u, online: true });
  } else {
    ctx.db.user.insert({ identity: ctx.sender, displayName: undefined, online: true });
  }
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const u = ctx.db.user.identity.find(ctx.sender);
  if (u) ctx.db.user.identity.update({ ...u, online: false });
});

// ── Per-user Views (access control — the M0.3 spike) ─────────────────────────
// Clients subscribe to these, never to the private tables. Each is computed from
// indexed membership lookups for ctx.sender (no full table scans), so a caller
// only ever sees threads/messages/members for threads they belong to.

export const my_threads = spacetimedb.view(
  { name: 'my_threads', public: true },
  t.array(thread.rowType),
  (ctx) =>
    [...ctx.db.threadMember.by_member.filter(ctx.sender)].flatMap((m) => {
      const th = ctx.db.thread.id.find(m.threadId);
      return th ? [th] : [];
    })
);

export const my_thread_messages = spacetimedb.view(
  { name: 'my_thread_messages', public: true },
  t.array(message.rowType),
  (ctx) =>
    [...ctx.db.threadMember.by_member.filter(ctx.sender)].flatMap((m) => [
      ...ctx.db.message.by_thread.filter(m.threadId),
    ])
);

export const my_thread_members = spacetimedb.view(
  { name: 'my_thread_members', public: true },
  t.array(threadMember.rowType),
  (ctx) =>
    [...ctx.db.threadMember.by_member.filter(ctx.sender)].flatMap((m) => [
      ...ctx.db.threadMember.by_thread.filter(m.threadId),
    ])
);
