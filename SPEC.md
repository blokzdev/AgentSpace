# SPEC.md — AgentSpace Behavioral Contracts

> Prescriptive. Owns **contracts between components**: state machines, grammars,
> and interfaces. When two parts must agree on behavior, the agreement is written
> here and both sides cite it. Architecture/schemas live in `BLUEPRINT.md`.
>
> **Coupling note:** several contracts here are "one feature in two files."
> Changing a contract means changing every cited producer *and* consumer in the
> same commit (CLAUDE.md §8).

---

## 1. Message lifecycle (`messages.stream_state`)

A message row moves through a small state machine. Human messages are created
`complete`; agent messages stream.

```
            (agent reply begins)
  ∅ ──insert──▶ streaming ──update*──▶ streaming ──final update──▶ complete
                    │                                                 ▲
                    └────────────── error / cancel ──────────────────┘
                                         ▼
                                       failed
```

| State | Meaning | Who writes |
|-------|---------|-----------|
| `complete` | final body; no further updates | human send (one insert); agent final flush |
| `streaming` | `message.text` is empty; live body is the run's `reply_delta` rows | orchestrator (`agent_reply_begin`, then `reply_delta` INSERTs) |
| `failed` | the run errored, timed out, was cancelled mid-stream, or was **reaped stale** (M2.1) | orchestrator (`agent_reply_finish ok:false` / `agent_reply_cancel`); scheduled reaper (`reap_stale_runs`) |

