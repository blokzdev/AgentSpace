# MEMORY.md — AgentSpace Durable Memory Ledger

> The continuity ledger. The dev container is ephemeral; this committed file is
> how context survives across sessions. **Read this first every session.**
> Governed by the Memory Protocol in `CLAUDE.md` §3.
>
> - **Snapshot** & **Open Threads** are mutated in place (current state).
> - **Decision Log** & **Session Journal** are append-only (history is the value).

---

## Snapshot — where we are right now

*Last refreshed: 2026-06-13.*

Brief received; **planning ratified**. AgentSpace is a mobile (Android-first)
messaging ecosystem where humans and user-built AI agents converse in real time —
"WhatsApp + Discord for configurable AI agents." A comprehensive v1 plan is
approved (see `ROADMAP.md`), and the full doc suite (PRD/SPEC/BLUEPRINT/BACKLOG)
is authored. We are at the start of **M0 — Foundations & spikes**: no product
code yet beyond the reference app.

- **Active branch:** `claude/agentspace-m0-docs` (docs-foundation PR).
- **Stack decided:** RN + Expo client · SpacetimeDB (TypeScript module) realtime
  core · self-hosted Node/TS Agent Orchestrator with a Vercel-AI-SDK Model
  Gateway (multi-model BYOK) · Postgres + pgvector for RAG.
- **Top risk:** React Native ↔ SpacetimeDB TS-SDK compatibility is unvalidated
  (OT-003) — the #1 M0 spike.
- **Next:** land the docs PR → scaffold the monorepo + CI → run the three M0
  spikes (RN↔STDB, module/access-control, orchestrator-as-trusted-client).

---

## North Star — the durable vision

> **AgentSpace is the mobile home where humans and the AI agents they build live
> in the same conversation — provider-agnostic, BYOK, real-time, and
> orchestratable.**

