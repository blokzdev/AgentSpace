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
├── packages/stdb-bindings/ # generated STDB client     (layer: generated lib, BL-009)
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
- `packages/stdb-bindings` is **generated** from `modules/spacetime` (regenerated +
  synced on schema change) and **consumed as source** (BL-009). `services/orchestrator`
  imports it; `apps/mobile` vendors a copy as `module_bindings/`. It is the typed STDB
  client boundary — no hand edits.
- `services/orchestrator` may import `gateway`, `shared`, and `stdb-bindings`.
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
| `agent` | `id` (PK), `owner`, `name`, `system_prompt`, `provider`, `model`, `version`, `base_url` | View: `my_agents` (owner) + `my_active_personas` (agent member) | persona config **inline** (M1.5); `base_url`≠'' only for `provider='openai-compatible'` (local, M1.8.2) |
| `agent_versions` | (deferred — BL-013) | — | v1 inlines config + a `version` counter; immutable history/run-pinning is BL-013 |
| `service` | `id` (PK = 0), `identity`, `enc_pub_key` | View: `service_info` (public) | singleton: orchestrator identity (M1.5) + its NaCl **box public key** so clients seal BYOK keys to it (M1.7) |
| `threads` | `id` (PK), `kind` (dm\|group), `title`, `created_by`, `agent_id` | View: members only | `agent_id`≠0 → an agent DM bound to that persona (M1.5) |
| `thread_members` | `(thread_id, member_ref)` , `role` (human\|agent), `member_kind` | View: members only | membership is the authz spine |
| `messages` | `id` (PK), `thread_id`, `sender`, `text`, `stream_state`, `sent`, `run_id` | View: thread members | streamed via UPDATE (§5); `run_id`=`''` for humans (M1.6) |
| `runs` | `id` (PK), `run_id` (client key), `thread_id`, `agent`, `model`, `status`, `input_tokens`, `output_tokens`, `started_at`, `updated_at` | private (orchestrator-owned) | one agent turn; keyed by client `run_id` (M1.6). `cost`/`error` deferred |
| `attachments` | `id` (PK), `message_id`, `kind`, `uri`, `meta` | View: thread members | blobs out-of-band |
| `presence` | `identity`/`agent_id`, `state`, `typing_in_thread` | View: co-members | humans + agents |
| `provider_key` | `id` (PK), `owner`, `provider`, `sealed`, `created_at`, `updated_at` | View: `my_provider_keys` (owner) + `my_persona_keys` (agent member) | per-user BYOK (M1.7). `sealed` = **ciphertext** (box-sealed to the orchestrator's pubkey); raw key never in STDB. Durable Postgres/KMS backing = BL-011 |
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
- **status (M1.4 → M1.8, DEC-020/DEC-028):** `createModelGateway({ resolveCredential,
  providers? })` implements **streaming + tool-calling** over a **provider registry**
  derived from the shared **`PROVIDER_CATALOG`** (the single source for the gateway + the
  mobile UI). **M1.8.1:** all **13 single-API-key cloud providers** are live (anthropic,
  openai, google, mistral, cohere, groq, xai, deepseek, perplexity, togetherai, fireworks,
  deepinfra, cerebras). **M1.8.2:** `openai-compatible` (local — Ollama/vLLM/LM Studio) is
  **live** via a per-agent `agent.base_url` + `createOpenAICompatible` (key optional; the
  orchestrator resolves a keyless local provider to `''`). **M1.8.3:** multi-credential
  **Bedrock/Azure/Vertex** are **live** — the `ProviderFactory` parses a **sealed-JSON**
  credential (the provider's catalog `fields`) into the SDK settings; **no `provider_key`
  schema change**. So the gateway spans **16 providers** from one catalog (per-key acquisition
  in `PROVIDERS.md`). `ProviderFactory` is `(credential, model, opts?: { baseUrl? })`. `embed`
  is deferred to M3.1; `streamText` `fullStream` normalizes to `GatewayDelta`.

### BYOK key custody

The gateway resolves a request's opaque `credentialRef` via an injected
**`CredentialResolver`** (the orchestrator supplies it — custody stays in the service
layer); keys are decrypted **in-memory at call time**, never sent to the device,
never logged. The gateway already ships an AES-256-GCM **`EncryptedKeyStore`**
(seal/open under a KEK) for sealing keys at rest.

**Per-user BYOK (M1.7, implemented — Option A: client-encrypt, ciphertext via STDB):**
1. The orchestrator holds a **NaCl box keypair** (Curve25519; secret key persisted to a
   file like its token) and publishes its **public key** via `service.enc_pub_key`
   (`service_info` view).
2. The app **seals** the user's provider key to that public key —
   `base64(ephPub32 ‖ nonce24 ‖ box(rawKey))` — and stores only that **ciphertext** in a
   `provider_key` row (`set_provider_key`). The raw key never leaves the device
   unsealed and **never appears in STDB**.
3. The orchestrator's `CredentialResolver` (`createByokResolver`) takes
   `credentialRef = "<ownerHex>:<provider>"` (built from the persona's `owner` +
   `provider`), finds the sealed blob in `my_persona_keys`, **opens it in-memory** with
   its secret key, and hands the raw key to the gateway. Missing key → a friendly
   in-chat error.

**Interim (dev only):** the gateway smoke (V-6) + a fallback still use `envResolver`
(`<PROVIDER>_API_KEY`); the orchestrator no longer does. Durable Postgres/KMS backing
+ keypair/KEK rotation stay **BL-011**. (Mobile seal + orchestrator open are coupled —
`apps/mobile/src/byok.ts` ↔ `services/orchestrator/src/byok.ts`.)

### 4.1 Deployment topology & hosting (v1: central always-on — DEC-027)

**Topology.** The app and the orchestrator are **two independent clients of the same
Maincloud database** — they never talk directly, only *through* SpacetimeDB. The orchestrator
connects **out** to Maincloud exactly like the app does (it is not a local DB):

```
   📱 app  ──┐                                  ┌── 🖥️ orchestrator (Node)
             ▼   wss://maincloud.spacetimedb.com ▼   subscribe Views · call reducers
            ☁️  Maincloud STDB (agentspace-hpm58)  ──► 🤖 provider (BYOK)  · the "thinking"
```

A reply round-trips through the DB: human message → DB → orchestrator (subscribed) sees it →
LLM call → streamed `agent_reply_*` UPDATEs → DB → app (subscribed) renders it live.

**v1 = one small, *always-on* central service.** The orchestrator is a **persistent, stateful,
long-running subscriber** (holds an open WS + in-memory keypair/in-flight `Set`/~50ms batchers
+ a file-persisted token; Node-only — `node:fs`/`node:os`/AI-SDK/`tsx`), and the module is
central by design (singleton `service`, one `agent`-member identity — DEC-022; per-agent
identities = BL-014). So v1 hosts it as a single always-on process. **"Always-on" ≠ expensive:**
it is mostly idle on a socket (the heavy cost is the user's own BYOK provider), so a **free-tier
container** (Fly/Railway/Render/micro-VM) suffices. This is the only model that delivers
**always-available agents, group replies, and scheduled workflows** (an agent must answer when
your phone is asleep / answer *other* people / fire at 9am). Needs OT-007 (real service
identity) + BL-011 (durable key backing); the **specific host stays OT-005**.

**The mode spectrum** (product surface = the **Android app**, DEC-005; there is **no "Windows
app"** — Windows is a dev machine). The real axis is **always-on vs foreground-only**, not "PC
vs phone":

| Mode | Hosts where | Always-on? | Inference | Status |
|------|-------------|-----------|-----------|--------|
| **Central** (v1) | our tiny cloud container | ✅ yes | cloud BYOK | **now** |
| **Desktop self-host** | user's own PC/GPU | ✅ while PC on | local Ollama (gateway `openai-compatible`) | BL-018 |
| **Phone on-device** | the **same** Android device (`nodejs-mobile`/Hermes) | ❌ foreground-only | local SLM (BL-001) | BL-017 |
| **Serverless** | central, scale-to-zero functions | event-driven | cloud BYOK | BL-019 |

**Phone on-device** is genuinely "everything on one device" (no separate PC) and is
**capability/tier-gated** (a quantized SLM only runs on capable phones) **with graceful
fallback to cloud/central**. Its **defining limiter is Android background execution, not
compute** — Doze / App-Standby / OEM battery-killers suspend background app processes, and a
foreground service is battery-hungry/OEM-fragile — so it is realistically **foreground-only**
(a private single-device assistant you chat with while the app is open), never the
always-available backbone. **Serverless** (incl. Vercel) is the opposite of today's persistent
subscriber and only becomes viable after a re-architecture to **stateless per-turn functions**
triggered by a SpacetimeDB push/webhook (DEC-008 flags `procedures` HTTP as unstable). No
GitHub Secrets are needed today; future **deployment** secrets appear only when hosted (§8.1 /
OT-005/OT-007/BL-011).

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

### 8.1 Credentials & secrets model (DEC-026)

SpacetimeDB is **identity-based, not key-based** — there is no "SpacetimeDB API key."
Every actor authenticates with an **identity token**, and none of those tokens is a
committed secret. This is deliberate (DEC-026): per-actor, refreshable, reducer/View-
scoped identities are strictly better than a shared static API key.

| Actor | Authenticates with | Where the credential lives | Secret? |
|-------|--------------------|----------------------------|---------|
| **Mobile user** | SpacetimeAuth OIDC **id token** (per-login, code+PKCE) | on-device; the only config is the **non-secret** `EXPO_PUBLIC_SPACETIMEAUTH_CLIENT_ID` (inlined into the bundle by design) | no |
| **Orchestrator** | self-issued **anonymous identity token** (DEC-017) | cached to a local file (`spacetime.ts:defaultTokenFile`); never in `.env`/CI. Real service-account grant = **OT-007** | no |
| **Module publish (dev)** | the developer's `spacetime login` session | `~/.config/spacetime/` — a CLI session, not an app secret | no |

**Nothing SpacetimeDB-related goes in `.env` or GitHub Secrets.** The mobile host/
db-name are non-secret `EXPO_PUBLIC_*` values; CI runs `lint·typecheck·build·test` and
**never connects to a live DB**, so it needs no token. The **only** real secrets in the
product are **per-user BYOK provider keys** — entered in-app, NaCl-sealed, stored as
ciphertext only in STDB (§4 / DEC-025) — plus the *optional* dev `ANTHROPIC_API_KEY`
(local gateway smoke only — `SETUP.md` S-4, never committed). Future **deployment**
secrets appear only when the orchestrator is hosted (OT-005): a real service-account
credential (OT-007) and durable KEK/box-keypair backing (BL-011).

---

## 9. Known risks (live in `MEMORY.md` Open Threads)

- **OT-003 [critical]** — RN ↔ SpacetimeDB TS-SDK compatibility (browser/Node-only
  officially). Gates the client layer; M0.2 spike. Fallback: WS/REST bridge,
  polyfill, or alternative transport.
- **OT-004** — streaming write cadence/cost at concurrency.
- **OT-005** — hosting + Postgres provider choices.
- **OT-006** — local-model structured-output gap.
