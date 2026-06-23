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
| `failed` | the run errored, timed out, or was cancelled mid-stream | orchestrator (`agent_reply_finish ok:false` / `agent_reply_cancel`) |

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
`CredentialResolver` (BYOK; BLUEPRINT §4).

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
  + interim `envResolver` remain for the gateway smoke only.
- **Write:** only via reducers. **Implemented (M1.6 → M1.9/DEC-030):** `agent_reply_begin(
  threadId, runId, model)` (insert an **empty** `streaming` message + a `running` `run`),
  `agent_reply_delta(runId, seq, text)` (**append-only** INSERT of one streamed chunk into
  `reply_delta`), `agent_reply_finish(runId, text, ok, inputTokens, outputTokens)` (write the
  authoritative final text onto the `message` row + run status/tokens, **GC the run's
  deltas**), `agent_reply_cancel(runId, text)` (superseded: message → `failed` w/ partial,
  run → `cancelled`, GC deltas). Correlation is a **client-owned `runId`** (no row-id
  round-trip); each reducer re-checks `ctx.sender` is the `agent` member / owns the row. No
  direct table writes. (`agent_reply_append` — the old cumulative-text UPDATE — is retained
  dormant for back-compat, deleted next milestone.)
- **Streaming cadence:** a coalescing batcher (`prompt.ts:createBatcher`) accumulates token
  deltas and flushes their **concatenation** once per ~100ms window (one INSERT, one `seq`),
  with a soft per-INSERT byte cap for backpressure (BLUEPRINT §5). Because each flush is a
  small constant-size append (not a growing row UPDATE), the subscription delivers a long
  reply's burst reliably — the OT-004 fix.

Any change to these reducers is a coupled change across `modules/spacetime` and
`services/orchestrator` — update and cite both sides.
