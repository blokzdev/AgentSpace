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
| `streaming` | body is partial; more updates coming | orchestrator (batched UPDATEs) |
| `failed` | the run errored or was cancelled mid-stream | orchestrator |

**Contract:** consumers (the mobile client) must render `streaming` bodies as
live/partial and only treat `complete` as final. The orchestrator MUST end every
stream it starts in `complete` or `failed` (no dangling `streaming`). Producers:
`modules/spacetime` reducers `send_message`, `agent_reply_begin`,
`agent_reply_append`, `agent_reply_finish`. Consumer: `apps/mobile` thread view
(renders a streaming cursor on `streaming` rows). Cite both sides.

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
- **Write:** only via reducers. **Implemented (M1.6):** `agent_reply_begin(threadId,
  runId, model)` (insert a `streaming` message + a `running` `run`),
  `agent_reply_append(runId, text)` (UPDATE cumulative text), `agent_reply_finish(
  runId, text, ok, inputTokens, outputTokens)` (final message state + run
  status/tokens). Correlation is a **client-owned `runId`** (no row-id round-trip);
  each reducer re-checks `ctx.sender` is the `agent` member / owns the row. No direct
  table writes.
- **Streaming cadence:** batched UPDATEs, ~50ms windows (BLUEPRINT §5) — a coalescing
  batcher flushes the latest cumulative text.

Any change to these reducers is a coupled change across `modules/spacetime` and
`services/orchestrator` — update and cite both sides.
