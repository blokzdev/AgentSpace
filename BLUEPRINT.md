# BLUEPRINT.md — AgentSpace Architecture & Data Model

> Prescriptive. Owns **architecture and the data model**: the module graph,
> schemas, and dependency rules. When you add a module or touch the data model,
> conform to this. Behavioral contracts (state machines, protocols) live in
> `SPEC.md`. Rationale lives in `MEMORY.md` (DEC-IDs).
>
> Some figures below come from session research and are tagged
> *(reported — verify)*; they are decision-shaping, not load-bearing facts.

---

## 1. System overview

Four cooperating parts plus shared data stores:

```
┌──────────────────────────┐    WebSocket (subscribe Views + call reducers)
│  apps/mobile (RN + Expo) │◀──────────────────────────────────────────────┐
│  SpacetimeDB TS client   │                                                │
└──────────────────────────┘                                                ▼
                                  ┌──────────────────────────────────────────────┐
                                  │  modules/spacetime  (TypeScript module)       │
                                  │  source of truth for chat state               │
                                  │  tables · reducers · Views · scheduled reducers│
                                  │  OIDC auth (ctx.sender = Identity)             │
                                  └──────────────────────────────────────────────┘
                                     ▲ subscribe(work)         │ reducers(write)
                                     │  (OIDC service identity) ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  services/orchestrator  (Node/TS; trusted STDB client)                            │
│   detect agent-addressed messages & triggers → assemble context → run → stream    │
│   ┌───────────────────┐ ┌───────────────┐ ┌────────────┐ ┌─────────────────────┐ │
│   │ packages/gateway  │ │ knowledge/RAG │ │ tool layer │ │ workflow engine     │ │
│   │ (Vercel AI SDK)   │ │ (pgvector)    │ │ (MCP+funcs)│ │ (msg/sched/event)   │ │
│   └─────────┬─────────┘ └───────┬───────┘ └─────┬──────┘ └─────────────────────┘ │
└─────────────┼───────────────────┼───────────────┼─────────────────────────────────┘
              ▼                    ▼               ▼
   Providers: Anthropic /   Postgres + pgvector   MCP servers /
   Google / OpenAI /        (embeddings, chunks)   external APIs
   OpenAI-compatible local
   (keys from encrypted BYOK store — never in STDB or on device)
```

**Why this shape (DEC-008):** SpacetimeDB reducers are deterministic with no
network I/O, so model inference cannot run in the DB. The orchestrator is a
*trusted client* that does the thinking and writes results back as ordinary rows;
all clients see updates through their subscriptions.

---

## 2. Module / package graph (monorepo)

```
AgentSpace/
├── apps/mobile/            # Expo (React Native) client (layer: client)
├── services/orchestrator/  # Node/TS agent runtime    (layer: service)
├── packages/gateway/       # Model Gateway (AI SDK)    (layer: lib)
├── packages/shared/        # shared types/contracts    (layer: lib, lowest)
├── modules/spacetime/      # SpacetimeDB TS module      (layer: module)
└── examples/chat-react-ts/ # reference only (not imported by product code)
```

Tooling: **pnpm workspaces + Turborepo**, TypeScript strict everywhere.

### One-way dependency rules (lower may not import higher)

```
shared  ◀── gateway ◀── orchestrator
shared  ◀── apps/mobile
shared  ◀── modules/spacetime
```

- `packages/shared` is the lowest layer (pure types/contracts/enums); it imports
  nothing internal.
- `packages/gateway` depends only on `shared`. It must not import orchestrator,
  app, or module code.
- `services/orchestrator` may import `gateway` and `shared`.
- `apps/mobile` imports `shared` and the **generated** `module_bindings` only.
- `modules/spacetime` imports `shared` (for shared enums/string constants) and the
  SpacetimeDB server SDK; it imports no app/service/gateway code.
- `examples/` is a reference surface — product code never imports it.

---

## 3. Data model (SpacetimeDB tables)

Conventions: tables are **private by default**; clients read via **per-user
`ViewContext` Views** (DEC-007). Writes always go through reducers; `ctx.sender`
is the only trusted identity. `id` columns are explicit (do not rely on autoinc
ordering — use timestamps/sequences). Vectors live in Postgres, not STDB.