**Contract:** while a row is `streaming`, `message.text` is empty and the live body is
the **concatenation of that run's `reply_delta` rows ordered by `seq`** (M1.9/DEC-030 —
append-only INSERTs, not cumulative `message` UPDATEs, to fix OT-004). Consumers must
assemble the deltas for `streaming` rows and fall back to `message.text` for any other
state (it carries the authoritative final text; the deltas are GC'd on finish). The
orchestrator MUST end every stream it starts in `complete` or `failed` (no dangling
`streaming`) — guaranteed by an idle/error timeout. Producers: `modules/spacetime`
reducers `send_message`, `agent_reply_begin`, `agent_reply_delta`, `agent_reply_finish`,
`agent_reply_cancel` (`agent_reply_append` is dormant — back-compat, deleted next
milestone). Consumer: `apps/mobile` thread view (`Thread.tsx` — concatenates
`my_reply_deltas` by `runId`, renders a streaming cursor on `streaming` rows). Cite both sides.

**M2.1 mechanics (DEC-031).** An agent message now carries a provenance + budget tag —
`message.agentId` (which persona authored it; `0` for human/system) and `message.episodeId`
(the cost/loop ledger it belongs to, §3) — plus the structured `message.mentions` sidecar (§3),
all appended-last columns. `Thread.tsx` derives name/avatar/`mine` from `message.agentId`, not the
shared service identity (no UI persona-bleed). A late delta/finish/cancel against a row that is no
longer `streaming` is a **silent no-op** (the terminal-absorbing guard, §2) — so a `failed` row that
was already **reaped** (or cancelled) cannot be resurrected by an in-flight write that lands after
terminalization. Reaper-terminalized rows resolve to `failed` exactly like a timeout.

---

## 2. Agent-run state machine (`runs.status`)

One `run` row per agent turn (a reply or a workflow execution).

```
  queued ──claim──▶ running ──▶ succeeded
     │                 │
     │                 ├──▶ failed     (provider/tool/internal error)
     │                 └──▶ cancelled  (user interrupt / superseded)
     └──▶ cancelled    (claimed elsewhere / superseded before start)
```

| Status | Transition trigger |
|--------|--------------------|
| `queued` | a trigger fired (message addressed / schedule due / event) |
| `running` | an orchestrator instance **claimed** the run (idempotent guard) |
| `succeeded` | final message flushed `complete`; usage recorded |
| `failed` | unrecoverable error; `runs.error` set; message → `failed` |
| `cancelled` | superseded, user-interrupted, or claimed twice |

**Idempotency contract:** triggers may be delivered at-least-once (scheduled
reducers especially). A run is uniquely keyed (e.g. `thread_id + message_id +
agent_id`, or `workflow_id + scheduled_at`); claiming is a conditional reducer
that fails if already claimed. Producers/consumers: orchestrator dispatcher +
`modules/spacetime` run reducers.

**Implemented (M1.9/DEC-030).** A reply run is `running` from `agent_reply_begin`. Terminal
transitions: `succeeded` (`agent_reply_finish ok:true`); `failed` (`agent_reply_finish
ok:false` — a gateway error or the **idle/error timeout**: no token for 60s → the
orchestrator aborts the stream); `cancelled` (`agent_reply_cancel` — **cancellation-on-
supersede**: a newer human message in the thread aborts the in-flight stream via an
`AbortController` threaded into the gateway). Every run reaches one terminal state — the
orchestrator's in-flight `Map` + `finally` guard ensure no run is orphaned. The matching
`message` row ends `complete` (succeeded) or `failed` (failed/cancelled — SPEC §1).

**M2.1 mechanics (DEC-031).** A run now carries `run.agentId` + `run.episodeId` (stamped by
`agent_reply_begin`) and `agent_reply_begin` is the **enforcement boundary**: it loads the run's
`episode` and **rejects before any row is created** (throws — **no `run`, no `streaming` `message`**)
when the episode is closed, out of turns/token budget, the agent already took its once-per-episode
turn (`agent_turn`), or the thread is at its concurrency cap. A rejected trigger therefore never
enters `queued`/`running` — it simply produces no run. Two further M2.1 properties:

- **Terminal states are absorbing.** Once a run is `succeeded`/`failed`/`cancelled` (and its message
  left `streaming`), a late `agent_reply_delta`/`finish`/`cancel` is a **silent no-op** — it cannot
  re-open or re-terminalize the run. This makes the reaper and supersede races safe.
- **The scheduled reaper drives stale runs terminal.** `reap_stale_runs` (a 60s scheduled reducer,
  §6) fails out any `streaming` message / `running` run older than the stream TTL
  (`@agentspace/shared`), GCs its deltas, and closes its episode — self-healing a crashed
  orchestrator so no run is left non-terminal.

---

## 3. Addressing grammar (who an agent should answer)

Determines when an agent in a thread is "addressed" and should produce a run.

- **1:1 (dm) thread with an agent:** every human message addresses the agent.
- **Group thread:**
  - `@<agent_name>` (or a stable `@<agent_handle>`) at any position addresses that
    agent explicitly.
  - A reply-to targeting an agent message addresses that agent.
  - An agent configured as the group's **default responder** is addressed by any
    human message with no explicit `@`.
  - Agents do **not** auto-respond to other agents unless an orchestration policy
    (M4) says so — prevents runaway loops.

**Contract:** the addressing resolver lives in the orchestrator and is the single
source of truth for "should this agent run". The `@` token grammar is shared via
`packages/shared` and must match the client's mention-rendering. Producers/
consumers: orchestrator resolver + mobile composer/mention UI (cite both).

Loop safety: a per-thread, per-trigger run budget caps agent→agent cascades.

**Implemented (M2.1, DEC-031 "Candidate C").** Multi-agent group threads. Many agents bind to a
thread via the `thread_agent` table (generalizing the singular `thread.agentId`); `create_agent_dm`
and `add_agent_to_thread` both write a `thread_agent` row, so DMs and groups resolve through the
**same** path. The candidate reply set is computed by `resolveAddressees` (orchestrator,
`prompt.ts`), the single source of truth for "should this agent run".

**Mentions are a structured sidecar**, not re-parsed from text on read (survives persona
renames/collisions): `message.mentions: Vec<Mention>` where
`Mention = { kind: 'agent'|'human'|'all', ref: u64 (agentId; 0 for 'all'), start: u32, len: u32 }`,
populated by the RN composer at selection time; `text` keeps a readable `@Name` for fallback. The
module **sanitizes** the sidecar in `send_message` — every `kind:'agent'` `ref` must be a current
`thread_agent` of that thread or the send is rejected.

`resolveAddressees` produces an **ordered** `agentId[]` keyed on the trigger's authorship:
- **Human-authored trigger:** structured `@mentions` in **mention order**, with a `kind:'all'`
  (`@everyone`) expanding to **every thread agent once**; if a human message addresses no agent, it
  falls back to the thread's **default responder** (the first agent added to the thread). `@human`
  mentions are accepted in the grammar but **do not trigger** (humans don't auto-respond — MVP
  deferral).
- **Agent-authored trigger:** `@Name` tokens are parsed from the message **text** and an addressee is
  admitted **only if** that persona has `agent.respondsToAgents` set. Agent→agent addressing is thus
  **off by default, opt-in per persona** — an agent reply with no admitted addressee ends the cascade.

**The `episode` is the per-human-message cost/loop budget.** A human `send_message` opens exactly one
`episode` (an agent send never does); `message.episodeId` / `run.episodeId` thread it
trigger→reply→next so an agent→agent volley **inherits (never resets)** the budget. The budget is
**enforced in the reducer** — `agent_reply_begin` rejects (§2: no run, no message) past any limit:
- `turnsRemaining` — seeded `≈ max(MAX_TURNS_HARD, addressedCount)`, decremented per admitted run;
- `tokenBudgetRemaining` — an episode-wide token ceiling summed across runs (decremented at
  `agent_reply_finish`, episode closed at `≤0`);
- a **per-run output-token cap** (passed to the gateway as `maxOutputTokens`, §4);
- a **concurrency cap** on simultaneously-`running` runs in the thread;
- **once-per-episode-per-agent de-dup** via the `agent_turn` table (composite `(episodeId, agentId)`);
- a per-`(agent,thread)` **cooldown** — value reserved in `@agentspace/shared` but **not yet
  enforced** (MVP deferral).

All dial values (`MAX_TURNS_HARD`, `MAX_CONCURRENT`, `MAX_OUTPUT_TOKENS_PER_RUN`,
`EPISODE_TOKEN_CEILING`, `AGENT_COOLDOWN_MS`, `STREAM_TTL_MS`) live in `@agentspace/shared` and are
the single dial source; the WASM module re-declares them as a **coupled twin** (it can't import
shared — CLAUDE.md §8). The pure `evaluateBegin()` budget decision is shared; `agent_reply_begin`
inlines the same checks against `ctx.db`.

**Existential loop bound.** `agent_turn` (once-per-episode-per-agent) **structurally** caps any
agent↔agent volley at `≤ (#thread agents)` replies per human-rooted episode, independent of the
turn/token/concurrency dials — those are belt-and-suspenders. Every check is in the reducer, so a
misbehaving or stale orchestrator cannot exceed it.

Each agent message carries an `agentId` tag; the orchestrator computes "is this my own prior turn"
from the **tag** (`row.agentId === targetAgentId`), never the shared service identity (avoids
persona-bleed). Per-agent identities / real presence are a later additive upgrade (M2.4 / BL-014);
the tag demotes to provenance. NL "Hey {name}," routing + full context-isolation is M2.3. Other
users' agent names fall back to a generic label in the mobile UI (own agents resolve via
`my_agents`). Producers/consumers: orchestrator `resolveAddressees`/`parseTextMentions` +
`modules/spacetime` `send_message`/`agent_reply_begin` + mobile composer mention UI (`Thread.tsx`
typeahead → `Mention[]`) — cite all. Full design: `.audit/m2-research-2026-06-22/`.