It is "WhatsApp + Discord, but for highly configurable AI agents." Users
architect custom personas from scratch (identity/résumé, knowledge bases,
API-driven toolkits, event-triggered workflow loops), deploy them as contacts,
and converse with them — alongside other humans — in 1:1 chats and group threads
where humans and multi-agent teams collaborate in real time. The moat is the
*combination*: a polished real-time multiplayer chat substrate (SpacetimeDB)
fused with a provider-neutral, bring-your-own-key agent platform. *(Ratified from
the founder's brief, 2026-06-13 — see DEC-004.)*

---

## Decision Log (append-only)

> Never edit a past entry. Supersede with a new entry that cites the old ID.

### DEC-001 — Adopt the seven-doc harness, adapted, with a Memory layer
*2026-06-13.* Adopted the documentation architecture from the Vibecoding
harness reference (PRD / SPEC / BLUEPRINT / ROADMAP / BACKLOG / CLAUDE) and
added `MEMORY.md` as a first-class continuity doc. Rationale: sessions run in
ephemeral containers, so durable memory must be an explicit, committed artifact
— not implicit in chat history. Vision docs are created lazily, when they have
something to own, starting with ROADMAP after the founder's brief.

### DEC-002 — Memory lives in two files with a read/write protocol
*2026-06-13.* `CLAUDE.md` holds the operating manual + code reality and defines
the **Memory Protocol**; `MEMORY.md` is the storage (snapshot, decisions,
journal, open threads, glossary). Decision Log and Session Journal are
append-only; Snapshot and Open Threads mutate in place. Rationale: separates
the *rules* of memory (manual) from the *contents* of memory (ledger), keeping
one source of truth per concept.

### DEC-003 — SpacetimeDB stack installed; chat template as reference surface
*2026-06-13.* Installed SpacetimeDB CLI `2.5.0` and scaffolded the
`chat-react-ts` template into `examples/chat-react-ts/` (per the founder's
screenshot). Treated as a learning/reference surface, not product code. Used
`spacetime init --template` (one-shot scaffold) rather than `spacetime dev`
(long-running dev server) so the setup is committable without holding a process
open. Rationale: get the founder a working, buildable reference of the chosen
realtime stack before product direction is set.

### DEC-004 — North Star ratified: real-time home for humans + their AI agents
*2026-06-13.* Founder's brief sets AgentSpace as an Android-first messaging
ecosystem ("WhatsApp + Discord for configurable AI agents"): build personas
(résumé, knowledge bases, API toolkits, workflow loops), deploy them as contacts,
and chat 1:1 and in groups where humans and multi-agent teams collaborate live.
North Star recorded above. Resolves OT-001.

### DEC-005 — Mobile client is React Native + Expo (Android first)
*2026-06-13.* Cross-platform, reuses our React+TS stack and the SpacetimeDB TS
client SDK, fastest path to a polished real-time mobile app. iOS deferred to
BACKLOG. (Carries the RN↔STDB compatibility risk — OT-003.)

### DEC-006 — Multi-model BYOK via a self-hosted orchestrator + Vercel-AI-SDK gateway
*2026-06-13.* Agents are provider-neutral: each persona picks a model, routed by
an in-process **Model Gateway** built on the Vercel AI SDK (Anthropic, Google,
OpenAI, …) inside a self-hosted Node/TS **Agent Orchestrator**. Users bring their
own keys (encrypted at rest, used server-side only). Claude Managed Agents is
*not* the core — it is Anthropic-hosted and Claude-only, which would break
provider neutrality; we still use Claude's strengths via its adapter. Rationale:
provider independence is the platform moat. Resolves the agent-runtime question.

### DEC-007 — SpacetimeDB module in TypeScript; access control via Views
*2026-06-13.* Per research (treat benchmark specifics as reported-not-verified),
TS modules are production-ready in 2.5 and match/exceed Rust throughput, so we
build the module in **TypeScript** for velocity and stack cohesion. Access
control uses **private tables + per-user `ViewContext` Views + membership-scoped
subscriptions** (the docs recommend Views over the experimental RLS). Supersedes
the open question in OT-002. Revisit Rust only under proven perf pressure.

### DEC-008 — Agent inference stays in the external orchestrator (not in the DB)
*2026-06-13.* SpacetimeDB reducers are deterministic with no network I/O; the
unstable `procedures` HTTP feature would block the DB on LLM latency. So all
model calls live in the external orchestrator, which connects as a **trusted
client via an OIDC client-credentials service account**, subscribes to new
messages/triggers, and writes replies via reducers. Streaming tokens are relayed
by **batched row UPDATEs** (~50ms windows), not event tables.

### DEC-009 — Local models in v1 via OpenAI-compatible; on-device deferred
*2026-06-13.* Self-hosted local models (Ollama/vLLM/LM Studio) are supported in
v1 through the gateway's OpenAI-compatible path (note: structured-output mode is
unavailable there — use post-hoc validation). True on-device/edge phone inference
is its own post-v1 milestone (BACKLOG).

### DEC-010 — RAG on Postgres + pgvector; toolkits via MCP
*2026-06-13.* Knowledge bases use Postgres + **pgvector** (the 2026 default for a
Node/TS + Postgres stack; Supabase-compatible), with embeddings via the AI SDK.
Agent "API toolkits" are exposed primarily as **MCP servers** (first-class in the
AI SDK) plus custom function tools. Hosting (Maincloud Pro vs self-host) and the
exact Postgres host are deferred to implementation milestones (OT-005).

### DEC-011 — Full-ecosystem v1, two parallel tracks
*2026-06-13.* v1 targets the complete vision (personas + knowledge + toolkits +
workflows + multi-agent groups), built as two interlocking tracks from M0:
**A = Realtime** and **B = Agent/AI**. The AI layer is foundational, not a
bolt-on. Sequencing lives in `ROADMAP.md`.

---

## Session Journal (append-only)

### 2026-06-13 — Project bootstrap
- Initialized repo on branch `claude/agentspace-initial-setup-w8rx3n` (was empty).
- Installed SpacetimeDB CLI `2.5.0` (`~/.local/bin/spacetime`).
- Scaffolded `examples/chat-react-ts` from the `chat-react-ts` template;
  installed client + server-module deps; `npm run build` passes.
