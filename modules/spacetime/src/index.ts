// AgentSpace realtime-core SpacetimeDB module (M0.3).
// Source of truth for chat state. Tables are private; clients read through the
// per-user Views at the bottom (membership-scoped access control — DEC-007).
// Agent/run/knowledge tables arrive in M1+. See BLUEPRINT.md §3 and SPEC.md.
import { schema, t, table, SenderError } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb'; // scheduled tables (the M2.1 reaper)

// Episode-budget dials (DEC-031 — starting defaults, tune after V-16). These MUST
// match the client/orchestrator copy in `@agentspace/shared`; the WASM module can't
// import that package, so they're a coupled feature in two files (CLAUDE.md §8).
const MAX_TURNS_HARD = 8; // hard ceiling on agent turns per human-rooted episode
const MAX_CONCURRENT = 2; // max concurrently-`running` runs per thread (backstop)
const EPISODE_TOKEN_CEILING = 50_000n; // episode-wide token budget, summed across runs
const STREAM_TTL_MICROS = 120_000_000n; // 120s — reaper fails out stale streaming/running
const REAPER_INTERVAL_MICROS = 60_000_000n; // the reaper scans every 60s

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

// A structured @mention carried on a human message (M2.1; SPEC §3). `ref` is an
// agent.id for kind 'agent'; 'all' is the synthetic @everyone (ref 0); 'human' is
// reserved (MVP composer never emits it). start/len locate the @token in `text`.
const Mention = t.object('Mention', {
  kind: t.string(), // 'agent' | 'human' | 'all'
  ref: t.u64(),
  start: t.u32(),
  len: t.u32(),
});

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
    // M2.1 (appended for clean migration): structured addressing + the authoring
    // agent tag (0n = human; drives tag-based isAgent, fixing persona-bleed) + the
    // episode this message belongs to (the cost/loop budget ledger).
    mentions: t.array(Mention),
    agentId: t.u64(),
    episodeId: t.u64(),
  }
);