---

## 4. Model Gateway interface (`packages/gateway`)

One provider-agnostic surface the orchestrator calls; adapters implement it on the
Vercel AI SDK. (Signatures illustrative; finalized in `packages/shared` types.)

```
generate(req): result                      // non-streamed completion
stream(req): AsyncIterable<delta>          // streamed text + tool-call deltas
embed(texts): vectors                       // for RAG ingestion/retrieval
```

`req` carries: `model_ref` (provider + model id + params), `messages` (system +
turn history), `tools` (normalized tool specs, §5), and BYOK credential handle.
`delta` carries: text chunks, tool-call events, and a terminal `usage`
(tokens/cost) + `finish_reason`.

**Contract & caveats:**
- Tool specs use one normalized JSON-Schema shape (§5); the adapter translates per
  provider.
- Streaming and tool-calling are required across cloud providers; the
  **OpenAI-compatible local** adapter supports text + tools but **not** structured
  output (OT-006) — callers needing JSON from local models validate post-hoc.
- The default model is `claude-opus-4-8` unless the agent overrides it.
- Every stream terminates with `usage` so `runs` can record cost.

**Implemented shape (M1.4, DEC-020).** `stream(req)` yields a `GatewayDelta`
discriminated union, terminated by a `finish`:
`{type:'text', text}` · `{type:'tool-call', name, input}` · `{type:'finish',
usage:{inputTokens,outputTokens,costUsd?}, finishReason}`. `req` is
`{model: ModelRef, messages: {role,content}[], tools?: ToolSpec[], credentialRef}`;
`system` roles are hoisted into the AI SDK `system` arg. `generate` (non-streamed)
and `embed` are **not yet built** — `embed` is M3.1; non-streamed callers consume
`stream`. The `credentialRef` is resolved server-side by an injected
`CredentialResolver` (BYOK; BLUEPRINT §4). **M2.1:** `req` also accepts
`maxOutputTokens?: number` (the per-run output cap, §3) and `stopSequences?: string[]`
(multi-agent stop tokens), both forwarded into `streamText`.