| Table | Key fields | Visibility | Notes |
|-------|-----------|-----------|-------|
| `users` | `identity` (PK), `display_name`, `avatar`, `online` | View: self + co-members | one row per human Identity |
| `agents` | `id` (PK), `owner`, `name`, `avatar`, `current_version` | View: owner (+ members of threads it's in) | persona header |
| `agent_versions` | `id` (PK), `agent_id`, `version`, `system_prompt`, `model_ref`, `params` | private (orchestrator + owner) | immutable; pinned per run |
| `threads` | `id` (PK), `kind` (dm\|group), `title`, `created_by` | View: members only | |
| `thread_members` | `(thread_id, member_ref)` , `role` (human\|agent), `member_kind` | View: members only | membership is the authz spine |
| `messages` | `id` (PK), `thread_id`, `sender_ref`, `body`, `stream_state`, `sent`, `updated` | View: thread members | streamed via UPDATE (see §5) |
| `runs` | `id` (PK), `thread_id`, `agent_id`, `message_id`, `status`, `model_ref`, `tokens`, `cost`, `error` | View: thread members (subset) | one agent turn |
| `attachments` | `id` (PK), `message_id`, `kind`, `uri`, `meta` | View: thread members | blobs out-of-band |
| `presence` | `identity`/`agent_id`, `state`, `typing_in_thread` | View: co-members | humans + agents |
| `provider_keys` | `id` (PK), `owner`, `provider`, `secret_ref`, `label` | private; never raw key | **reference** to the encrypted store |
| `agent_toolkits` | `(agent_id, toolkit_id)`, `config_ref` | private | per-agent tool scoping |
| `workflows` | `id` (PK), `agent_id`, `trigger`, `definition_ref`, `enabled` | View: owner | |
| `workflow_schedules` | `scheduled_id` (PK), `scheduled_at`, `workflow_id` | scheduled table | drives scheduled reducer |

Knowledge bases are **not** STDB tables: `knowledge_docs` and `knowledge_chunks`
(with embeddings) live in **Postgres + pgvector** (DEC-010), referenced from
`agents` by id. Rationale: STDB is the realtime chat source of truth; vector
search and large docs belong in Postgres.

### Access-control rule

A client may only read a row it is *entitled* to via a View bound to
`ctx.sender`. Threads/messages/members are gated by membership in
`thread_members`. **Never** mark a chat-content table `public` and rely on
client-side filtering. Verify in M0.3 that a hostile client cannot subscribe past
a View. *(RLS exists but is experimental — prefer Views.)*

---

## 4. The Agent Orchestrator

A self-hosted Node/TS service (`services/orchestrator`). Responsibilities:

1. **Connect** to SpacetimeDB as a trusted client using an **OIDC client-
   credentials service identity** (stable `Identity`; DEC-008). Subscribe to the
   "agent work" surface (new messages in threads an agent belongs to; due
   `workflow_schedules`).
2. **Dispatch**: when an agent is addressed (§SPEC addressing) or a workflow
   fires, create/claim a `run` (idempotent — scheduled reducers are at-least-once;
   guard with a unique key).
3. **Assemble context**: thread history + pinned `agent_version` (system prompt,
   model, params) + RAG retrieval (pgvector) + tool specs (MCP + functions).
4. **Run** the loop via `packages/gateway`, resolving the **BYOK** key from the
   encrypted store (decrypt in-memory only).
5. **Stream** the reply back into `messages` via **batched row UPDATEs** (~50ms
   windows; DEC-008/OT-004), flipping `stream_state` to `complete` at the end;
   finalize the `run` (tokens, cost, status).

The orchestrator is **stateless per request** (state lives in STDB + Postgres),
so it can scale horizontally; run-claiming prevents double-processing.

### packages/gateway (Model Gateway)

Thin provider-agnostic layer on the **Vercel AI SDK**. Exposes one internal
interface for: streamed text, tool/function calling, structured output, and a
multi-step agent loop. Providers: Anthropic, Google, OpenAI, Mistral, and an
OpenAI-compatible adapter for local runtimes (Ollama/vLLM/LM Studio).

- Default Claude model id: `claude-opus-4-8` (most capable); per-agent override.
- **Local caveat (OT-006):** OpenAI-compatible local providers support text +
  tool calls but *not* the SDK's structured-output mode — local agents use
  post-hoc JSON validation/repair.
- **Tool reliability varies by provider** *(reported — verify)*; prefer Claude for
  complex tool chains, add validation/retry for others.

### BYOK key custody

Per-user provider keys are encrypted at rest (AES-256-GCM via a managed KMS),
stored in the secret store (Postgres table or KMS), referenced from
`provider_keys.secret_ref`. Keys are decrypted **in-memory in the orchestrator**
at call time, never written to STDB, never sent to the device, never logged.

---

## 5. Streaming model

Agent tokens arrive ~10–100ms apart from the provider. The orchestrator buffers
and flushes to STDB on a sliding window: **flush when ≥N tokens or every ~50ms**,
whichever first, by UPDATEing the in-progress `message` row (`stream_state =
streaming`), then a final UPDATE sets `complete`. Event tables are *not* used for
streaming (their rows are transient). Clients render partial `body` live via the
subscription. Cadence/cost to be validated (OT-004).

---

## 6. Knowledge / RAG (Postgres + pgvector)

Ingest → chunk → embed (AI SDK `embed`/`embedMany`) → store chunks + vectors in
Postgres (HNSW index). Retrieval: top-k by cosine distance, filtered to the
agent's knowledge base, injected into context with citations. pgvector is the
default for our Node/TS + Postgres stack and scales well below high QPS
*(reported — verify)*; revisit a dedicated vector DB only under load.

---

## 7. Tooling / MCP

Agent "API toolkits" are exposed primarily through **MCP** (first-class in the AI
SDK): the orchestrator creates an MCP client per configured server, discovers its
tools, and offers them to the model loop, plus first-party function tools.
Destructive/external tool calls are gated by an approval policy. Per-agent toolkit
scoping lives in `agent_toolkits`.

---

## 8. Auth & identity

SpacetimeDB OIDC. Humans authenticate via the chosen provider (SpacetimeAuth
built-in vs Auth0/Clerk — decided in M0.5); the orchestrator authenticates via a
separate **service-account** OIDC identity. `ctx.sender` is the only trusted
identity inside reducers; never trust identity passed as an argument.

---

## 9. Known risks (live in `MEMORY.md` Open Threads)

- **OT-003 [critical]** — RN ↔ SpacetimeDB TS-SDK compatibility (browser/Node-only
  officially). Gates the client layer; M0.2 spike. Fallback: WS/REST bridge,
  polyfill, or alternative transport.
- **OT-004** — streaming write cadence/cost at concurrency.
- **OT-005** — hosting + Postgres provider choices.
- **OT-006** — local-model structured-output gap.
