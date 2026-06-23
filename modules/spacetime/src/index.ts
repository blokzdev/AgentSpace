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
    agentId: t.u64(), // bound persona for an agent DM (0 = human-only thread) — M1.5
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

// Reply deltas — append-only streamed chunks for an in-flight agent reply (M1.9).
// Each flush is a small, constant-size INSERT (NOT a growing cumulative UPDATE), so
// the subscription never has to deliver a long burst of ever-larger row updates —
// the OT-004 tail-drop. The client concatenates a run's deltas by `seq` for live
// render; `agent_reply_finish` writes the authoritative final text onto the `message`
// row and GCs these rows (founder: GC-on-finish). Private; read via `my_reply_deltas`.
const replyDelta = table(
  {
    name: 'reply_delta',
    indexes: [
      { accessor: 'by_run', algorithm: 'btree', columns: ['runId'] },
      { accessor: 'by_thread', algorithm: 'btree', columns: ['threadId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    runId: t.string(), // correlation key — matches message.runId / run.runId
    threadId: t.u64(), // denormalized so the View scopes by thread membership
    seq: t.u64(), // orchestrator-assigned, monotonic per run — the ordering key
    text: t.string(), // the INCREMENTAL chunk (not cumulative)
    sent: t.timestamp(),
  }
);

// Agent personas — user-authored configs (M1.5). Config is inline; an immutable
// version *history* (BLUEPRINT §3) is deferred (BL-013) in favor of a `version`
// counter. Private; the owner reads via `my_agents`, the orchestrator via
// `my_active_personas`.
const agent = table(
  {
    name: 'agent',
    indexes: [{ accessor: 'by_owner', algorithm: 'btree', columns: ['owner'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    name: t.string(),
    systemPrompt: t.string(),
    provider: t.string(), // ModelProvider (@agentspace/shared)
    model: t.string(), // provider model id, e.g. 'claude-opus-4-8'
    version: t.u64(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
    baseUrl: t.string(), // '' except for provider 'openai-compatible' (local endpoint) — M1.8.2; appended for clean migration
  }
);

// Singleton holding the orchestrator's identity + its box public key, so reducers
// can add it as the `agent` member and clients can encrypt BYOK keys to it (M1.7).
const service = table(
  { name: 'service' },
  {
    id: t.u8().primaryKey(), // always 0
    identity: t.identity(),
    encPubKey: t.string(), // NaCl box public key (base64) — clients seal BYOK keys to it
  }
);

// Per-user BYOK provider keys (M1.7). `sealed` is CIPHERTEXT ONLY — the raw key is
// encrypted client-side to the orchestrator's box public key and never appears here.
const providerKey = table(
  {
    name: 'provider_key',
    indexes: [
      { accessor: 'by_owner', algorithm: 'btree', columns: ['owner'] },
      { accessor: 'by_owner_provider', algorithm: 'btree', columns: ['owner', 'provider'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    provider: t.string(), // ModelProvider
    sealed: t.string(), // base64(ephPub32 || nonce24 || ciphertext) — never raw
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

const spacetimedb = schema({ user, thread, threadMember, message, run, replyDelta, agent, service, providerKey });
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
    // Dedupe: if a human DM with exactly these two already exists, do nothing.
    for (const m of [...ctx.db.threadMember.by_member.filter(ctx.sender)]) {
      const th = ctx.db.thread.id.find(m.threadId);
      if (!th || th.kind !== 'dm' || th.agentId !== 0n) continue;
      if ([...ctx.db.threadMember.by_thread_member.filter([th.id, other])].length > 0) return;
    }
    const th = ctx.db.thread.insert({
      id: 0n,
      kind: 'dm',
      title: undefined,
      createdBy: ctx.sender,
      createdAt: ctx.timestamp,
      agentId: 0n,
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
      agentId: 0n,
    });
    ctx.db.threadMember.insert({ id: 0n, threadId: th.id, member: ctx.sender, role: 'human', joinedAt: ctx.timestamp });
  }
);

// ── Agent Studio (M1.5) ──────────────────────────────────────────────────────

export const create_agent = spacetimedb.reducer(
  { name: t.string(), systemPrompt: t.string(), provider: t.string(), model: t.string(), baseUrl: t.string() },
  (ctx, { name, systemPrompt, provider, model, baseUrl }) => {
    if (!name) throw new SenderError('Agent name must not be empty');
    if (!model) throw new SenderError('Agent model must not be empty');
    ctx.db.agent.insert({
      id: 0n,
      owner: ctx.sender,
      name,
      systemPrompt,
      provider: provider || 'anthropic',
      model,
      baseUrl: baseUrl || '',
      version: 1n,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }
);

export const update_agent = spacetimedb.reducer(
  { agentId: t.u64(), name: t.string(), systemPrompt: t.string(), provider: t.string(), model: t.string(), baseUrl: t.string() },
  (ctx, { agentId, name, systemPrompt, provider, model, baseUrl }) => {
    const a = ctx.db.agent.id.find(agentId);
    if (!a || !a.owner.isEqual(ctx.sender)) throw new SenderError('Not your agent');
    if (!name) throw new SenderError('Agent name must not be empty');
    if (!model) throw new SenderError('Agent model must not be empty');
    ctx.db.agent.id.update({
      ...a,
      name,
      systemPrompt,
      provider: provider || 'anthropic',
      model,
      baseUrl: baseUrl || '',
      version: a.version + 1n,
      updatedAt: ctx.timestamp,
    });
  }
);

export const delete_agent = spacetimedb.reducer({ agentId: t.u64() }, (ctx, { agentId }) => {
  const a = ctx.db.agent.id.find(agentId);
  if (!a || !a.owner.isEqual(ctx.sender)) throw new SenderError('Not your agent');
  ctx.db.agent.id.delete(agentId);
});

// The orchestrator registers its identity once so agent DMs can add it as the
// `agent` member. First-wins in v1 (harden with OT-007).
export const register_service = spacetimedb.reducer(
  { encPubKey: t.string() },
  (ctx, { encPubKey }) => {
    const existing = ctx.db.service.id.find(0);
    if (existing) {
      ctx.db.service.id.update({ ...existing, identity: ctx.sender, encPubKey });
    } else {
      ctx.db.service.insert({ id: 0, identity: ctx.sender, encPubKey });
    }
  }
);

// BYOK key management (M1.7) — the caller owns the key; `sealed` is ciphertext only.
export const set_provider_key = spacetimedb.reducer(
  { provider: t.string(), sealed: t.string() },
  (ctx, { provider, sealed }) => {
    if (!provider || !sealed) throw new SenderError('provider and sealed are required');
    const existing = [...ctx.db.providerKey.by_owner_provider.filter([ctx.sender, provider])];
    if (existing.length > 0) {
      ctx.db.providerKey.id.update({ ...existing[0], sealed, updatedAt: ctx.timestamp });
    } else {
      ctx.db.providerKey.insert({
        id: 0n,
        owner: ctx.sender,
        provider,
        sealed,
        createdAt: ctx.timestamp,
        updatedAt: ctx.timestamp,
      });
    }
  }
);

export const delete_provider_key = spacetimedb.reducer({ provider: t.string() }, (ctx, { provider }) => {
  for (const k of [...ctx.db.providerKey.by_owner_provider.filter([ctx.sender, provider])]) {
    ctx.db.providerKey.id.delete(k.id);
  }
});

// Deploy a persona into a fresh DM: the owner (human) + the orchestrator service
// identity (agent) become members; the thread carries the bound agentId.
export const create_agent_dm = spacetimedb.reducer({ agentId: t.u64() }, (ctx, { agentId }) => {
  const a = ctx.db.agent.id.find(agentId);
  if (!a || !a.owner.isEqual(ctx.sender)) throw new SenderError('Not your agent');
  const svc = ctx.db.service.id.find(0);
  if (!svc) throw new SenderError('No agent service is available yet');
  const th = ctx.db.thread.insert({
    id: 0n,
    kind: 'dm',
    title: a.name,
    createdBy: ctx.sender,
    createdAt: ctx.timestamp,
    agentId,
  });
  ctx.db.threadMember.insert({ id: 0n, threadId: th.id, member: ctx.sender, role: 'human', joinedAt: ctx.timestamp });
  ctx.db.threadMember.insert({ id: 0n, threadId: th.id, member: svc.identity, role: 'agent', joinedAt: ctx.timestamp });
});

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
// The orchestrator (an `agent`-role member) writes a reply via begin → delta* →
// finish. `begin` inserts an empty `streaming` `message` row + a `running` `run`;
// `delta` appends a small constant-size chunk to `reply_delta` (the client renders
// the per-run concatenation live); `finish` writes the authoritative final text onto
// the `message` row (`complete`/`failed`) and GCs the run's deltas. `cancel` finalizes
// a superseded reply (message `failed` w/ partial text, run `cancelled`). Correlation
// is the client-owned `runId`, so no row id is round-tripped. Each reducer re-checks
// `ctx.sender` owns the work. (`agent_reply_append` — the old cumulative-text UPDATE —
// is retained dormant for back-compat and deleted next milestone; OT-004/DEC-030.)

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

// DORMANT (M1.9): the old cumulative-text UPDATE path. Superseded by agent_reply_delta
// to fix OT-004; kept for back-compat this milestone, deleted next. Not called by the
// orchestrator anymore.
export const agent_reply_append = spacetimedb.reducer(
  { runId: t.string(), text: t.string() },
  (ctx, { runId, text }) => {
    const msg = [...ctx.db.message.by_run.filter(runId)].find((m) => m.sender.isEqual(ctx.sender));
    if (!msg) throw new SenderError('No streaming reply for this runId');
    if (msg.streamState !== 'streaming') throw new SenderError('Reply already finished');
    ctx.db.message.id.update({ ...msg, text });
  }
);

// Append one streamed chunk for an in-flight reply (M1.9). Same sender-ownership +
// `streaming`-state guard as append, but INSERTs a small delta row instead of
// rewriting the message — append-only, constant-size, no O(n²) burst (OT-004).
export const agent_reply_delta = spacetimedb.reducer(
  { runId: t.string(), seq: t.u64(), text: t.string() },
  (ctx, { runId, seq, text }) => {
    const msg = [...ctx.db.message.by_run.filter(runId)].find((m) => m.sender.isEqual(ctx.sender));
    if (!msg) throw new SenderError('No streaming reply for this runId');
    if (msg.streamState !== 'streaming') throw new SenderError('Reply already finished');
    ctx.db.replyDelta.insert({
      id: 0n,
      runId,
      threadId: msg.threadId,
      seq,
      text,
      sent: ctx.timestamp,
    });
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
    // The message row now carries the authoritative final text (the client falls back
    // to it once it's no longer `streaming`), so the run's deltas can be GC'd in the
    // same transaction — the client receives the `complete` row + the delta removal in
    // one subscription update, so there's no stale-text window (DEC-030, founder: GC).
    ctx.db.message.id.update({ ...msg, text, streamState: ok ? 'complete' : 'failed' });
    for (const d of [...ctx.db.replyDelta.by_run.filter(runId)]) ctx.db.replyDelta.id.delete(d.id);
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

// Finalize a superseded reply (the human sent again mid-stream — M1.9). Message →
// `failed` with the partial text (SPEC §1: `failed` = "errored or cancelled
// mid-stream"; clears the cursor, excluded from future prompt context); run →
// `cancelled` (SPEC §2). GCs the run's deltas like finish.
export const agent_reply_cancel = spacetimedb.reducer(
  { runId: t.string(), text: t.string() },
  (ctx, { runId, text }) => {
    const msg = [...ctx.db.message.by_run.filter(runId)].find((m) => m.sender.isEqual(ctx.sender));
    if (!msg) throw new SenderError('No streaming reply for this runId');
    ctx.db.message.id.update({ ...msg, text, streamState: 'failed' });
    for (const d of [...ctx.db.replyDelta.by_run.filter(runId)]) ctx.db.replyDelta.id.delete(d.id);
    const r = [...ctx.db.run.by_run.filter(runId)].find((x) => x.agent.isEqual(ctx.sender));
    if (r) ctx.db.run.id.update({ ...r, status: 'cancelled', updatedAt: ctx.timestamp });
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

// Group management (M1.3) — creator-gated.
export const remove_member = spacetimedb.reducer(
  { threadId: t.u64(), member: t.identity() },
  (ctx, { threadId, member }) => {
    const th = ctx.db.thread.id.find(threadId);
    if (!th) throw new SenderError('Unknown thread');
    if (!th.createdBy.isEqual(ctx.sender)) throw new SenderError('Only the creator can remove members');
    if (member.isEqual(ctx.sender)) throw new SenderError('Use leave_thread to remove yourself');
    for (const m of [...ctx.db.threadMember.by_thread_member.filter([threadId, member])]) {
      ctx.db.threadMember.id.delete(m.id);
    }
  }
);

export const set_thread_title = spacetimedb.reducer(
  { threadId: t.u64(), title: t.string() },
  (ctx, { threadId, title }) => {
    const th = ctx.db.thread.id.find(threadId);
    if (!th) throw new SenderError('Unknown thread');
    if (!th.createdBy.isEqual(ctx.sender)) throw new SenderError('Only the creator can rename');
    ctx.db.thread.id.update({ ...th, title: title.length > 0 ? title : undefined });
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

// In-flight reply deltas for the caller's threads (M1.9) — scoped exactly like
// my_thread_messages. The client concatenates a run's deltas by `seq` for live render.
export const my_reply_deltas = spacetimedb.view(
  { name: 'my_reply_deltas', public: true },
  t.array(replyDelta.rowType),
  (ctx) =>
    [...ctx.db.threadMember.by_member.filter(ctx.sender)].flatMap((m) => [
      ...ctx.db.replyDelta.by_thread.filter(m.threadId),
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

// The caller's own authored agents (Agent Studio).
export const my_agents = spacetimedb.view(
  { name: 'my_agents', public: true },
  t.array(agent.rowType),
  (ctx) => [...ctx.db.agent.by_owner.filter(ctx.sender)]
);

// Personas bound to threads the caller is an `agent` member of — the orchestrator's
// runtime persona lookup (it never owns the agent, so `my_agents` doesn't reach it).
export const my_active_personas = spacetimedb.view(
  { name: 'my_active_personas', public: true },
  t.array(agent.rowType),
  (ctx) =>
    [...ctx.db.threadMember.by_member.filter(ctx.sender)].flatMap((m) => {
      if (m.role !== 'agent') return [];
      const th = ctx.db.thread.id.find(m.threadId);
      if (!th || th.agentId === 0n) return [];
      const a = ctx.db.agent.id.find(th.agentId);
      return a ? [a] : [];
    })
);

// The orchestrator's box public key — public so clients can seal BYOK keys to it (M1.7).
export const service_info = spacetimedb.view(
  { name: 'service_info', public: true },
  t.array(service.rowType),
  (ctx) => {
    const s = ctx.db.service.id.find(0);
    return s ? [s] : [];
  }
);

// The caller's own provider keys (metadata for the Settings UI — `sealed` is opaque).
export const my_provider_keys = spacetimedb.view(
  { name: 'my_provider_keys', public: true },
  t.array(providerKey.rowType),
  (ctx) => [...ctx.db.providerKey.by_owner.filter(ctx.sender)]
);

// Sealed keys the orchestrator needs: for each thread it's an `agent` member of,
// the bound persona owner's provider keys (ciphertext — decryptable only by the
// orchestrator's secret key). The reply loop's resolver surface.
export const my_persona_keys = spacetimedb.view(
  { name: 'my_persona_keys', public: true },
  t.array(providerKey.rowType),
  (ctx) =>
    [...ctx.db.threadMember.by_member.filter(ctx.sender)].flatMap((m) => {
      if (m.role !== 'agent') return [];
      const th = ctx.db.thread.id.find(m.threadId);
      if (!th || th.agentId === 0n) return [];
      const a = ctx.db.agent.id.find(th.agentId);
      return a ? [...ctx.db.providerKey.by_owner.filter(a.owner)] : [];
    })
);