- Authored the operating harness: root `CLAUDE.md` (manual + Memory Protocol),
  this `MEMORY.md` ledger, and a root `.gitignore`.
- **Next:** founder shares the AgentSpace brief → set North Star → create
  `ROADMAP.md` (M0) and, as needed, PRD/SPEC/BLUEPRINT.

### 2026-06-13 — Brief, plan, and doc suite
- Founder delivered the AgentSpace brief; ran plan-mode clarifications (mobile
  stack, agent runtime, local/edge timing, milestone sequencing, v1 ambition).
- Two research spikes (SpacetimeDB production-readiness; multi-model gateway +
  RAG + RN compatibility) returned and informed the architecture — notably the
  unvalidated RN↔STDB risk (OT-003).
- Ratified decisions DEC-004…DEC-011; set the North Star.
- Authored the doc suite: `ROADMAP.md`, `PRD.md`, `BLUEPRINT.md`, `SPEC.md`,
  `BACKLOG.md`; updated `CLAUDE.md` doc-graph + code-reality.
- **Next:** land docs PR → scaffold monorepo + CI → run the three M0 spikes.

---

## Open Threads

> Unknowns awaiting an answer or decision. Resolve by linking a `DEC-` entry.

- **OT-001** — *AgentSpace project brief.* ✅ Resolved by DEC-004 (brief received,
  North Star set).
- **OT-002** — *SpacetimeDB module language.* ✅ Resolved by DEC-007 (TypeScript;
  access control via Views).
- **OT-003** — *React Native ↔ SpacetimeDB TS-SDK compatibility.* **[critical]**
  The TS client SDK officially targets browser/Node; RN/Hermes (WebSocket,
  no Node builtins) is undocumented/unvalidated. Unblocks: the M0 connectivity
  spike. Blocks: confidence in the whole client layer. Fallback: WS/REST bridge
  service, a polyfill, or an alternative client transport.
- **OT-004** — *Streaming write cadence & cost.* Confirm batched row UPDATEs
  (~50ms) for partial agent tokens don't strain SpacetimeDB/energy budget at
  realistic concurrency. Unblocks: M2 streaming work.
- **OT-005** — *Hosting & data stores.* Decide SpacetimeDB host (Maincloud Pro
  vs self-host), orchestrator host, and the Postgres/pgvector provider. Unblocks:
  M0 infra / M3 RAG. (Pricing/limits cited in research are reported-not-verified.)
- **OT-006** — *Local model structured output.* OpenAI-compatible local providers
  lack the AI SDK's structured-output mode; decide the validation/JSON-repair
  strategy for local agents. Unblocks: M5.

---

## Glossary

- **AgentSpace** — the product: a mobile, real-time home for humans and the AI
  agents they build (see North Star).
- **Cofounder model** — the working mode: human founder + AI (Claude) as
  cofounder/lead engineer, coordinating through this doc harness.
- **SpacetimeDB** — realtime database + server-module runtime; the realtime core.
  Clients subscribe to SQL/Views and react to live updates; the only persistent
  source of truth for chat state.
- **Module** — a SpacetimeDB server-side program (reducers + tables) that the
  database runs; the client's `module_bindings/` are generated from it.
- **Agent Orchestrator** — our self-hosted Node/TS service; a trusted STDB client
  that runs agent loops (model calls, RAG, tools, workflows) outside the DB.
- **Model Gateway** — the provider-agnostic layer (on the Vercel AI SDK) inside
  the orchestrator that routes to Claude/Gemini/OpenAI/local behind one interface.
- **Persona / Agent** — a user-built AI participant: identity/résumé + system
  prompt + model + knowledge base + toolkit + workflows; a first-class chat member.
- **BYOK** — bring-your-own-key: users supply their own provider API keys,
  encrypted at rest and used only server-side.
- **Run** — one agent turn (a row recording status, model, tokens, cost).
- **Doc graph** — the set of single-owner docs in `CLAUDE.md` §1.
- **Drift sweep** — periodic doc↔code reconciliation (`CLAUDE.md` §7).