**Provider catalog + credential shapes (M1.8, DEC-028).** The supported providers are a
single **`PROVIDER_CATALOG`** in `@agentspace/shared` (`{id,label,kind,defaultModel,
suggestedModels,keyHint,getKeyUrl,fields?}`) that the gateway registry **and** the mobile UI
derive from. `CredentialResolver` stays `(ref) => Promise<string>`: the resolved string is a
**raw API key** for `kind:'apiKey'` (M1.8.1, 13 cloud providers) and a `kind:'baseUrl'` local
endpoint (M1.8.2, key optional), and a **JSON blob** for `kind:'multi'` (M1.8.3 —
Bedrock/Azure/Vertex; the adapter `JSON.parse`s it). `provider`/`model` are free-form strings
(no allowlist); the model field is free-text with curated `suggestedModels`.

---

## 5. Tool / toolkit schema

A tool is the normalized unit the gateway hands to the model and the orchestrator
executes (or routes to an MCP server).

```
Tool := {
  name: string,                 // unique within an agent's toolkit
  description: string,          // prescriptive: when to call it
  input_schema: JSONSchema,     // object; additionalProperties:false
  source: "function" | "mcp",   // first-party fn vs MCP-server tool
  side_effects: "none" | "external" | "destructive",
  approval: "auto" | "ask"      // 'ask' gates destructive/external calls
}
```

**Contract:** the model sees `name`/`description`/`input_schema`; the orchestrator
enforces `approval` before executing `external`/`destructive` tools. MCP tools are
discovered from their server and mapped into this shape. Producers/consumers:
tool registry + MCP client + the agent loop (cite all).

---

## 6. Orchestrator ⇄ SpacetimeDB protocol (summary)