// Agent runs — the ledger for a single agent turn (private; orchestrator-owned).
// Keyed by a client-supplied runId so the orchestrator streams without an id
// round-trip. Tokens/cost feed metering (M5). SPEC §2.
const run = table(
  {
    name: 'run',
    indexes: [
      { accessor: 'by_run', algorithm: 'btree', columns: ['runId'] },
      // M2.1: count `running` runs per thread for the concurrency cap + reaper scan.
      { accessor: 'by_thread', algorithm: 'btree', columns: ['threadId'] },
    ],
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
    // M2.1 (appended): which persona ran, and the episode it drew budget from.
    agentId: t.u64(),
    episodeId: t.u64(),
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
    respondsToAgents: t.bool(), // M2.1 (appended): opt-in to agent→agent addressing (DEC-031; default off)
    avatarEmoji: t.string(), // M2.4 (appended): the agent's public avatar (emoji/short text; '🤖' default)
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

// ── Multi-agent group threads (M2.1; DEC-031) ────────────────────────────────
// thread_agent enumerates the personas active in a thread, generalizing the
// singular thread.agentId (many agents per thread). One of them is the default
// responder (answers an unaddressed human message). Private; read via the new
// my_thread_agents view + the rewritten persona/key views.
const threadAgent = table(
  {
    name: 'thread_agent',
    indexes: [
      { accessor: 'by_thread', algorithm: 'btree', columns: ['threadId'] },
      { accessor: 'by_thread_agent', algorithm: 'btree', columns: ['threadId', 'agentId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    threadId: t.u64(),
    agentId: t.u64(),
    isDefaultResponder: t.bool(), // replies when a human message addresses no agent
    addedBy: t.identity(),
    addedAt: t.timestamp(),
  }
);

// The cost/loop ledger for one human-rooted exchange (DEC-031). Opened ONLY by a
// human send_message; agent replies inherit its episodeId and draw down its budget.
// `agent_reply_begin` refuses a run once turns/tokens are exhausted — agent code
// literally cannot start a disallowed reply. Private.
const episode = table(
  {
    name: 'episode',
    indexes: [{ accessor: 'by_thread', algorithm: 'btree', columns: ['threadId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    threadId: t.u64(),
    rootMessageId: t.u64(), // the human message that opened the episode
    turnsRemaining: t.u8(), // decremented per admitted agent reply
    tokenBudgetRemaining: t.u64(), // decremented by each finished run's tokens
    openedAt: t.timestamp(),
    status: t.string(), // 'open' | 'closed'
  }
);

// Once-per-episode-per-agent ledger (DEC-031). Its presence makes any agent↔agent
// volley terminate structurally: an agent that already replied in an episode is
// refused a second turn, so a volley ends after ≤ #agents replies. Private.
const agentTurn = table(
  {
    name: 'agent_turn',
    indexes: [
      { accessor: 'by_episode', algorithm: 'btree', columns: ['episodeId'] },
      { accessor: 'by_episode_agent', algorithm: 'btree', columns: ['episodeId', 'agentId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    episodeId: t.u64(),
    agentId: t.u64(),
  }
);

// Scheduled-reducer timer (M2.1 reaper). A row seeded in `init` makes SpacetimeDB
// invoke `reap_stale_runs` on the interval; the `(): any =>` defers the reference
// past `reap_stale_runs`'s declaration (circular-dep break — SDK idiom).
const reaperSchedule = table(
  {
    name: 'reaper_schedule',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK idiom: `(): any =>` defers the ref past reap_stale_runs's declaration (circular-dep break)
    scheduled: (): any => reap_stale_runs,
  },
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  }
);

const spacetimedb = schema({
  user, thread, threadMember, message, run, replyDelta, agent, service, providerKey,
  threadAgent, episode, agentTurn, reaperSchedule,
});
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
  { name: t.string(), systemPrompt: t.string(), provider: t.string(), model: t.string(), baseUrl: t.string(), respondsToAgents: t.bool(), avatarEmoji: t.string() },
  (ctx, { name, systemPrompt, provider, model, baseUrl, respondsToAgents, avatarEmoji }) => {
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
      respondsToAgents,
      avatarEmoji: (avatarEmoji || '🤖').slice(0, 16), // public; default + bounded (sanitize untrusted input)
    });
  }
);

export const update_agent = spacetimedb.reducer(
  { agentId: t.u64(), name: t.string(), systemPrompt: t.string(), provider: t.string(), model: t.string(), baseUrl: t.string(), respondsToAgents: t.bool(), avatarEmoji: t.string() },
  (ctx, { agentId, name, systemPrompt, provider, model, baseUrl, respondsToAgents, avatarEmoji }) => {
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
      respondsToAgents,
      avatarEmoji: (avatarEmoji || '🤖').slice(0, 16),
    });
  }
);

export const delete_agent = spacetimedb.reducer({ agentId: t.u64() }, (ctx, { agentId }) => {
  const a = ctx.db.agent.id.find(agentId);
  if (!a || !a.owner.isEqual(ctx.sender)) throw new SenderError('Not your agent');
  ctx.db.agent.id.delete(agentId);
});

// The orchestrator registers its identity so agent DMs can add it as the `agent`
// member. LAST-write-wins today: a later caller overwrites `service.identity` — fine
// for the single central orchestrator (DEC-027), but it means two concurrent service
// identities (e.g. a stray orchestrator vs a verify script) clobber each other. The
// guarded fix (reject a competing identity) is OT-007; the test scripts preflight it
// via assertWeOwnService (services/orchestrator/scripts/_harness.ts).
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
  // M2.1: also register the persona in thread_agent so the rewritten persona/key
  // views (which read thread_agent, not thread.agentId) resolve this DM. It is the
  // default responder, so an unaddressed message in a 1:1 agent DM still gets a reply.
  ctx.db.threadAgent.insert({
    id: 0n, threadId: th.id, agentId, isDefaultResponder: true, addedBy: ctx.sender, addedAt: ctx.timestamp,
  });
});

// Add an authored agent to a thread (M2.1). Member-gated; idempotent on
// (thread, agent). The first agent added becomes the thread's default responder.
// Ensures the orchestrator service identity is an `agent` member so it can reply.
export const add_agent_to_thread = spacetimedb.reducer(
  { threadId: t.u64(), agentId: t.u64() },
  (ctx, { threadId, agentId }) => {
    if ([...ctx.db.threadMember.by_thread_member.filter([threadId, ctx.sender])].length === 0) {
      throw new SenderError('Not a member of this thread');
    }
    if (!ctx.db.agent.id.find(agentId)) throw new SenderError('Unknown agent');
    if ([...ctx.db.threadAgent.by_thread_agent.filter([threadId, agentId])].length > 0) return; // dedupe
    const existing = [...ctx.db.threadAgent.by_thread.filter(threadId)];
    ctx.db.threadAgent.insert({
      id: 0n, threadId, agentId,
      isDefaultResponder: existing.length === 0,
      addedBy: ctx.sender, addedAt: ctx.timestamp,
    });
    const svc = ctx.db.service.id.find(0);
    if (svc && [...ctx.db.threadMember.by_thread_member.filter([threadId, svc.identity])].length === 0) {
      ctx.db.threadMember.insert({ id: 0n, threadId, member: svc.identity, role: 'agent', joinedAt: ctx.timestamp });
    }
  }
);

// Remove an agent from a thread (M2.1). Member-gated. When the last agent leaves,
// the orchestrator's `agent` membership is removed too (it no longer serves it).
export const remove_agent_from_thread = spacetimedb.reducer(
  { threadId: t.u64(), agentId: t.u64() },
  (ctx, { threadId, agentId }) => {
    if ([...ctx.db.threadMember.by_thread_member.filter([threadId, ctx.sender])].length === 0) {
      throw new SenderError('Not a member of this thread');
    }
    for (const ta of [...ctx.db.threadAgent.by_thread_agent.filter([threadId, agentId])]) {
      ctx.db.threadAgent.id.delete(ta.id);
    }
    if ([...ctx.db.threadAgent.by_thread.filter(threadId)].length === 0) {
      const svc = ctx.db.service.id.find(0);
      if (svc) {
        for (const m of [...ctx.db.threadMember.by_thread_member.filter([threadId, svc.identity])]) {
          if (m.role === 'agent') ctx.db.threadMember.id.delete(m.id);
        }
      }
    }
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
  { threadId: t.u64(), text: t.string(), mentions: t.array(Mention) },
  (ctx, { threadId, text, mentions }) => {
    if (!text) throw new SenderError('Message must not be empty');
    const membership = [...ctx.db.threadMember.by_thread_member.filter([threadId, ctx.sender])];
    if (membership.length === 0) throw new SenderError('Not a member of this thread');

    // Sanitize untrusted client mentions (CLAUDE.md §8): an @agent must reference an
    // agent currently in this thread; @everyone (kind 'all') is always allowed.
    const threadAgentIds = new Set(
      [...ctx.db.threadAgent.by_thread.filter(threadId)].map((ta) => ta.agentId),
    );
    for (const mn of mentions) {
      if (mn.kind === 'agent' && !threadAgentIds.has(mn.ref)) {
        throw new SenderError('Mentioned agent is not in this thread');
      }
    }

    // A HUMAN send opens an episode — the cost/loop budget ledger (DEC-031). Agent
    // replies post via agent_reply_begin (never send_message) and inherit this id,
    // so only a 'human'-role member can open one. Insert the episode FIRST so the
    // message is inserted exactly ONCE with its final episodeId (a subscriber's
    // onInsert then sees the episodeId already set — no insert-then-update window).
    const isHuman = membership.some((m) => m.role === 'human');
    let episodeId = 0n;
    let openedEpisode: ReturnType<typeof ctx.db.episode.insert> | undefined;
    if (isHuman) {
      const addressed = new Set<bigint>();
      for (const mn of mentions) {
        if (mn.kind === 'agent') addressed.add(mn.ref);
        else if (mn.kind === 'all') for (const id of threadAgentIds) addressed.add(id);
      }
      openedEpisode = ctx.db.episode.insert({
        id: 0n,
        threadId,
        rootMessageId: 0n, // back-stamped below once the message has an id
        turnsRemaining: Math.max(MAX_TURNS_HARD, addressed.size),
        tokenBudgetRemaining: EPISODE_TOKEN_CEILING,
        openedAt: ctx.timestamp,
        status: 'open',
      });
      episodeId = openedEpisode.id;
    }

    const msg = ctx.db.message.insert({
      id: 0n,
      threadId,
      sender: ctx.sender,
      text,
      sent: ctx.timestamp,
      streamState: 'complete',
      runId: '',
      mentions,
      agentId: 0n,
      episodeId,
    });

    if (openedEpisode) ctx.db.episode.id.update({ ...openedEpisode, rootMessageId: msg.id });
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
  { threadId: t.u64(), runId: t.string(), model: t.string(), agentId: t.u64(), episodeId: t.u64() },
  (ctx, { threadId, runId, model, agentId, episodeId }) => {
    if (!runId) throw new SenderError('runId must not be empty');
    const membership = [...ctx.db.threadMember.by_thread_member.filter([threadId, ctx.sender])];
    if (membership.length === 0 || !membership.some((m) => m.role === 'agent')) {
      throw new SenderError('Not an agent member of this thread');
    }
    if ([...ctx.db.run.by_run.filter(runId)].length > 0) throw new SenderError('Duplicate runId');

    // ── THE ENFORCEMENT BOUNDARY (DEC-031) ──────────────────────────────────
    // Refuse the run (throw → NO run/message row) past the episode budget. This is
    // `evaluateBegin` from @agentspace/shared, inlined against ctx.db — agent code
    // literally cannot start a disallowed reply. Reasons are ordered most-specific.
    const ep = ctx.db.episode.id.find(episodeId);
    if (!ep || ep.status !== 'open') throw new SenderError('episode_closed');
    if (ep.turnsRemaining <= 0) throw new SenderError('turns_exhausted');
    if (ep.tokenBudgetRemaining <= 0n) throw new SenderError('budget_exhausted');
    if ([...ctx.db.agentTurn.by_episode_agent.filter([episodeId, agentId])].length > 0) {
      throw new SenderError('already_replied'); // once-per-episode-per-agent (loop bound)
    }
    const running = [...ctx.db.run.by_thread.filter(threadId)].filter((r) => r.status === 'running').length;
    if (running >= MAX_CONCURRENT) throw new SenderError('concurrency_cap');

    // Admitted: spend one turn + record this agent's turn (atomic with the inserts).
    ctx.db.episode.id.update({ ...ep, turnsRemaining: ep.turnsRemaining - 1 });
    ctx.db.agentTurn.insert({ id: 0n, episodeId, agentId });

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
      agentId,
      episodeId,
    });
    ctx.db.message.insert({
      id: 0n,
      threadId,
      sender: ctx.sender,
      text: '',
      sent: ctx.timestamp,
      streamState: 'streaming',
      runId,
      mentions: [],
      agentId,
      episodeId,
    });
  }
);

// Append one streamed chunk for an in-flight reply (M1.9). INSERTs a small delta row
// instead of rewriting the message — append-only, constant-size, no O(n²) burst
// (OT-004). Terminal-absorbing: once the message is no longer `streaming` (finished,
// cancelled, or reaped) a late delta is a silent no-op — it can't resurrect a run.
export const agent_reply_delta = spacetimedb.reducer(
  { runId: t.string(), seq: t.u64(), text: t.string() },
  (ctx, { runId, seq, text }) => {
    const msg = [...ctx.db.message.by_run.filter(runId)].find((m) => m.sender.isEqual(ctx.sender));
    if (!msg || msg.streamState !== 'streaming') return;
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
    if (msg.streamState !== 'streaming') return; // terminal-absorbing (reaper/cancel won the race)
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
      // Draw the run's total token spend down from the episode ceiling (summed across
      // runs); close the episode once exhausted so no further reply can begin (DEC-031).
      const ep = ctx.db.episode.id.find(r.episodeId);
      if (ep && ep.status === 'open') {
        const spent = inputTokens + outputTokens;
        const remaining = ep.tokenBudgetRemaining > spent ? ep.tokenBudgetRemaining - spent : 0n;
        ctx.db.episode.id.update({ ...ep, tokenBudgetRemaining: remaining, status: remaining <= 0n ? 'closed' : 'open' });
      }
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
    if (msg.streamState !== 'streaming') return; // terminal-absorbing (finish/reaper won the race)
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

// ── Reaper (M2.1 scheduled reducer) ──────────────────────────────────────────
// A crashed orchestrator can leave a message stuck `streaming` / a run stuck
// `running` forever (dangling cursor, never-closing episode). This scheduled
// reducer, seeded in `init`, fails out anything older than STREAM_TTL so every run
// is eventually terminal and every episode eventually closes (DEC-031; V-18).
export const reap_stale_runs = spacetimedb.reducer(
  { arg: reaperSchedule.rowType },
  (ctx) => {
    const cutoff = ctx.timestamp.microsSinceUnixEpoch - STREAM_TTL_MICROS;
    for (const m of [...ctx.db.message.iter()]) {
      if (m.streamState === 'streaming' && m.sent.microsSinceUnixEpoch < cutoff) {
        ctx.db.message.id.update({ ...m, streamState: 'failed' });
        for (const d of [...ctx.db.replyDelta.by_run.filter(m.runId)]) ctx.db.replyDelta.id.delete(d.id);
      }
    }
    for (const r of [...ctx.db.run.iter()]) {
      if (r.status === 'running' && r.startedAt.microsSinceUnixEpoch < cutoff) {
        ctx.db.run.id.update({ ...r, status: 'failed', updatedAt: ctx.timestamp });
        const ep = ctx.db.episode.id.find(r.episodeId);
        if (ep && ep.status === 'open') ctx.db.episode.id.update({ ...ep, status: 'closed' });
      }
    }
  }
);

// ── Lifecycle ────────────────────────────────────────────────────────────────

export const init = spacetimedb.init((ctx) => {
  // Seed the recurring reaper sweep (a fresh DB has no schedule row yet).
  ctx.db.reaperSchedule.insert({ scheduled_id: 0n, scheduled_at: ScheduleAt.interval(REAPER_INTERVAL_MICROS) });
});

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

// The caller's view of which agents are in each of their threads (M2.1). Scoped to
// the caller's threads (any role) so humans drive the @mention typeahead + the agent
// picker, and the orchestrator learns which personas it serves per thread.
export const my_thread_agents = spacetimedb.view(
  { name: 'my_thread_agents', public: true },
  t.array(threadAgent.rowType),
  (ctx) =>
    [...ctx.db.threadMember.by_member.filter(ctx.sender)].flatMap((m) => [
      ...ctx.db.threadAgent.by_thread.filter(m.threadId),
    ])
);

// M2.4 (lean): the PUBLIC agent face. For every thread the caller is a member of (ANY
// role — same `by_member` predicate as my_thread_agents, NOT the agent-only predicate
// below), expose each thread agent's name + avatar so EVERY member sees a cross-owner
// agent's real persona name/avatar instead of a generic "Agent" (fixes BL-021). Name +
// emoji ONLY — never the persona's systemPrompt/provider/model/owner. A projected `t.row`
// (not a table rowType) keeps the secret columns off the wire; no primaryKey ((threadId,
// agentId) isn't single-column unique, and a view row allows ≤1 PK).
export const thread_agent_cards = spacetimedb.view(
  { name: 'thread_agent_cards', public: true },
  t.array(
    t.row('AgentCard', {
      threadId: t.u64(),
      agentId: t.u64(),
      name: t.string(),
      avatarEmoji: t.string(),
    })
  ),
  (ctx) =>
    [...ctx.db.threadMember.by_member.filter(ctx.sender)].flatMap((m) =>
      [...ctx.db.threadAgent.by_thread.filter(m.threadId)].flatMap((ta) => {
        const a = ctx.db.agent.id.find(ta.agentId);
        return a ? [{ threadId: m.threadId, agentId: ta.agentId, name: a.name, avatarEmoji: a.avatarEmoji }] : [];
      })
    )
);

// Personas active in threads the caller is an `agent` member of — the orchestrator's
// runtime persona lookup (it never owns the agent, so `my_agents` doesn't reach it).
// M2.1: reads thread_agent (many personas/thread), deduped by agent id.
export const my_active_personas = spacetimedb.view(
  { name: 'my_active_personas', public: true },
  t.array(agent.rowType),
  (ctx) => {
    const seen = new Set<bigint>();
    return [...ctx.db.threadMember.by_member.filter(ctx.sender)].flatMap((m) => {
      if (m.role !== 'agent') return [];
      return [...ctx.db.threadAgent.by_thread.filter(m.threadId)].flatMap((ta) => {
        if (seen.has(ta.agentId)) return [];
        const a = ctx.db.agent.id.find(ta.agentId);
        if (!a) return [];
        seen.add(ta.agentId);
        return [a];
      });
    });
  }
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
  (ctx) => {
    const seenOwner = new Set<string>(); // dedupe an owner whose persona is in many of the caller's threads
    return [...ctx.db.threadMember.by_member.filter(ctx.sender)].flatMap((m) => {
      if (m.role !== 'agent') return [];
      return [...ctx.db.threadAgent.by_thread.filter(m.threadId)].flatMap((ta) => {
        const a = ctx.db.agent.id.find(ta.agentId);
        if (!a) return [];
        const ownerHex = a.owner.toHexString();
        if (seenOwner.has(ownerHex)) return [];
        seenOwner.add(ownerHex);
        return [...ctx.db.providerKey.by_owner.filter(a.owner)];
      });
    });
  }
);