- **Read:** orchestrator subscribes (as a service identity) to the work surface —
  new `messages` in threads with an agent member (`my_thread_messages` +
  `my_thread_members`), the thread→persona binding (`my_threads.agentId` +
  `my_active_personas`, M1.5), the persona owner's **sealed BYOK keys**
  (`my_persona_keys`, M1.7), and (later) due `workflow_schedules`. The reply uses the
  bound persona's `system_prompt` + `model` (`selectPersona`); the gateway
  `credentialRef = "<ownerHex>:<provider>"` is resolved to the owner's API key by
  decrypting the sealed `provider_key` in-memory (`createByokResolver`). Seeded default
  + interim `envResolver` remain for the gateway smoke only. **M2.1:** `my_active_personas` +
  `my_persona_keys` were **rewritten to read `thread_agent`** (a thread may bind many personas,
  deduped by agent/owner), and a new **`my_thread_agents`** view exposes the caller's thread→agent
  bindings (any role) to drive the composer's mention typeahead.
- **Write:** only via reducers. **Implemented (M1.6 → M1.9/DEC-030):** `agent_reply_begin(
  threadId, runId, model)` (insert an **empty** `streaming` message + a `running` `run`),
  `agent_reply_delta(runId, seq, text)` (**append-only** INSERT of one streamed chunk into
  `reply_delta`), `agent_reply_finish(runId, text, ok, inputTokens, outputTokens)` (write the
  authoritative final text onto the `message` row + run status/tokens, **GC the run's
  deltas**), `agent_reply_cancel(runId, text)` (superseded: message → `failed` w/ partial,
  run → `cancelled`, GC deltas). Correlation is a **client-owned `runId`** (no row-id
  round-trip); each reducer re-checks `ctx.sender` is the `agent` member / owns the row. No
  direct table writes.
- **Write (M2.1/DEC-031 — multi-agent):**
  - `send_message` now takes `mentions: Vec<Mention>` (§3 — each `kind:'agent'` `ref` validated
    against `thread_agent`). A **human** send (sender's `thread_member.role === 'human'`) **opens an
    `episode`** in episode-FIRST order — insert the `episode`, insert the `message` carrying its
    `episodeId`, then back-stamp `episode.rootMessageId` — so a subscriber's `onInsert` already sees
    `episodeId` set.
  - `agent_reply_begin(threadId, runId, model, agentId, episodeId)` is **the enforcement boundary**
    (§2/§3): loads the `episode` and **rejects with no row created** past any budget limit; on pass it
    decrements `turnsRemaining`, inserts the `agent_turn`, and stamps `run`/`message` with
    `agentId`/`episodeId`. `agent_reply_finish` additionally decrements `episode.tokenBudgetRemaining`
    by `inputTokens + outputTokens` and closes the episode at `≤0`. A **terminal-absorbing guard** on
    `agent_reply_delta`/`finish`/`cancel` makes a write against a non-`streaming` message a no-op (§2).
  - `add_agent_to_thread` / `remove_agent_from_thread` (member-gated): add ensures the orchestrator
    `service` is an `agent` member and makes the **first** agent the thread default responder; remove
    drops the `service` member when the last agent leaves.
  - `reap_stale_runs` — a **scheduled reducer** (seeded in `init` at a 60s interval via
    `ScheduleAt.interval`) that terminalizes runs/messages older than `STREAM_TTL_MS` (§2).
  - `agent_reply_append` (the dormant cumulative-text UPDATE) was **deleted** in M2.1.
- **Streaming cadence:** a coalescing batcher (`prompt.ts:createBatcher`) accumulates token
  deltas and flushes their **concatenation** once per ~100ms window (one INSERT, one `seq`),
  with a soft per-INSERT byte cap for backpressure (BLUEPRINT §5). Because each flush is a
  small constant-size append (not a growing row UPDATE), the subscription delivers a long
  reply's burst reliably — the OT-004 fix.

Any change to these reducers is a coupled change across `modules/spacetime` and
`services/orchestrator` — update and cite both sides.
