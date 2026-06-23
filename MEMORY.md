# MEMORY.md — AgentSpace Durable Memory Ledger

> The continuity ledger. The dev container is ephemeral; this committed file is
> how context survives across sessions. **Read this first every session.**
> Governed by the Memory Protocol in `CLAUDE.md` §3.
>
> - **Snapshot** & **Open Threads** are mutated in place (current state).
> - **Decision Log** & **Session Journal** are append-only (history is the value).

---

## Snapshot — where we are right now

*Last refreshed: 2026-06-23.*

**M0 closed; all six M1 build phases shipped; milestone-close in progress.** Merged
PRs #2–#13. AgentSpace is a working app: sign in (SpacetimeAuth/OIDC, M1.2) → find
people by name + DM/group chat (M1.1/M1.3) → author AI agents (Agent Studio, M1.5) →
the orchestrator streams real LLM replies into chat as the bound persona (Model
Gateway M1.4 + reply loop M1.6). **Now verified on a real device (2026-06-22, local
session, DEC-029):** an Android dev build on the Pixel_8 emulator signs in via
SpacetimeAuth, the founder enters their Anthropic key in 🔑 Keys, and "Pirate Pete"
streams pirate-speak replies via the **real BYOK path** against Maincloud — i.e.
**V-5/V-7/V-8 pass** (founder ticks). Getting there took **6 on-device bug fixes** none of
which CI/`expo export` could hit (PRs #29/#30): orchestrator `main()` never called; Kotlin
1.9.25↔1.9.24 build break; SpacetimeAuth needs a **reverse-DNS** redirect scheme; Hermes
lacks `Promise.withResolvers` (broke **every** reducer write on-device); status-bar safe-area;
prompt must end on a user turn. **M1.7 per-user BYOK shipped (DEC-025):** users enter
their own provider key in a 🔑 Keys screen; it's **box-sealed client-side** to the
orchestrator's pubkey and stored as **ciphertext only** in `provider_key` (raw key never
in STDB); the orchestrator decrypts per-(owner,provider) in-memory. Proven headlessly
end-to-end + 14 orchestrator tests; CI 16/16. So **all M1 build phases (M1.1–M1.7) are
done**; **M1.8 complete** (DEC-028) — the gateway now spans **16 providers** from one shared
`PROVIDER_CATALOG`: 13 single-API-key cloud (M1.8.1) + local/openai-compatible via a per-agent
`agent.baseUrl` (M1.8.2, the one additive STDB column) + multi-credential Bedrock/Azure/Vertex
(M1.8.3, sealed-JSON). `PROVIDERS.md` documents getting every key. **M1 ✓ SHIPPED (2026-06-22)** —
V-5/V-7/V-8 verified on-device (founder-authorized) and tagged in ROADMAP. **Next chunk =
streaming hardening (OT-004) as `M1.9`** (delta-streaming; pull M2.3 forward); V-9/V-10/V-11
optional.

**M1.9 streaming hardening SHIPPED (DEC-030), headless + Maincloud verified; on-device render =
founder V-13/V-14.** Merged **PR #33**: replaced cumulative-text `message` UPDATEs with **append-only
`reply_delta` INSERTs** (fixes OT-004 — the long-reply dangling cursor) + pulled all of old M2.3
forward (backpressure, idle/error timeout → terminal `failed`, cancellation-on-supersede via an
`AbortController` threaded into the gateway). Coupled across module ↔ bindings ×3 ↔ orchestrator ↔
mobile. CI 16/16; **24 orchestrator tests**; the rewritten integration proves delta order + GC +
cancellation against **both local STDB and Maincloud** (no key); a Maincloud **long-reply probe**
streamed a 4949-char reply as 36 deltas in `seq` order with **no gaps / no tail-drop**, settled
`complete`, GC'd — the definitive OT-004 mechanism proof. **Maincloud re-published** with the new
schema (additive → `--delete-data` was a no-op; existing data survived). The Pixel_8 emulator runs
the M1.9 JS cleanly (no JS errors) and the *historical* OT-004 bug is visible in old stuck `▍`
messages, but the **live render tap-through wasn't completed** — Metro dev-client instability
(subscription flapping / reconnects / anonymous-login not persisting) blocked UI automation (env, not
code). **Next:** founder runs **V-13** (long reply settles clean, no dangling `▍`) + **V-14**
(cancellation) on-device → tick. Then **M2** (multi-agent groups), **M3** (RAG), **BL-016**, **BL-011**.

**M2 multi-agent group threads — M2.1 (the MVP) BUILT, CI-green + headless-verified (DEC-031 plan →
DEC-032 build, 2026-06-23); on-device = founder V-15…V-19.** Implements **"Candidate C"**: multi-agent
on the **existing single orchestrator connection**, each agent message **tagged by `agentId`**, the
cost/loop safety system **enforced in the reducer** — `agent_reply_begin` refuses a run past the
**episode** budget (turns + summed token ceiling + per-run cap + concurrency cap), and **`agent_turn`
(once-per-episode-per-agent) structurally bounds any agent↔agent volley to ≤#agents replies**. New
tables `thread_agent`/`episode`/`agent_turn` + a scheduled **reaper**; additive cols
`message.{mentions[],agentId,episodeId}`/`run.{agentId,episodeId}`/`agent.respondsToAgents`. **Tag-based
`isAgent`** fixes persona-bleed (prompt + mobile render). Addressing = `@mention` + `@everyone` + a
thread default-responder; agent→agent off by default (opt-in per persona). Mobile gets an `@mention`
composer, a "+ Add agent" flow, a `respondsToAgents` toggle, and per-persona avatars. Proven
**headlessly** by `integration.ts` Scenarios A–F (incl. **the agent↔agent volley terminating** + the
**reducer refusing a duplicate turn**) + 35 orchestrator / 22 gateway / 8 shared unit tests; **CI 16/16**.
Dials at DEC-031 defaults (tune after V-16). **Next:** PR → merge → founder runs **V-15…V-19** (needs
the Maincloud `--delete-data` republish, new SETUP S-6) → **M2.2** (presence/typing) → M2.3 (context
isolation + NL address) → M2.4 (per-agent identity, BL-014).

**M2.5 on-device connection resilience (auto-reconnect) BUILT, CI-green + headless (BL-022/DEC-034,
2026-06-23) — pulled forward ahead of M2.2.** The SpacetimeDB SDK has no auto-reconnect, so a dropped
Maincloud socket stranded the app on "Connecting…" and **killed the orchestrator process** (hit during
V-15…V-19 setup). The app now wraps the provider in a **`ConnectionGate`** (`reconnect.tsx`) that unmounts the
provider on a drop (forcing the SDK manager to evict the dead socket), refreshes the id token, and remounts
with backoff (foreground-aware; revoked token → Login); the orchestrator runs under a **`runOrchestrator`**
supervisor that reconnects with backoff + re-arms the reply loop on the fresh connection, **never exiting**.
Shared full-jitter `nextBackoff` + a pure `reconnectReducer` (`@agentspace/shared`), unit-tested; integration
**Scenario G** proves orchestrator self-heal. **No module/schema change → no republish.** CI 16/16 (12 shared +
38 orchestrator unit tests, incl. 3 supervisor); Android bundle clean (2.18 MB). On-device = founder **V-21/V-22**.

**M2.2 agent presence & typing BUILT, CI-green (DEC-035, 2026-06-23) — pure mobile, no schema change.** The
minimal M2.1 "{name} is thinking…" became an **animated** presence affordance, derived client-side from
`streaming` `my_thread_messages` rows (tagged `agentId`) and self-healing via the reaper. `@agentspace/shared`
adds a unit-tested `thinkingLabel(names)`; `TypingDots.tsx` is an RN-`Animated` indicator; `Avatar` gains a
pulsing `thinking` halo. Surfaced in the **inbox** ("🤖 {who} is thinking…", multi-agent, replacing the bare
`▍`), the **open thread** (header subtitle + per-row), and the agent avatar. CI 16/16; Android bundle clean.
On-device = founder **V-23**. **S-6 (M2.1 Maincloud republish) confirmed done** (founder 2026-06-23; AI-verified
the live schema) → **V-15…V-19 unblocked**.

- **Active branch:** `feat/m2.2-presence-typing` (M2.2 presence/typing — DEC-035). Prior: M2.5 reconnect (#40,
  DEC-034); M2.1 shipped (#36); Apache-2.0 license (#39, DEC-033). Repo **public**, **Apache-2.0**.
- **Stack:** RN + Expo (SDK 52) · SpacetimeDB (TS module) · Node/TS Orchestrator +
  Vercel-AI-SDK v6 Model Gateway (13+ providers via a shared catalog · per-user BYOK) ·
  (Postgres + pgvector for M3 RAG).
  pnpm `node-linker=hoisted` (DEC-014). Autonomous loop (DEC-013/016).
- **Open founder work:** **S-6** (Maincloud `--delete-data` republish for M2.1's new tables) — required
  before **V-15…V-19**. **S-5** (run orchestrator vs Maincloud) works. **S-7** new — rotate the shared
  Anthropic key (security hygiene; AI keeps using it for local test loops meanwhile). S-1/S-2/S-3 done;
  S-4 optional (gateway smoke / V-6).
- **On-device verification owed (founder):** **V-13/V-14** (M1.9 long-reply + cancel render); **V-15…V-19**
  (M2.1 multi-agent — needs S-6); **V-21/V-22** (M2.5 reconnect — *no* republish). AI has headless evidence
  for all; the founder ticks the device render. *(OT-004 long-reply cursor is RESOLVED by M1.9 delta-streaming.)*
- **Next build:** **M2.2** (agent presence/typing) → **M2.3** (context isolation + NL "Hey {name}," address) →
  **M2.4** (per-agent identity, BL-014) → **M3** (RAG) / **BL-016** (chat polish) / **BL-011** (durable key backing).

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

### DEC-012 — RN↔SpacetimeDB: GO with polyfills (no bridge)
*2026-06-13.* M0.2 static-analysis spike of `spacetimedb@2.5.0` found **no Node
builtins**; it uses the global `WebSocket` + `fetch` (both RN-provided), no
`Buffer` (uses `base64-js`), a pure-JS RNG, and bundles its own URL/Headers
polyfills. Only two standard RN polyfills are needed:
`react-native-get-random-values` (mandatory) and a TextEncoder/Decoder polyfill
(defensive). Decision: proceed with the RN + Expo client and the SpacetimeDB TS
client directly — **no WS/REST bridge**. Full artifact:
`.audit/spike-rn-stdb-2026-06-13.md`. The runtime path still needs an on-device
`[gate]` (this container has no Android device). Downgrades OT-003.

### DEC-013 — Autonomous build loop + founder-owned VERIFICATION.md
*2026-06-13.* Founder enabled auto-merge + auto-delete-branch and set the cadence:
each chunk is planned in **Plan Mode**, ratified, then built autonomously; the AI
watches CI and fixes to green, the PR auto-merges, and the AI proceeds to plan the
next chunk. Human/on-device checks are batched into **`VERIFICATION.md`** (founder-
owned); the AI never self-ticks them and never blocks the loop — it assumes green
and continues unless the founder reports an issue. Encoded in `CLAUDE.md` §4/§5/§6.

### DEC-014 — Expo SDK 52 + pnpm `node-linker=hoisted` + Metro package-exports
*2026-06-13.* The mobile app is Expo SDK 52 (React 18.3.1 / RN 0.76). Two settings
are required for Metro under our pnpm monorepo and are now repo config: a root
`.npmrc` with **`node-linker=hoisted`** (flat node_modules so Metro resolves
transitive deps like `expo-modules-core`), and **`unstable_enablePackageExports`**
+ `unstable_conditionNames` in `apps/mobile/metro.config.js` (so the SDK's
`spacetimedb/react` `exports` subpath resolves). Verified by a clean
`expo export -p android` (561 modules, ~1.9 MB Hermes). The probe's bindings are
**vendored from the example module**, temporary until M0.3 generates ours.

### DEC-015 — Realtime-core module + Views access control (M0.3)
*2026-06-13.* `modules/spacetime` (TypeScript) models the realtime core: private
`thread`/`thread_member`/`message` + public `user`; reducers gate every write by
`ctx.sender` membership; per-user `ViewContext` Views (`my_threads`,
`my_thread_messages`, `my_thread_members`) — built from indexed membership lookups
— are the only client read surface (generated as subscribable tables). Verified on
the AI side via the `spacetime` CLI: `send_message` to a non-member thread is
rejected; a member's `my_threads` returns only their thread. Confirms DEC-007
(TS module + Views over RLS). Agent/run/knowledge tables deferred to M1+. Non-
member negative read case → `VERIFICATION.md` V-2. Artifact: `.audit/spike-stdb-
access-control-2026-06-13.md`.

### DEC-016 — AI merges green PRs via the GitHub API (supersedes auto-merge assumption)
*2026-06-13.* Repo-level "allow auto-merge" only *permits* auto-merge; it isn't
enabled per-PR, so API-created PRs sat green-but-unmerged. Founder's decision: the
**AI merges each PR itself via the API once CI is green** (squash), with `main`
branch-protected as the gate. Refines the DEC-013 loop (the "auto-merges" step is
really "AI merges on green"). `CLAUDE.md` §6 updated.

### DEC-017 — Orchestrator↔STDB loop proven; bindings consumed as source
*2026-06-13.* The orchestrator connects to SpacetimeDB as a trusted client with a
**persisted-token stable identity**, subscribes to the membership-scoped
`my_thread_messages` View, and replies via `send_message` — the subscribe→react→
reduce loop agent replies will use (echo stands in for the M1.4 LLM call). Proven
end-to-end by `scripts/integration.ts` (a second user identity's message is echoed
back). Generated client bindings live in `packages/stdb-bindings` and are
**consumed as source**: under `node-linker=hoisted`, declaration emit fails with
TS2742 and neither `--noCheck`, `tsup --dts`, nor `preserveSymlinks` produce a
usable `.d.ts`; the resulting leniency is confined to `stdb-bindings` +
`orchestrator` (other packages stay strict). Tracked as **BL-009**. Real OIDC
service-account auth is deferred to M0.5 (anonymous token suffices for the spike).

### DEC-018 — Close M0; lead M1 with the mobile chat MVP; auth → M1.2
*2026-06-13.* Founder ratified: **close M0** (all spikes cleared) and **fold auth
into M1** using **SpacetimeAuth (built-in OIDC)** rather than a standalone M0.5.
M1.1 turns `apps/mobile` from the probe into a real human↔human **chat MVP** on the
`agentspace` module (anonymous identity for now); **SpacetimeAuth OIDC login** (ID
token → `withToken`, via `expo-auth-session`) is its own chunk **M1.2** because
the redirect flow is inherently device-verified. M0.5 in ROADMAP is relocated to
M1.2. (M0 milestone-close drift sweep deferred — docs kept current per-PR; run
`/audit` on demand.)

### DEC-019 — SpacetimeAuth login via `expo-auth-session` + founder-owned `SETUP.md`
*2026-06-13.* M1.2 ships real OIDC login in the mobile app. **Choices:** (1) Use
**`expo-auth-session`** (authorization-code + PKCE) rather than the web
`react-oidc-context` path — it's the RN-native OIDC client and needs no secret on
the device. (2) The **refresh token is the durable credential**, persisted in
**SecureStore**; the short-lived **id token** is what we hand to
`DbConnection.withToken()` so SpacetimeDB derives a stable per-user `Identity`. On
launch we `refreshAsync` → fresh id token → connect; `App.tsx` gates the
`SpacetimeDBProvider` behind a `Login` screen. (3) `app.json` gets
`scheme: "agentspace"` (redirect `agentspace://redirect`) but **no `plugins`
array** — listing `expo-web-browser`/`expo-secure-store` as config plugins makes
`expo export` `require` `expo-modules-core`'s `.ts` source and crash under Node
≥22.18 type-stripping; both autolink without it. (4) Client lives only on
**Maincloud `agentspace-hpm58`** (a local server doesn't trust the issuer), so the
device test targets Maincloud. (5) New founder-owned **`SETUP.md`** (`S-n` items)
captures everything the human must do externally (register the SpacetimeAuth client,
add the redirect URI, publish to Maincloud) — the setup-side twin of
`VERIFICATION.md`, encoded as a standing rule in `CLAUDE.md` §1/§4. The
orchestrator's real service-account auth is out of scope → **OT-007**.

### DEC-020 — Model Gateway v1: AI SDK adapters (Anthropic + OpenAI) + AES-256-GCM BYOK
*2026-06-13.* M1.4 fills the gateway stub in on the **Vercel AI SDK v6**
(`ai@6`, `@ai-sdk/anthropic@3`, `@ai-sdk/openai@3`), keeping the existing
`ModelGateway` interface byte-stable. **Choices:** (1) `createModelGateway({
resolveCredential, providers? })` — a **provider registry** maps `ModelRef.provider`
→ an AI SDK model factory; **anthropic + openai** implemented, **google +
openai-compatible** registered but throw (BACKLOG; the registry makes adding them a
line each). (2) `stream(req)` calls `streamText` and normalizes `fullStream` →
`GatewayDelta` (`text`/`tool-call`/`finish`+usage); `system` roles hoisted into the
SDK `system` arg; `ToolSpec`→`jsonSchema`. (3) **BYOK** is an `EncryptedKeyStore`
(Node `crypto` **AES-256-GCM**, seal/open under an env KEK) + an injected
`CredentialResolver`; **v1 backing is an in-memory sealed map**, Postgres/KMS
deferred (OT-005). Decryption is in-memory only, never logged (BLUEPRINT §4). (4)
`resolveCredential` is **optional** (no-arg `createModelGateway()` still compiles;
`stream` throws a clear error if used without one). (5) `embed` stays deferred to
M3.1. (6) Tested **headlessly**: BYOK crypto (round-trip / tamper / wrong-KEK) +
stream normalization via AI SDK `MockLanguageModelV3` (16 tests) — a real provider
round-trip is the founder smoke (V-6, key via SETUP.md S-4). Orchestrator builds the
gateway with `envResolver()`; the echo reply loop is untouched (real LLM reply into
STDB is M1.6).

### DEC-021 — Agent reply loop: client-owned runId, streaming reducers, seeded persona
*2026-06-13.* M1.6 makes agents actually reply. **Choices:** (1) The orchestrator
writes a reply as a **live message row** via three reducers —
`agent_reply_begin`/`agent_reply_append`/`agent_reply_finish` — correlated by a
**client-owned `runId`** (not the autoInc row id), so the orchestrator never needs a
round-trip to learn the row id (avoids a correlation race). `message` gains a
`runId` column (`''` for humans) + `by_run` index; a private **`run`** table records
status/model/tokens. (2) The reply loop reacts to a human's `complete` message in a
thread where the orchestrator is an **`agent`-role** member; loop-guarded by an
in-flight `Set` + the `runId !== ''` / `sender == self` filters. (3) Streaming uses
a **~50ms coalescing batcher** that flushes the latest cumulative text (BLUEPRINT
§5). (4) v1 ships a **single seeded default persona** (system prompt + `DEFAULT_MODEL`
in the orchestrator); authoring personas is M1.5. (5) Verified **headlessly**: the
rewritten `scripts/integration.ts` injects a **mock gateway** and asserts a real
local STDB round-trip (`streaming`→`complete` + live UPDATEs) — no API key; a real
LLM reply on-device is `V-7`. (6) Mobile renders a streaming cursor; partial text
already arrives via `useTable` (no other client change). Coupled SPEC §1/§6 +
BLUEPRINT §3 updated. Fixed the publish script flag (`-p`, not `--project-path`).

### DEC-022 — Agent Studio: agents as per-thread configs bound via a service identity
*2026-06-13.* M1.5 lets users author personas. **The defining fork** — how a persona
becomes a chat participant — resolved as **(A) service-identity binding**, not (B)
per-agent identity. **Choices:** (1) `agent` is an owner-scoped **config row**
(name/systemPrompt/provider/model + a `version` counter); the single orchestrator
**service identity** is the `agent` member, and **`thread.agentId`** names which
persona. A `service` singleton holds the orchestrator identity (registered on startup,
first-wins — harden via OT-007) so `create_agent_dm` can add it. (2) The orchestrator
resolves the bound persona (`selectPersona`) and replies with its system prompt +
model, falling back to the seeded default. (3) Mobile `AgentList`/`AgentEditor`
screens; "Chat" deploys/opens an agent DM. (4) **Reversible:** the `agent` table holds
the data; minting per-agent identities (agents-as-contacts with presence, needed for
multi-agent groups) is the additive B step → **BL-014 / M2**. Immutable
`agent_versions` history (BLUEPRINT §3) cut to a counter for v1 → **BL-013**. (5)
Verified **headlessly end-to-end**: the integration authors "Pirate Pete", deploys,
posts, and asserts the mock gateway received the persona's system prompt + model.
On-device authoring/reply → `V-8`.

### DEC-023 — Contacts via the public `user` directory; creator-gated group mgmt
*2026-06-13.* M1.3 closes M1's build phases. **Choices:** (1) The `user` table is
already `public`, and the React SDK's `useTable` auto-subscribes — so a **user
directory / name search is a client-side filter; no new View or subscription**. A
reusable `UserPicker` powers **New chat** (`create_dm`) and group **Add member**
(`add_member`). (2) Group management = two **creator-gated** reducers
(`remove_member`, `set_thread_title`) + a `ThreadMembers` screen (add/remove/rename/
leave); `create_dm` gains a **dedupe** (one human DM per pair). (3) A focused
**world-class UI/UX pass** (founder-requested): a deterministic `Avatar` (color-from-
identity + initials + online ring), `ThreadList` as a real inbox (last-message preview,
relative time, activity sort, FAB, first-run name nudge), avatar headers + auto-scroll
in `Thread`. (4) Deferred: a **non-global contacts/visibility/blocking** model (the
public directory exposes everyone) → `BL-015`; **deep chat polish** (grouping, day
separators, unread, animations) → `BL-016`. Reducers verified via `spacetime call`;
on-device UX is `V-9`.

### DEC-024 — Per-user in-app BYOK is the next chunk (M1.7) + gates the first real reply
*2026-06-14.* Founder asked why S-4 needs a `.env` key when the vision is per-user
BYOK. **Reality:** M1.4 built the gateway BYOK-*ready* (the `CredentialResolver` seam +
AES-256-GCM `EncryptedKeyStore`) but wired it to a **dev `envResolver`** —
`credentialRef = model.provider` → one `<PROVIDER>_API_KEY`, shared by all users — so
the agent reply loop could be proven (M1.5/M1.6) without first building key management.
That env key is **interim dev scaffolding, not the product model.** **Decision
(founder-ratified):** build **full per-user in-app BYOK as `M1.7`** and make it **gate
the first real on-device reply** (V-7/V-8) — production never uses a shared `.env` key.
`envResolver`/`.env` stays only for the gateway smoke (V-6) + a dev fallback. Per-user
key management (key-entry UI + a `provider_keys` flow where keys are stored **encrypted,
never raw in STDB** + the orchestrator resolver swap) is M1.7; the durable Postgres/KMS
*backing* stays **BL-011**. Open design point for the M1.7 plan: mobile ships only
`expo-crypto` (no symmetric/asymmetric lib), so client-side encryption needs a crypto
lib **or** an orchestrator submission path — decided then. ROADMAP re-sequenced (M1.7
before the M1 tag); SETUP S-4 / VERIFICATION V-7-8 / BLUEPRINT reframed accordingly.

### DEC-025 — Per-user BYOK shipped: client-encrypt to the orchestrator's pubkey (Option A)
*2026-06-14.* M1.7 built. **Design (founder-approved Option A):** the orchestrator holds
a **NaCl box keypair** (`tweetnacl`; secret key persisted to a file like its token) and
publishes its **public key** in `service.encPubKey` (`service_info` view). The app
**seals** a provider key to that pubkey client-side and stores only **ciphertext** in a
private `provider_key` row (`set_provider_key`); the **raw key never appears in STDB**.
The orchestrator resolves `credentialRef = "<ownerHex>:<provider>"` by finding the
sealed blob in `my_persona_keys` and **opening it in-memory** (`createByokResolver`).
**Choices:** (1) STDB carries the ciphertext (no new network surface) — Option B (an
orchestrator HTTP endpoint) rejected as it pulls hosting/OT-005 forward. (2) `tweetnacl`
on both ends (mobile had only `expo-crypto`); seal/open coupled across
`apps/mobile/src/byok.ts` ↔ `services/orchestrator/src/byok.ts`. (3) `envResolver`/`.env`
now **only** the gateway smoke (V-6). (4) v1 caveat: keypair + `provider_key` ciphertext
persist, but durable Postgres/KMS backing + rotation stay **BL-011** (lose the keypair →
users re-enter keys). (5) Verified **headlessly end-to-end** (integration: seal
`sk-test-byok-123` → STDB ciphertext → orchestrator decrypts the exact key → persona
replies) + 14 orchestrator tests. Mobile `ApiKeys` screen (🔑 Keys). On-device is
`V-7/V-8` (now the real path, no `.env`).

### DEC-026 — SpacetimeDB is identity-based: no API key / no committed secret (by design)
*2026-06-14.* Founder asked why there's no SpacetimeDB API key or credential to add to
`.env`/GitHub Secrets. **Captured as the durable answer:** SpacetimeDB authenticates
every actor with an **identity token**, not an API key, and none is a committed secret —
(1) mobile users use a per-login SpacetimeAuth **OIDC id token** (the only config is the
non-secret `EXPO_PUBLIC_SPACETIMEAUTH_CLIENT_ID`); (2) the orchestrator uses a self-issued
**anonymous identity token** cached to a local file (DEC-017; real service account =
OT-007); (3) module publish uses the developer's `spacetime login` session in
`~/.config/spacetime/`. **CI never connects to a live DB**, so no GitHub secret is needed.
The **only** real secrets are **per-user BYOK keys** (in-app, sealed, ciphertext-only in
STDB — DEC-025) + the optional dev `ANTHROPIC_API_KEY` (S-4, local smoke). Future
**deployment** secrets arrive only when the orchestrator is hosted (OT-005): service-account
auth (OT-007) + durable KEK/keypair backing (BL-011). This posture (per-actor, refreshable,
reducer/View-scoped) is intentional and better than a shared static key. Recorded in
BLUEPRINT §8.1; doc-only (no code change).

### DEC-027 — Orchestrator hosting: central always-on for v1; on-device/serverless are future modes
*2026-06-22.* Founder asked whether the orchestrator could run **on-device/edge** or as a
**Vercel serverless** app. Grounded in the code: the orchestrator is a **persistent, stateful,
long-running WebSocket subscriber** (keeps an open Maincloud connection + in-memory box
keypair / in-flight `Set` / ~50ms batchers + a file-persisted token; a reply holds it busy
1–60s) and is **Node-only** (`node:fs`/`node:os`/AI-SDK adapters/`tsx`). The module is also
**central by design** today (singleton `service`, one `agent`-member identity; per-agent
identities = BL-014). **Decision (founder-ratified):** v1 ships **one small, cheap, always-on
central service** — "always-on ≠ expensive" (mostly idle on a socket → free-tier container);
it alone delivers **always-available agents, group replies, and scheduled workflows**. The
**specific** host (Fly/Railway/Render/Maincloud-managed/self-host) stays **OT-005**; needs
OT-007 (real service identity) + BL-011 (durable key backing). **Three future optional modes
on one self-host-vs-always-on spectrum**, captured in BACKLOG: (a) **phone on-device** (BL-017
— same Android device as the app via `nodejs-mobile`/Hermes port + a local SLM via BL-001;
**capability/tier-gated** with cloud fallback; **defining caveat: foreground-only**, since the
limiter is Android background execution — Doze/OEM killers — not compute, so it can't be
always-available); (b) **desktop self-host** (BL-018 — the *existing* Node orchestrator on the
user's own always-on PC/GPU pointed at local Ollama via the gateway `openai-compatible` path,
DEC-009/DEC-020; most feasible "nothing leaves my hardware"); (c) **event-driven serverless**
(BL-019 — stateless per-turn functions, contingent on a SpacetimeDB push/webhook trigger;
DEC-008 flagged `procedures` HTTP as unstable). **Product surface = the Android app** (DEC-005;
**no "Windows app"** — Windows is the founder's dev machine). On-device *model inference* is a
separate, already-deferred axis (DEC-009/BL-001) the local modes compose with. Doc-only.

### DEC-028 — Full multi-provider BYOK via a shared provider catalog + tiered credentials
*2026-06-22.* Founder: support **all Vercel AI SDK providers** (all 3 tiers) before the local
session, with a UI/UX refresh. **Design:** a single **`PROVIDER_CATALOG`** in
`@agentspace/shared` (`{id,label,kind,defaultModel,suggestedModels,keyHint,getKeyUrl,fields?}`)
is the one source of truth the gateway registry (`providers.ts`) **and** both mobile screens
(`AgentEditor`/`ApiKeys`) derive from — killing the prior 4-way triplication. **Credential
model stays clean:** `provider_key.sealed` is opaque, so multi-credential providers seal a
**JSON blob** — **no `provider_key` schema change, no `CredentialResolver` signature change**
(the resolved string is a key for Tier-1/2, JSON for Tier-3). Three tiers shipped as
M1.8.1/.2/.3: (1) **single-API-key cloud** — 13 providers, each `createX({apiKey})(model)`,
**no STDB change** (provider/model are free-form strings); (2) **openai-compatible/local** — a
per-agent `baseUrl` (agent-table column) + `createOpenAICompatible`; (3) **multi-credential**
Bedrock/Azure/Vertex (sealed JSON + multi-field UI). Curated `suggestedModels` chips + a
free-text model field (catalogs drift — never hardcode an allowlist). Supersedes DEC-020's
"anthropic+openai only" scope. Verified headlessly (gateway per-provider factory coverage +
catalog-integrity tests via `MockLanguageModelV3`; Android bundle clean); live round-trips =
`V-10/11/12`.

### DEC-029 — On-device enablement: six fixes the device exposed; V-5/V-7/V-8 proven
*2026-06-22 (local session).* First real Android-dev-build run vs Maincloud surfaced a chain of
bugs invisible to headless CI and `expo export` (which never compiles native nor calls a live
provider). Fixed across PRs **#29** (orchestrator entrypoint) and **#30** (the rest): (1)
`services/orchestrator/src/index.ts` defined `main()` but never **called** it → added
`src/main.ts` so `start` actually runs the service. (2) **Android build**: RN 0.76.5's Kotlin
compiler is 1.9.24 but Expo SDK 52's template defaults the `kotlinVersion` ext to 1.9.25, so
`expo-modules-core` picked a mismatched Compose-compiler extension and `compileDebugKotlin`
failed → pin `android.kotlinVersion=1.9.24` via **`expo-build-properties`** (+ gitignore the
CNG-generated `android/`). (3) **OIDC redirect**: SpacetimeAuth (node-oidc-provider) rejects a
plain custom scheme `agentspace://redirect` with `invalid_redirect_uri` — native clients need a
**reverse-DNS** scheme → `com.agentspace.probe://redirect` (`auth.ts` + app.json `scheme`;
founder re-registers on the client, removing the old URI). (4) **`Promise.withResolvers`**: Hermes
(RN 0.76) lacks this ES2024 API, which the SpacetimeDB SDK uses for **every reducer call** — so
on-device key-save / agent-create / send-message all *silently* threw → polyfill in
`polyfills.ts` (also surfaced the silently-swallowed seal error in `ApiKeys`). (5) **Safe-area**:
RN's `SafeAreaView` doesn't pad the Android status bar → headers rendered under it and were
untappable → switch all screens to **`react-native-safe-area-context`**. (6) **Prompt**:
`buildPrompt` could end on an assistant turn (a re-seen failed reply) → drop trailing assistant
turns + feed only `complete` messages. **Outcome:** V-5 login, V-7/V-8 "Pirate Pete" streamed
pirate-speak replies via the user's BYOK Anthropic key — working on the Pixel_8 emulator vs
Maincloud (founder ticks the V-items). Streaming caveat → updated **OT-004**.

### DEC-030 — Delta-streaming: append-only INSERTs replace cumulative-text UPDATEs (M1.9)
*2026-06-22.* Resolves **OT-004**. The streaming reply path re-sent the **full cumulative text**
as a `message` row UPDATE every flush — O(n²) bandwidth whose long, ever-growing burst the client
subscription **tail-drops** over Maincloud (dangling cursor on long replies; DEC-029). **Fix
(founder-ratified "full M2.3" scope):** stream via **append-only delta INSERTs**. **Choices:**
(1) New private **`reply_delta`** table (`runId`/`threadId`/`seq u64`/`text`/`sent`; `by_run` +
`by_thread` indexes) + a membership-scoped **`my_reply_deltas`** View; reducer
**`agent_reply_delta(runId, seq, text)`** INSERTs one small chunk (same sender/`streaming` guard as
the now-**dormant** `agent_reply_append`, deleted next milestone). (2) The `message` row stays
**empty while `streaming`**; `agent_reply_finish` writes the authoritative final text **and GCs the
run's deltas in the same transaction** (founder: GC-on-finish — safe, the client gets the
`complete` row + delta removal atomically). Mobile concatenates deltas by `seq`, falls back to
`message.text` when not `streaming`. (3) **`seq`** = orchestrator-assigned `u64`, one per **flush**
(not per token) — gap-free, single-writer, sort-stable. (4) The coalescing batcher flips from
"latest cumulative snapshot" to "accumulate deltas, flush their concatenation," ~100ms window + a
soft per-INSERT byte cap (backpressure). **Pulled all of old M2.3 forward** (DEC: harden before M2):
(5) an **idle/error timeout** (no token 60s → `AbortController`.abort → terminal `failed`) so no run
hangs; (6) **cancellation-on-supersede** — a newer human message aborts the in-flight stream (signal
threaded into the gateway: `GatewayRequest.signal` → `streamText.abortSignal`) and finalizes it via
new **`agent_reply_cancel`** (message `failed` w/ partial — SPEC §1 already defines `failed` as
"errored *or cancelled* mid-stream", so **no new state**; run `cancelled` — SPEC §2), then answers
the new message (per-thread in-flight `Map` replaces the old loop-guard `Set`). Coupled change cited
across `modules/spacetime` ↔ bindings ×3 ↔ orchestrator emitter ↔ mobile assembler (SPEC §1/§2/§6,
BLUEPRINT §3/§5, CLAUDE §9). Verified **headlessly**: 24 orchestrator unit tests (delta-batcher /
seq / bounded-flush / happy·timeout·error·cancel finalization) + the rewritten integration proves
delta order + concatenation + **GC** + cancellation against a real local STDB (no key); Android
bundle clean (645 modules). On-device vs Maincloud = **V-13** (long reply settles clean) / **V-14**
(cancellation). ROADMAP re-sequenced: M1.9 inserted; old M2.3 removed (M2.4→M2.3).

### DEC-031 — M2 multi-agent: "Candidate C" (persona-tagged single connection) + reducer-enforced budget
*2026-06-22.* The M2 architecture, chosen from an 8-agent research + adversarial-review workflow
(`.audit/m2-research-2026-06-22/` — codebase map, 4 research angles, candidate designs, adversarial
critique, synthesis). **Decision (founder-ratified):** ship multi-agent on the **existing single
orchestrator connection**, each agent message **tagged by `agentId`** (Candidate C); defer per-agent
SpacetimeDB identities/real presence to a reversible **M2.4 / BL-014**. **Rationale:** M2's existential
risk is agent↔agent loops + token cost (NOT presence realism), and that entire safety system is
net-new code regardless of identity model; C ships the cost-safe + **coherent** core on zero new infra
(one in-memory loop ⇒ serialized ordered turns), derives typing from existing `streaming` rows (no
crash-fragile presence table), and the arbitration/prompt work is identity-agnostic (survives the A
upgrade — `agentId` demotes to provenance). Candidate A (per-agent identity first) front-loads an OIDC
issuer + JWKS + N-connection pool AND has the worst default coherence (N connections stream at once,
context races). **Enforcement boundary = the reducer:** `agent_reply_begin` refuses a run that exceeds
the episode budget, so agent code cannot start a disallowed reply — stronger than every framework
surveyed (all enforce in app code). **Choices:** (1) new tables `thread_agent` (many agents/thread,
generalizing singular `thread.agentId`), `episode` (cost/loop ledger, opened ONLY by a human
`send_message`), `agent_turn` (once-per-episode-per-agent de-dup); additive cols
`message.{mentions[],agentId,episodeId}`, `run.{agentId,episodeId}`, `agent.respondsToAgents`. (2)
**Addressed-only arbitration** — `@mention`/reply-to/default-responder resolve a candidate reply set;
the budget guards (episode turns + token ceiling + per-run output cap + concurrency cap + per-agent
cooldown) are always-on, in the reducer. (3) **Showstopper pulled into the MVP:** under one identity
`isAgent = sender==self` is true for EVERY agent's message → persona-bleed; `PromptRow` gains `agentId`
and `isAgent` is computed from the **tag**. (4) **Supersede per-`episodeId`**, not per-thread (per-thread
cancel-all livelocks a 2-human thread). (5) Multi-party prompt = per-agent role-flip + inline name-tags +
roster footer + `stop` sequences; each agent sees only its own `systemPrompt`. **Ratified dials**
(configurable; full per-agent/day metering → BACKLOG): `MAX_TURNS_HARD≈8`, `MAX_CONCURRENT≈2`,
`MAX_OUTPUT_TOKENS_PER_RUN≈2000`, `EPISODE_TOKEN_CEILING≈50k`, cooldown ≈3s; **agent→agent off by
default, opt-in per persona**; addressing = `@mention` only in the MVP (NL "Hey {name}," → M2.3);
**per-agent identity = fast-follow M2.4**. Phasing: M2.1 (addressing+arbitration = the MVP/existential
core) → M2.2 (presence/typing from `streaming` rows) → M2.3 (full context-isolation recipe + NL address)
→ M2.4 (per-agent identity, BL-014). Supersedes the agent-participation half of DEC-022. New V-items
V-15…V-20; SPEC §3 refined (structured `mentions` + episode budget). Doc/plan only — no code yet.

### DEC-032 — M2.1 built: episode-first opens, await-begin pre-flight, structural agent_turn bound
*2026-06-23.* M2.1 (the multi-agent MVP) implemented per DEC-031 and shipped CI-green + headless.
The decisions DEC-031's plan left open, pinned during the build: (1) **Episode-first `send_message`
ordering** — insert the episode → insert the message with its `episodeId` → back-stamp
`episode.rootMessageId`; so the message is inserted EXACTLY ONCE with its final `episodeId` and a
subscriber's `onInsert` sees it set (no reliance on intra-transaction insert+update coalescing). (2)
The orchestrator reacts to **human triggers on `onInsert`** (human messages are inserted `complete`)
and **agent-reply completions on `onUpdate`** (`streaming`→`complete`) — the agent→agent trigger. (3)
**`agent_turn` is the structural termination guarantee**: once-per-episode-per-agent bounds any
agent↔agent volley to **≤ #agents replies** per human-rooted episode — the turn counter, summed token
ceiling, per-run cap, and concurrency cap are belt-and-suspenders. (4) **The orchestrator AWAITS
`agent_reply_begin` and skips cleanly if the reducer refuses** — a real robustness fix: the SDK
surfaces a refused reducer as a **rejected promise**, so a fire-and-forget budget refusal was an
unhandled crash; awaiting begin also skips the gateway call entirely on refusal (no wasted tokens).
An in-memory once-per-(episode,agent) set **pre-flights** the reducer guard (the reducer stays
authoritative — proven by integration Scenario F calling a duplicate begin directly → REFUSED). (5)
**Default responder = the first agent added** to a thread (`thread_agent.isDefaultResponder`);
`create_agent_dm` now also writes a `thread_agent` row so a 1:1 agent DM still auto-answers an
unaddressed message and DMs+groups resolve through one path (no `thread.agentId` UNION needed). (6)
**`buildPrompt` is DM/GROUP-gated on a non-empty roster** — a 1:1 DM keeps the exact pre-M2 prompt;
group mode adds name-tags + same-role merge + a roster footer; `isAgent` is from the `agentId` TAG
(the showstopper). (7) **MVP `@mention` = agent + `@everyone` only**; `@human` deferred (humans don't
auto-respond), so the composer never emits it and `Mention.ref` is unambiguously an `agentId`. (8) The
WASM module **re-declares the dials inline** (coupled twin of `@agentspace/shared` — it can't import
the package; CLAUDE §8). (9) Terminal-absorbing guards on delta/finish/cancel + a 120s-TTL scheduled
**reaper** (60s sweep) make every run terminal even if the orchestrator dies. Dials shipped at the
DEC-031 defaults (`STREAM_TTL_MS=120000`); tune after V-16. Verified **headlessly** end-to-end —
integration Scenarios A–F (DM stream+GC+BYOK / supersede / @a@b in order / **agent↔agent volley
terminates** / @everyone bounded / **reducer refuses a duplicate turn**) + 35 orchestrator unit tests
+ the gateway `maxOutputTokens` forwarding test; CI **16/16**. Coupled across `modules/spacetime` ↔
bindings ×3 ↔ `shared`/`gateway`/orchestrator ↔ mobile. On-device = founder **V-15…V-19** (needs the
Maincloud `--delete-data` republish — new SETUP S-item). Deferrals: per-(agent,thread) cooldown
reserved-but-unenforced; other users' agent names fall back to a generic label in the mobile UI
(BL); reaper timed test = V-18; per-agent identity = M2.4.

### DEC-033 — Repo stays public under Apache-2.0; monetization ≠ private; license is the lever
*2026-06-23.* Founder asked whether to take the repo **private** (free-plan CI-minutes worry) and, on
clarification, whether a **public** repo can be monetized and where "going private" should be tracked.
**Findings:** (1) the repo is **public**, so **GitHub Actions is free/unlimited** — the 2,000-min/mo cap is
private-only; **no cost reason** to go private. (2) On the **Free** plan, **private repos lose branch
protection / required status checks / rulesets** (a **Pro $4/mo** feature), so going private would
**silently drop the CLAUDE §6 merge gate**. (3) **Public ≠ unmonetizable:** hosted SaaS / open-core /
dual-licensing all monetize public code; AgentSpace's moat is the **running service + ops + brand**, not the
source. (4) **The protective lever is the LICENSE (chosen now), not the visibility toggle (later):** going
private can't recall already-public commits nor revoke a license already granted on them. **Decision
(founder-ratified):** **stay public** and **add Apache-2.0** — root `LICENSE` + `NOTICE`, `"license":
"Apache-2.0"` in every workspace `package.json`, a README badge + **## License** section. **Apache over MIT**
for the **patent grant + defensive termination**; **over AGPL/BSL** because the **mobile app ships to app
stores** and copyleft conflicts with App-Store terms (the VLC problem), current clone risk is ~0, and as
**sole copyright holder** we can tighten the **server** packages later (AGPL-3.0/BSL — dependency-graph-
correct: keep anything the app imports, e.g. `packages/shared`, permissive) or sell a commercial dual-
license. Copyright holder: **blokzdev**. **"Going private" is NOT a committed action** — the revisit lives in
**BL-023** (trigger: pre-GA / first paying users / clone signal → a launch-gate decision). The
`examples/chat-react-ts` reference keeps its upstream template license. License/doc-only — no code change.

### DEC-034 — On-device connection resilience (auto-reconnect) shipped as M2.5; pulled ahead of M2.2
*2026-06-23.* On-device M2.1 verification hit **BL-022**: the SpacetimeDB SDK has **no auto-reconnect** (its
`ConnectionManager` caches a connection by `(uri, moduleName)` and on disconnect only flips `isActive=false`),
so a dropped Maincloud socket left the app stuck on "Connecting…" and the **orchestrator process exited**.
Because that strands every V-15…V-19 session, reconnect-resilience was **pulled forward ahead of M2.2** (the
M1.9 "harden the substrate first" precedent) and shipped as **M2.5**. **Approach (two runtimes, one shared
util):** `@agentspace/shared` gains a full-jitter `nextBackoff(attempt)` + a pure `reconnectReducer` phase
machine (both unit-tested). **App:** `App.tsx` mounts `Root` under a new `ConnectionGate`
(`apps/mobile/src/reconnect.tsx`); on a drop it **unmounts the provider** for a backoff interval — the *only*
way to make the ref-counted manager evict + `disconnect()` the dead socket (a same-tick remount reuses it; the
StrictMode-survival feature working against us) — then refreshes the id token (transient failure → keep
retrying; `invalid_grant`-class → Login) and remounts with a fresh builder; foreground-aware via `AppState`.
**Orchestrator:** new `supervise.ts` `runOrchestrator` reconnects with backoff + re-arms the reply loop on the
fresh connection, **never exiting** (stable persisted-token identity). **No module/schema/bindings change → no
Maincloud republish.** Proven by shared + 3 `supervise.test.ts` unit tests + integration **Scenario G**
(`conn.disconnect()` → reconnect → a new message answered over the fresh connection); CI 16/16; Android bundle
clean. **Numbering:** chose **M2.5** (not renumbering M2.2–M2.4) because "M2.4 = per-agent identity" is
cross-referenced across the docs; founder accepted at ratification. On-device = founder **V-21/V-22** (no
republish). Promotes **BL-022**; deferred follow-ups stay in BL-022 (deep nav-state across reconnect; aborting
in-flight gateway streams on drop; a revoked-but-present refresh token → immediate Login).

### DEC-035 — Agent presence & typing (M2.2): animated, derived from streaming rows, no schema change
*2026-06-23.* M2.1 left a *minimal* "{name} is thinking…" hint; M2.2 makes **agent presence/typing** a real,
**animated** affordance. Two Explore sweeps confirmed it's **pure mobile with no module/schema change** —
agent activity is fully derivable client-side from existing `streaming` `my_thread_messages` rows (tagged
`agentId`) + `my_reply_deltas`, and **self-heals** because the reaper (`reap_stale_runs`, STREAM_TTL 120s)
flips a stale `streaming` row → `failed`. Human typing + per-agent *online* presence are **out** (they'd need
a `presence` table) → **BL-024 / M2.4**. **Built:** `@agentspace/shared` `thinkingLabel(names)` (0→null /
1 / 2 / ≥3 arms, unit-tested); `apps/mobile/src/components/TypingDots.tsx` (dependency-free RN-`Animated`
three-dot indicator); `Avatar` pulsing `thinking` halo; **inbox** (`ThreadList.tsx`) shows "🤖 {who} is
thinking…" (multi-agent, replacing the bare `▍`) — the main gap M2.1 left; **open thread** (`Thread.tsx`)
gets a header subtitle + an animated per-row indicator. CI 16/16; Android bundle clean. On-device = **V-23**.
Also this session: **S-6 confirmed done** — the founder re-published M2.1 to Maincloud; the AI verified the
live schema (`spacetime describe … --json` shows `thread_agent`/`episode`/`agent_turn`/`reaper_schedule`/
`responds_to_agents`), so **V-15…V-19 are unblocked**.

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

### 2026-06-13 — M0.1 scaffold + M0.2 spike
- Shipped & merged the docs foundation (PR #2) and the monorepo + CI (PR #3,
  M0.1: pnpm + Turborepo, `shared`/`gateway`/`orchestrator`, green CI 12/12).
- Ran the **M0.2 RN↔STDB spike** (DEC-012): static analysis of the SpacetimeDB
  TS client → GO with two polyfills, no bridge. Artifact in `.audit/`.
- **Next:** scaffold `apps/mobile` Expo probe so the founder can run the
  on-device `[gate]`; then M0.3 (module + access-control) and M0.4
  (orchestrator-as-trusted-client) spikes.

### 2026-06-13 — M0.2b Expo probe + autonomous loop
- Founder enabled auto-merge/auto-delete and the plan-per-chunk autonomous loop
  (DEC-013); created founder-owned `VERIFICATION.md`; encoded the loop in CLAUDE.md.
- Built `apps/mobile` (Expo SDK 52) connectivity probe (connect + subscribe +
  reducer screen) against vendored example bindings. Resolved pnpm↔Metro friction
  via `node-linker=hoisted` + Metro package-exports (DEC-014).
- **Verified on my side:** root `pnpm run ci` green (14/14); **Android Metro
  bundle exports clean** (561 modules). Live device run is `VERIFICATION.md` V-1.
- **Next:** M0.3 — AgentSpace SpacetimeDB module (users/threads/members/messages)
  + per-user Views access-control spike.

### 2026-06-13 — M0.3 module + access-control spike
- Merged PR #5 via API (DEC-016: AI now drives merges on green; updated CLAUDE §6).
- Built `modules/spacetime` (TS): tables + membership-gating reducers + per-user
  Views. `spacetime build`/`publish --server local`/`generate` all succeed; CI
  16/16. CLI checks: non-member `send_message` rejected; member `my_threads`
  scoped correctly (DEC-015). Non-member negative case → V-2.
- **Next:** M0.4 — orchestrator connects as a trusted STDB client (OIDC service
  identity), subscribes to messages, and writes a reply via a reducer.

### 2026-06-13 — M0.4 orchestrator↔STDB loop
- Merged PR #6 (M0.3) via API. Built the orchestrator's real STDB connection +
  echo reply loop (`spacetime.ts`, `replyLoop.ts`, `scripts/integration.ts`) on
  `packages/stdb-bindings` (generated, source-consumed). Integration **passes
  end-to-end** (DEC-017). CI 16/16, orchestrator fully strict.
- Researched the bindings TS2742 issue (founder asked for a non-lenient option):
  no clean `.d.ts` is achievable under hoisted pnpm → source-consumption, leniency
  confined to 2 packages, BL-009 logged.
- **Next:** M0.5 — OIDC auth provider (device login + orchestrator service
  account), close M0, then M1 (realtime chat + Agent MVP).

### 2026-06-13 — M0 close + M1.1 mobile chat MVP
- Merged PR #7 (M0.4). Founder ratified closing M0 + folding auth into M1.2
  (DEC-018). **M0 retro:** the three risky unknowns (RN↔STDB, STDB access-control,
  orchestrator client) all cleared with verifiable evidence; the autonomous
  plan→build→merge loop + VERIFICATION.md batching worked well; the one friction
  was generated-bindings typing under hoisted pnpm (BL-009).
- Built M1.1: regenerated `apps/mobile` bindings from our module; `ThreadList` +
  `Thread` chat screens (threads/messages/presence/add-member). CI 16/16; Android
  bundle clean. On-device behavior → `V-4`.
- **Next:** M1.2 — SpacetimeAuth OIDC login.

### 2026-06-13 — M1.2 SpacetimeAuth login + SETUP.md process
- Researched SpacetimeAuth (hosted OIDC, issuer `auth.spacetimedb.com/oidc`,
  code+PKCE, RN path = `expo-auth-session`). Founder has Maincloud `agentspace-hpm58`.
- Built M1.2 (DEC-019): `src/auth.ts` (`useSpacetimeAuth` — discovery, login,
  SecureStore refresh-token persistence, restore-on-launch), `Login` screen, and an
  `App.tsx` auth gate that builds the connection with `.withToken(idToken)`; added
  `expo-auth-session`/`expo-web-browser`/`expo-secure-store`/`expo-crypto` (SDK-52
  versions) and `scheme: "agentspace"`.
- **Verified on my side:** CI 16/16; mobile typecheck + lint clean; **Android export
  clean** (606 modules, 2.0 MB Hermes). Hit a Node-22.22 type-stripping crash from
  the `plugins` array (Expo `require`s `expo-modules-core` source) → removed
  `plugins` (modules autolink anyway); export then passed.
- Founder asked for a maintained "what I need from you" doc + workflow rule →
  created **`SETUP.md`** (S-1 client_id, S-2 redirect URI, S-3 publish to Maincloud)
  and encoded the `S-n` process in `CLAUDE.md` §1/§4. On-device login → `V-5`.
  Orchestrator service-account auth → `OT-007`.
- **Next:** founder works S-1…S-3 + V-5; AI plans **M1.3** (groups/contacts) or
  **M1.4** (Model Gateway v1).

### 2026-06-13 — M1.4 Model Gateway v1 (AI SDK adapters + BYOK)
- Chose track B (the agent/AI moat) over more chat UI. Filled the `packages/gateway`
  stub in on the **Vercel AI SDK v6** (pinned the real v6 `fullStream` part shapes
  via the installed `.d.ts` — `text-delta.text`, `finish.totalUsage`): provider
  registry (anthropic + openai live; google/openai-compatible inert), `streamText`
  → `GatewayDelta` normalization, `system` hoist, `ToolSpec`→`jsonSchema` (DEC-020).
- BYOK: `src/credentials.ts` — AES-256-GCM `EncryptedKeyStore` + injected
  `CredentialResolver` (+ dev `envResolver`); orchestrator wired with `envResolver()`.
- **Verified headlessly:** CI **16/16**; 16 gateway tests (BYOK crypto round-trip /
  tamper / wrong-KEK; stream normalization + tool-call via `MockLanguageModelV3`).
  Real provider round-trip → `V-6`; provider key → `SETUP.md` S-4.
- **Next:** **M1.5** Agent Studio, then **M1.6** wires `gateway.stream` into the
  orchestrator reply loop (streaming UPDATEs into STDB).

### 2026-06-13 — M1.6 agent reply loop (gateway → streamed STDB reply)
- Closed the agent loop: `modules/spacetime` gained a private `run` table +
  `message.runId` + `agent_reply_begin/append/finish` (client-owned runId; agent-
  membership gated). Rebuilt/published the module locally, regenerated bindings, and
  synced them into `packages/stdb-bindings` + `apps/mobile/module_bindings` (DEC-021).
- Orchestrator `replyLoop.ts` rewrite (gateway-driven + ~50ms coalescing batcher) +
  pure `prompt.ts` helpers; mobile streaming cursor. Fixed the publish flag (`-p`).
- **Verified:** CI 16/16 (6 orchestrator tests incl. batcher/prompt); **local
  headless integration passed** — a mock gateway streamed "Hello, world!" through a
  real local STDB, asserted `streaming`→`complete` + live UPDATEs; Android bundle
  clean (609 modules). Live LLM reply on-device → `V-7`.
- **Next:** **M1.5** Agent Studio (author personas) so users build their own agents
  beyond the seeded default.

### 2026-06-13 — M1.5 Agent Studio (author personas → orchestrator replies as them)
- Resolved the agent-participation fork as **(A) service-identity binding** (DEC-022).
  `modules/spacetime`: `agent` table + `service` singleton + `thread.agentId`; reducers
  `create_agent`/`update_agent`/`delete_agent`/`register_service`/`create_agent_dm`;
  Views `my_agents` + `my_active_personas`. Republished + regenerated/synced bindings.
- Orchestrator: `selectPersona` (pure, tested) drives per-thread prompt+model;
  `main()` registers the service. Mobile: `AgentList` + `AgentEditor` screens, `🤖 Agents`
  nav, agent-DM titles, screen-state navigation in `App.tsx`.
- **Verified:** CI 16/16 (10 orchestrator tests incl. `selectPersona`); **local
  integration** authored "Pirate Pete", deployed, and asserted the mock gateway got the
  persona's system prompt + model; Android bundle clean (2.02 MB). On-device → `V-8`.
- **Next:** **M1.3** (groups/contacts) to close M1, or founder on-device verification.

### 2026-06-13 — M1.3 contacts + group management (+ UI/UX pass; closes M1 build)
- Module: `remove_member`/`set_thread_title` (creator-gated) + `create_dm` dedupe;
  republished + regenerated/synced bindings; **verified live via `spacetime call`**
  (rename changed the title; add/remove member worked; creator-gate held).
- Mobile: reusable `UserPicker` (directory search over the public `user` table) for
  **New chat** + group **Add member**; `ThreadMembers` (add/remove/rename/leave);
  `App.tsx` nav + open-or-create-DM flow. **UI/UX:** `Avatar` (color-from-identity +
  presence ring), `ThreadList` inbox (last message, relative time, activity sort, FAB,
  name nudge), `Thread` avatar header + auto-scroll + agent bubbles; design tokens in
  `chat.ts` (DEC-023). Founder asked for the world-class pass; deeper polish → BL-016.
- **Verified:** CI 16/16; Android bundle clean (2.05 MB). On-device → `V-9`.
- **Next:** **M1 milestone-close** (drift sweep + re-snapshot + tag), then M2.

### 2026-06-14 — M1 milestone-close: drift sweep + re-snapshot (+ M1 retro)
- Ran the mandatory drift sweep (`.audit/sweep-2026-06-14.md`): **no `[critical]`**;
  4 `[important]` doc-only findings (F-1 README stale at M0; F-2 BLUEPRINT §2 omits
  `stdb-bindings`; F-3 VERIFICATION V-1 describes the retired probe + deprecated flag;
  F-4 BLUEPRINT §3 lists `provider_keys` as a current table) + a few `[nice]`. Cataloged
  only — founder routes (§7/§10). Re-snapshotted MEMORY + ROADMAP; **tag held**.
- **M1 retro.** Shipped six phases in one session (PRs #8–#13): chat, OIDC login,
  Model Gateway+BYOK, agent reply loop, Agent Studio, contacts/groups+UX — the whole
  build-an-agent→converse North-Star loop. **Worked well:** plan-per-chunk → headless
  verification (CI + local-STDB integrations + `spacetime call`) → AI-merge-on-green;
  the `SETUP.md`/`VERIFICATION.md` ledgers kept founder-side work batched without
  blocking; per-PR code-reality updates kept drift tiny (sweep found only doc hygiene).
  **Friction:** the `spacetime` CLI flag (`-p` not `--project-path`) and a Node-22.22
  type-stripping crash from Expo config plugins — both fixed. **The one open risk:**
  nothing is on-device-verified yet (V-1…V-9) — the most valuable next action is the
  founder's verification batch.
- **Next:** founder routes F-1…F-4 + runs V-checklist → tag `M1 [shipped]`; then M2 /
  BL-016 / M3.

### 2026-06-14 — M1.7 per-user BYOK (Option A: client-encrypt → ciphertext via STDB)
- Built the real BYOK path (DEC-025): module `provider_key` + `service.encPubKey` +
  `set_provider_key`/`delete_provider_key` + views `service_info`/`my_provider_keys`/
  `my_persona_keys`; republished + regenerated/synced bindings. Orchestrator `byok.ts`
  (`tweetnacl` keypair persistence + seal/open + `createByokResolver`); `main()`
  publishes the pubkey + wires the BYOK gateway; reply loop passes
  `credentialRef = owner:provider` + surfaces missing-key errors in chat. Mobile
  `byok.ts` (`sealForOrchestrator`) + `ApiKeys` screen (🔑 Keys) + nav. Founder also
  routed fix-all earlier (PR #16) + wired the SpacetimeAuth client_id (PR #15).
- **Verified:** CI 16/16 (14 orchestrator tests incl. seal/open + resolver); **headless
  integration** proved the full path (user seals `sk-test-byok-123` → STDB holds only
  ciphertext → orchestrator decrypts the exact key → persona replies); Android bundle
  clean (632 modules, 2.12 MB with `tweetnacl`). On-device → `V-7/V-8`.
- **Next:** **all M1 build phases done.** Founder S-3 (Maincloud publish) + on-device
  V-checklist (V-5/V-7/V-8 on the real BYOK path) → tag `M1 [shipped]`; then M2 / M3 /
  BL-016 / BL-011.

### 2026-06-14 — Doc: SpacetimeDB credentials & secrets model (DEC-026)
- Founder asked why there's no SpacetimeDB API key/credential for `.env` or GitHub
  Secrets. Answered (identity-based, not key-based — no committed secret) and, at the
  founder's request, captured it durably: new **BLUEPRINT §8.1** (three identity-token
  paths + the no-`.env`/CI-secret posture) + **DEC-026** + a SETUP.md pointer. Doc-only.
- **Next:** unchanged — founder S-3 + on-device V-checklist → tag `M1 [shipped]`.

### 2026-06-22 — S-3 done: module published to Maincloud (+ doc gap fixed)
- Founder published `modules/spacetime` to Maincloud **`agentspace-hpm58`** (db identity
  `c200c0eea8579360068efe51acaffc85ee5e216ecea5226810a91de45387b15d`; all **8 tables + 8
  views** per the migration plan). Founder CLI **2.6.0** (newer than our 2.5.0 build target;
  published cleanly). **S-3 marked `[x]`.**
- **Doc gap fixed:** S-3 omitted the `pnpm install` prerequisite — the first publish failed
  `Could not resolve 'spacetimedb/server'` / `tsc not found` (deps not installed). Added a
  REQUIRED "install deps" step to S-3 + flagged the benign `tsc not found` /
  `verbatimModuleSyntax` warnings (the build succeeds after them). The founder's stray
  `pnpm install` from inside `modules\spacetime` was harmless — pnpm is workspace-aware
  (installs to the repo-root `node_modules`; nothing to clean up, `node_modules/` gitignored).
- **Next:** founder runs **S-5** (orchestrator vs Maincloud) + enters a key in 🔑 Keys →
  on-device **V-5/V-7/V-8** → tag `M1 [shipped]`. S-4 optional.

### 2026-06-14 — SETUP.md → Windows 11 / PowerShell (founder's local env)
- Founder's machine is **Windows 11** (Lenovo Legion 7i Slim, RTX 4070). Rewrote SETUP.md
  commands for **PowerShell**: CLI install `iwr https://windows.spacetimedb.com -useb | iex`
  (S-3); S-5 env vars as `$env:VAR = "…"` lines (the bash inline `VAR=val cmd` form doesn't
  work in PowerShell); `Copy-Item` for the env-file copy; `$env:` note for the S-4 key;
  macOS/Linux forms kept in parentheses. Added a "local environment" banner (noted the
  RTX 4070 is unused today — cloud BYOK does inference; local GPU models are post-v1,
  DEC-009/OT-006). **Confirmed S-1 + S-2 already done** (founder gave client_id
  `client_033XyhtPkMcEQ4adazN6Cx`, redirect `agentspace://redirect`, login field blank =
  public client) — already ticked since PR #15; no change. Doc-only.
- **Next:** founder runs **S-3** (publish, now Windows-ready) → **S-5** + on-device
  V-5/V-7/V-8 → I tag `M1 [shipped]`.

### 2026-06-22 — Doc: orchestrator hosting model (DEC-027)
- Founder asked if the orchestrator could run on-device/edge or as Vercel serverless. Explored
  the runtime (persistent stateful Node subscriber) + the central-by-design module, then
  ratified **central always-on for v1** (cheap free-tier container) with three future modes
  captured as **BL-017** (phone on-device — same device, tier-gated, foreground-only),
  **BL-018** (desktop self-host — user's PC/GPU + Ollama), **BL-019** (event-driven serverless).
  Wrote **DEC-027**, a **BLUEPRINT §4.1** deployment-topology subsection, the BACKLOG items, a
  ROADMAP §5 note, and narrowed **OT-005** to the specific-host choice. Clarified there's **no
  Windows app** (Windows = dev machine; product = Android, DEC-005). Doc-only.
- **Next:** unchanged — founder runs **S-5** + on-device V-5/V-7/V-8 → tag `M1 [shipped]`.

### 2026-06-22 — Handoff to a LOCAL session for on-device V-7/V-8
- The remote (cloud) container can't run the orchestrator as `blokzdev`/Maincloud or drive
  Android, so we're switching to a **local Claude Code session in `E:\Cloud\AgentSpace`** to do
  **S-5 + on-device V-5/V-7/V-8** (incl. Android-toolchain detect/setup). A full handoff prompt
  was delivered in chat (bootstrap → headless integration → orchestrator vs Maincloud → Android
  emulator/device → drive V-7/V-8; guardrails: founder ticks V-items, Memory Protocol at close).
  **BYOK clarity (founder asked):** the provider key is entered **only in the app's 🔑 Keys**
  surface (sealed → ciphertext in STDB → orchestrator decrypts in-memory) — the orchestrator
  reads **no `.env` key**. The `.env` `ANTHROPIC_API_KEY` is **only** the optional standalone
  gateway smoke (V-6), not part of V-7/V-8 or the M1 tag. Also fixed two founder-facing doc gaps
  the founder hit live: S-5 now
  requires `pnpm run build` (#23, the gateway `dist/` ERR_MODULE_NOT_FOUND), and V-7/V-8 now use
  the in-app BYOK path, not the stale `.env` key (#24). PRs #20–#24 all doc-only, merged.
- **Next (LOCAL session):** bootstrap (read this file + CLAUDE.md), run the headless integration,
  start the orchestrator vs Maincloud, stand up the Android emulator/device, drive V-7/V-8 with
  evidence (logs + screenshots); propose ticking V-5/V-7/V-8 → founder tags `M1 [shipped]`.

### 2026-06-22 — M1.8.1: provider catalog + 13 single-key cloud providers
- Built Phase M1.8.1 (DEC-028): shared **`PROVIDER_CATALOG`** (single source) + `providerInfo()`;
  `MODEL_PROVIDERS` 4→14. Gateway `providers.ts` now has live factories for **13 single-API-key
  providers** (anthropic, openai, google, mistral, cohere, groq, xai, deepseek, perplexity,
  togetherai, fireworks, deepinfra, cerebras) — all on `@ai-sdk/provider@3` (V3 spec) via new
  `@ai-sdk/*` deps. Mobile: `AgentEditor` provider grid + curated model-suggestion chips + a
  "no key → 🔑 Keys" hint (new `onApiKeys` nav); `ApiKeys` renders all catalog providers
  configured-first with "Get a key →" links — both now **import the catalog from
  `@agentspace/shared`** (added as a mobile dep; BLUEPRINT §2 allows `shared ◀ mobile`).
- **Verified:** `pnpm run ci` green (16/16; gateway 18 / shared 4 tests incl. per-provider
  factory coverage + catalog integrity); Android export clean (633 modules). **No STDB change**
  (free-form strings). Live non-anthropic round-trip = `V-10`.
- **Next:** **M1.8.2** (local/openai-compatible `baseUrl`) then **M1.8.3** (multi-cred), as
  separate PRs; then the local session resumes V-7/V-8.

### 2026-06-22 — M1.8.2: local / openai-compatible provider (per-agent baseUrl)
- Built Phase M1.8.2 (DEC-028): the **first STDB change** of M1.8 — appended **`agent.baseUrl`**
  (column at the **end** to avoid a reorder migration), threaded through `create_agent`/
  `update_agent`, **rebuilt + regenerated + synced bindings** to all 3 locations. Gateway:
  generalized `ProviderFactory` → `(credential, model, opts?:{baseUrl?})`, added
  `createOpenAICompatible` (`@ai-sdk/openai-compatible`), `GatewayRequest.baseUrl`. Orchestrator:
  `selectPersona`/`AgentRef`/`Persona` carry `baseUrl`; `replyLoop` passes it + guards an empty
  baseUrl with a friendly error; `createByokResolver` resolves a **keyless** `openai-compatible`
  to `''`. Mobile `AgentEditor`: a **Base URL** field appears for the local provider (curated
  Ollama models: llama3.2/qwen2.5/…). Catalog entry `kind:'baseUrl'` + `defaultBaseUrl`.
- **Verified:** `pnpm run ci` green (16/16; gateway 19 / orchestrator 16 incl. local-factory +
  keyless-resolver + baseUrl-propagation tests); **headless integration re-passed on the new
  schema** (published locally with `--delete-data`; Pirate Pete replied + BYOK decrypt); Android
  bundle clean (633 modules). **Founder action (one-time):** re-publish the module to Maincloud
  with `--delete-data=on-conflict` for the new column (V-11). Emulator needs no GPU (Ollama on host).
- **Next:** **M1.8.3** (multi-credential Bedrock/Azure/Vertex — sealed-JSON, no schema change).

### 2026-06-22 — M1.8.3: multi-credential providers + PROVIDERS.md (M1.8 complete)
- Built Phase M1.8.3 (DEC-028): **Bedrock / Azure / Vertex** via `@ai-sdk/amazon-bedrock`/
  `azure`/`google-vertex`. Catalog entries `kind:'multi'` with a **`fields` spec**; the gateway
  factory `JSON.parse`s the sealed credential straight into the SDK settings. **No `provider_key`
  schema change, no orchestrator change** — the sealed blob is just a JSON string the resolver
  returns and the factory parses. Mobile `ApiKeys` gained a **Multi-credential providers**
  section (a field form per provider → seal `JSON.stringify`). The gateway now spans **16
  providers** from one `PROVIDER_CATALOG`.
- **New `PROVIDERS.md`** (founder-requested): per-provider get-a-key steps across all 3 tiers
  (cloud / local-Ollama / multi-cred) + "providing keys to the AI" + the security posture;
  registered in the CLAUDE §1 doc-graph + §9 layout.
- **Verified:** `pnpm run ci` green (gateway **20** tests incl. multi-cred-factory-from-JSON +
  catalog integrity over 16 providers); Android bundle clean. Live multi-cred round-trip = `V-12`
  (optional). **M1.8 COMPLETE** (all 3 phases). **Next:** update + output the handoff prompt →
  founder switches to the local session.

### 2026-06-22 — Local session: on-device V-5/V-7/V-8 (6 fixes) + PRs #29/#30
- Ran the local-session handoff on Windows: synced + CI green; **re-published the module to
  Maincloud** (`agentspace-hpm58`, `--delete-data` for the new `agent.base_url` column); headless
  BYOK integration passed on a local server; stood up the orchestrator vs **Maincloud**; built and
  ran an **Android dev build** on the Pixel_8 emulator (toolchain already present — adb v36, AVDs,
  Android Studio **JBR 21**; no large installs).
- Drove the app via adb (taps + `uiautomator` for exact bounds; downscaled screenshots to fit the
  image limit) and found+fixed **6 on-device bugs** (DEC-029) — entrypoint `main()`, Kotlin
  1.9.24 pin, reverse-DNS OIDC scheme, **`Promise.withResolvers` polyfill** (silently broke every
  reducer write), safe-area, prompt user-last/complete-filter — plus the `ANTHROPIC_BASE_URL`
  env-var gotcha (the Claude-Code harness sets it to `…/` without `/v1`, 404'ing Anthropic;
  cleared it when launching the orchestrator). Merged **#29** (entrypoint) and **#30** (the rest);
  CI green (orch 17 tests).
- **Result:** "Pirate Pete" streams pirate-speak replies via the founder's BYOK Anthropic key on
  Maincloud — **V-5/V-7/V-8 proven on-device** (evidence: logs + screenshots; founder ticks). Found
  **OT-004** is real on-device: long replies dangle the cursor (delivery drops the tail of rapid
  cumulative-text UPDATEs); short/medium settle clean; mitigated + scoped full fix to M2.3.
- **Next:** founder ticks V-5/V-7/V-8 → tag `M1 [shipped]`. Optional remaining: **V-10** (free-tier
  cloud key), **V-11** (Ollama). Then M2 / M3 / BL-016 / BL-011.

### 2026-06-22 — M1 ✓ SHIPPED (milestone close) + next = streaming hardening
- Founder-authorized **ticking V-5/V-7/V-8** (evidence captured this session) and **tagged M1
  `✓ SHIPPED (2026-06-22)`** in ROADMAP + Snapshot. Focused close — code-reality was reconciled
  per-PR all session, so no separate drift sweep; the one carried item is **OT-004**.
- **M1 retro.** From a fresh container with everything green-but-headless, this local session
  put the whole **build-an-agent → BYOK-converse** loop on a real device for the first time. What
  worked: methodical on-device driving (adb + `uiautomator` bounds + downscaled screenshots) and
  treating each failure as a real bug — six fell in sequence (entrypoint, Kotlin pin, reverse-DNS
  OIDC, `Promise.withResolvers` polyfill, safe-area, prompt user-last), each only visible on-device.
  Friction: PowerShell heredoc/quoting (use `-F` message files), the image-size cap (downscale), the
  hardware-BACK-exits-app trap (scroll, don't BACK), and the `ANTHROPIC_BASE_URL` harness env. The
  one substantive unknown that surfaced is **OT-004** (streaming delivery), now the next chunk.
- **Founder decision (sequencing):** do **streaming hardening (OT-004) next as `M1.9`** — before
  M2's multi-agent groups, which would multiply streaming load on an unhardened substrate. Fix =
  delta-streaming (append-only INSERTs vs growing-row UPDATEs) + backpressure/cancellation/lifecycle.
- **Next session (local):** re-sequence ROADMAP (insert M1.9 / pull M2.3 forward) in Plan Mode, then
  build + on-device-verify the delta-streaming fix vs Maincloud. Handoff prompt delivered in chat.

### 2026-06-22 — M1.9 streaming hardening built (delta-streaming + run lifecycle; DEC-030)
- Plan Mode: mapped the streaming surface with a parallel-readers workflow, re-sequenced ROADMAP
  (M1.9 absorbs old M2.3; M2.4→M2.3). Founder ratified **full M2.3 scope** + **GC-on-finish**.
- Built **M1.9.1 delta-streaming** (fixes OT-004): `modules/spacetime` gained a private
  `reply_delta` table + `my_reply_deltas` View + `agent_reply_delta` reducer; `agent_reply_finish`
  GCs the run's deltas; the `message` row is empty while `streaming`. Regenerated + synced bindings
  ×3. Orchestrator `createBatcher` flips to delta-accumulate (~100ms + soft byte cap); `replyLoop`
  emits `agentReplyDelta` with a per-flush `seq`; mobile `Thread.tsx` concatenates `my_reply_deltas`
  by `seq`, falls back to `message.text`. And **M1.9.2 lifecycle**: idle/error timeout (60s →
  terminal `failed`), cancellation-on-supersede (`AbortController` → `GatewayRequest.signal` →
  `streamText.abortSignal`; new `agent_reply_cancel` → message `failed` + run `cancelled`; per-thread
  in-flight `Map`).
- **Verified headlessly:** `pnpm run ci` 16/16; **24 orchestrator tests** (delta-batcher / seq /
  bounded-flush / happy·timeout·error·cancel via `handleReply`); the rewritten integration ran
  against a **local STDB** (published with `--delete-data` for the new schema) and proved delta
  order + concatenation + **GC** + cancellation + BYOK decrypt (no key); Android export clean (645
  modules). Updated docs in-PR: ROADMAP / SPEC §1·§2·§6 / BLUEPRINT §3·§5 / CLAUDE §9 / VERIFICATION
  (V-13/V-14) / SETUP.
- **Next:** open the M1.9 PR → CI green → merge; then on-device V-13 (long reply settles clean, no
  dangling cursor) + V-14 (cancellation) vs Maincloud (re-publish with `--delete-data`).

### 2026-06-23 — M1.9 merged (#33) + Maincloud verification; on-device render handed to founder
- Merged **PR #33** (M1.9 streaming hardening) on green CI (16/16). Synced `main`.
- **Maincloud re-published** with the new `reply_delta` schema — additive migration, so
  `--delete-data=on-conflict` was a **no-op** (existing data, incl. Pirate Pete + the founder's
  sealed key, survived — good).
- **Maincloud verification (headless, no key):** the rewritten integration passed vs Maincloud
  (delta order + GC + cancellation). A throwaway **long-reply probe** then streamed a **4949-char
  reply as 36 deltas in `seq` order with NO gaps**, settled `complete` with the full text, and GC'd
  — **no tail-drop** over real Maincloud latency. This is the definitive OT-004-fix proof.
- **Emulator drive (Pixel_8):** installed dev-client loads the M1.9 JS (pure-JS change, served via
  Metro — no native rebuild) and connects to Maincloud with **no JS errors**. Saw the *historical*
  OT-004 bug frozen in the data (old pre-M1.9 long replies stuck `streaming` with dangling `▍`).
  **Could not complete the live render tap-through** — Metro dev-client instability (subscription
  flapping, "Cannot connect to Metro" reconnects resetting navigation, anonymous-login not
  persisting across force-stop) + adb friction (Git-Bash mangling `/sdcard/...`, screencap↔
  uiautomator desync) made UI automation unreliable. **Not an M1.9 defect** (app runs clean). Left
  the emulator running; V-13/V-14 render confirmation is the founder's quick tap-through.
- **Memory/docs:** Snapshot refreshed; VERIFICATION V-13/V-14 got AI-evidence annotations (mechanism
  proven; live render = founder). Cleaned up throwaway scripts + background processes.
- **Next:** founder ticks V-13/V-14 after the on-device render check. Then **M2** (multi-agent
  groups, BL-014) — the hardened streaming substrate is ready for it. Also **M3** (RAG) / BL-016 / BL-011.

### 2026-06-23 — M2 multi-agent: deep research + comprehensive plan (DEC-031; no code)
- Founder asked to explore + research + comprehensively plan the next milestone. Discovered M1.9 was
  already shipped (#33/#34) between sessions, so the target is **M2 (multi-agent group threads)**.
  Ground-truthed the single-agent model first-hand (singular `thread.agentId`; `my_persona_keys`/
  `selectPersona`/`my_active_personas` all read it; one `inFlight` per thread; `isAgent` from the shared
  `self` identity; SPEC §3 already specs `@mention` addressing + a per-trigger run budget; BL-014 = the
  per-agent-identity backlog).
- Ran an **8-agent research+adversarial workflow** (codebase map + 4 web-research angles → candidate
  designs → adversarial review → synthesis; ~785k subagent tokens). Saved all 8 outputs to
  **`.audit/m2-research-2026-06-22/`**. Verified the synthesis's load-bearing claims against real code
  (esp. the **persona-bleed showstopper**: shared identity makes `isAgent` true for every agent).
- **Decision DEC-031 (founder-ratified):** **Candidate C** — persona-tagged single connection +
  **reducer-enforced episode budget**; defer per-agent identities to **M2.4/BL-014**. Founder set the
  dials (conservative+configurable), agent→agent **off by default**, `@mention`-only MVP, identity =
  fast-follow. Persisted the plan: **ROADMAP M2 expanded** (phases + MVP + 11 guards + V-15…V-20),
  **SPEC §3 refined** (structured `mentions` + episode budget), **BL-014→M2.4** + new **BL-020** (router/
  metering/visibility deferrals), Snapshot updated. **Doc/plan-only — no module/orchestrator/mobile code.**
- **Next:** build **M2.1** (the addressed-only, episode-budgeted MVP — the existential core) in a fresh
  session; tight handoff prepared. Guards 1–11 (the whole safety+correctness system) are all net-new and
  block any multi-agent ship.

### 2026-06-23 — M2.1 built: multi-agent group threads MVP (DEC-032)
- Built **M2.1** end-to-end across module ↔ bindings ×3 ↔ shared/gateway/orchestrator ↔ mobile, in
  phases A–F. Led with the two highest-risk pieces: the **tag-based `isAgent`** showstopper (`prompt.ts`,
  pure unit-tested first) and the **reducer-enforced episode budget** (`agent_reply_begin`). Re-published
  to local with `--delete-data=on-conflict` (new tables = breaking schema) and synced bindings to all 3
  surfaces.
- **My-side verification (all green):** `spacetime build` confirmed the novel schema mechanisms compile in
  CLI 2.6.0 (the `Mention` `t.object` struct, the `t.array` column, the scheduled reaper — no fallback
  needed); **CI 16/16**; 35 orchestrator + 22 gateway + 8 shared unit tests; the rewritten
  **`integration.ts` Scenarios A–F all pass** — incl. **D (agent↔agent volley TERMINATES — exactly 2
  replies)** and **F (the reducer REFUSES a duplicate agent turn, independent of orchestrator memory)**.
- **Notable build findings (DEC-032):** the SDK surfaces a refused reducer as a **rejected promise**, so a
  fire-and-forget budget refusal crashed the loop → now **await `begin` + skip cleanly on refusal** (also
  saves the gateway call). Episode-first `send_message` ordering so `episodeId` is set on the message's
  first insert. `agent_turn` gives a **structural** ≤#agents volley bound. `create_agent_dm` writes a
  `thread_agent` row so DMs+groups share one persona path.
- **Next:** open the PR, watch CI to green, squash-merge. Then the founder runs **V-15…V-19** on-device
  (needs the Maincloud `--delete-data` republish — new SETUP S-item) → then **M2.2** (presence/typing).
  Deferred to backlog: other users' agent names in the mobile UI; per-(agent,thread) cooldown enforcement.

### 2026-06-23 — M2.1 merged (#36) + real-model headless verification of V-15…V-19
- Merged M2.1 (**PR #36** → `c6cdf2f`); CI green. Founder completed **SETUP S-6** (Maincloud republish with
  `--delete-data=on-conflict`); the regenerate "error" was a benign `tsc-not-found` warning + EOL-only churn
  (the committed bindings already match the new schema).
- Founder provided a real Anthropic key and asked to **verify V-15…V-19 via emulator**. The on-device UI +
  SpacetimeAuth login are not AI-reachable (no account credentials; V-15 needs two logins; no emulator was
  running), so I verified the **behavioral substance with the REAL model** headlessly
  (`services/orchestrator/scripts/verify-realmodel.ts` + `verify-reaper.ts`; key in a gitignored `.env`):
  **V-15** two distinct voices, tagged + in mention order, no bleed; **V-16** an agent↔agent volley
  **terminated at exactly 2 replies / 319 real tokens** (the model tried to continue — `agent_turn` stopped
  it); **V-17** `@everyone` each agent once; **V-18** the reaper failed out a stuck stream after **165s**;
  **V-19** the real key sealed→decrypted→real reply. Evidence recorded under each item in `VERIFICATION.md`
  (the `[ ]` ticks stay the founder's — the on-device render + the Maincloud real-key run remain theirs).
- **Next:** founder runs the on-device V-15…V-19 (UI render + login) when convenient and **rotates the
  shared key**; then **M2.2** (presence/typing). Dials held at the DEC-031 defaults (tune after on-device V-16).

### 2026-06-23 — On-device emulator drive: corrected the anon-login error; local-dev path added (BL-022)
- Founder pushed back: in a prior session I drove the emulator via **anonymous SpacetimeAuth login**, so my
  "on-device is blocked without your account" claim was wrong. **Confirmed it: drove the Pixel_8 via adb** —
  "Sign in with SpacetimeAuth" → the hosted page's **"Anonymous login"** → "Authorize → Allow" → connected,
  no credentials. Reached the inbox, entered the BYOK key (**✓ key set**), and the full M2.1 UI rendered:
  AgentEditor + the **`respondsToAgents` toggle**, AgentPicker (distinct per-agent avatars + exclude-added),
  the members screen, the **@mention typeahead** (everyone/Marina/Lyric), the composer. Sent `@Marina @Lyric …`.
- The app's Maincloud socket kept dropping → **stuck "Connecting…"** (BL-022). Founder suggested **testing
  against a local `spacetime start` server** (loopback = stable) and pushing verified work to Maincloud.
  Implemented a small affordance: **local host ⇒ anonymous connect (no OIDC); Maincloud ⇒ SpacetimeAuth**
  (`App.tsx` `LOCAL_DEV` + a persisted local anon token via `LocalDevTokenSync`). Against local the app
  connected **instantly and stayed stable through the whole flow** — the founder's idea worked.
- **On-device behavior CONFIRMED via the local DB** (episode 19): `@Marina @Lyric …` → **both agents replied,
  tagged by agentId (Marina=12 factual, Lyric=13 rhyme), both runs succeeded, turns 8→6** — exactly M2.1.
  **Marina's reply rendered correctly** (green avatar, "Marina", factual — no bleed). The live render of the
  2nd bubble stalled (subscription froze after the first agent's deltas — **BL-022**, the dev-client/connection
  resilience gap), so the 2-bubble shot wasn't captured live, but the DB proves the full behavior.
- The **release-APK** path (more stable, no Metro) got past the SDK-path fix (needs `android/local.properties`
  `sdk.dir`) but **fails JS bundling** (`createBundleReleaseJsAndAssets` → `export:embed` can't resolve
  `../../index.ts` under pnpm-hoisted + package-exports — BL-009-adjacent). Personal memory
  [[android-emulator-automation-gotchas]] updated.
- **Next:** BL-022 (auto-reconnect) is the real reliability fix — promote to an M2.x on-device-hardening phase;
  then the live multi-bubble render + the founder's remaining on-device V-ticks are trivial. Then M2.2.

### 2026-06-23 — License & visibility posture: stay public + Apache-2.0 (DEC-033)
- Founder weighed going **private** to save CI minutes. Clarified: the repo is **public**, so Actions is
  **free/unlimited** (the 2,000-min/mo cap is private-only), and on Free a **private** repo would **lose
  branch protection** (Pro $4/mo) — silently dropping the §6 merge gate. **No cost reason to go private.**
- Founder then asked whether a **public** repo can be monetized + where to track "going private." Answer:
  monetization is fully compatible with public (hosted SaaS / open-core / dual-license; the moat is the
  running service, not the source), and the protective lever is the **license now**, not the visibility
  toggle later (going private can't recall already-public commits). **Ratified: stay public + Apache-2.0.**
- Shipped (this commit, branch `chore/apache-2.0-license`): root **`LICENSE`** (Apache-2.0) + **`NOTICE`**
  (© 2026 blokzdev); `"license": "Apache-2.0"` in all 7 workspace `package.json`s; a README license badge +
  **## License** section; **DEC-033**; **BL-023** (revisit license/visibility at a launch gate); a CLAUDE §9
  tree entry. `examples/chat-react-ts` left under its upstream template license. `pnpm run ci` green; PR → merge.
- **Next (founder's call):** **BL-022** (auto-reconnect on-device hardening) · **M2.2** (presence/typing) ·
  or the remaining on-device **V-15…V-19** ticks. (Founder still to **rotate** the shared Anthropic key.)

### 2026-06-23 — M2.5 on-device connection resilience (auto-reconnect; BL-022 → DEC-034)
- Founder said "lead the way" after the license ship. Led with **BL-022** over M2.2/V-ticks because it's a
  **verified on-device defect** (a dropped socket stranded the app / killed the orchestrator) that gates every
  V-15…V-19 session — harden the substrate first.
- Plan-mode ratified (M2.5 numbering accepted). Verified the SDK has **no auto-reconnect** by reading its
  source (`ConnectionManager` caches by `(uri,moduleName)`; a same-tick remount reuses the dead socket) — which
  dictated the **unmount-to-evict** gate design.
- Shipped on branch `feat/m2.5-reconnect-resilience`: shared `nextBackoff` + `reconnectReducer`; orchestrator
  `supervise.ts` (`runOrchestrator`, never exits) + `spacetime.ts` `onDisconnect`; mobile `reconnect.tsx`
  (`ConnectionGate`/`ConnectionWatch`/`AppState`) + `auth.ts` `refresh()`; integration **Scenario G**. Docs
  same-commit: ROADMAP M2.5 box, BACKLOG BL-022 promoted, CLAUDE §9, VERIFICATION V-21/V-22, SETUP **S-7**
  (rotate Anthropic key), README Status refresh, DEC-034 + this entry + Snapshot.
- **No module/schema change → no republish.** CI 16/16 (12 shared + 38 orchestrator unit tests incl. 3
  supervisor); Android bundle clean (2.18 MB). Founder authorized using the real Anthropic key in local test
  loops (reminder: rotate → **S-7**).
- **Next:** founder runs **V-21/V-22** (reconnect — *no* republish) + the pending **V-15…V-19** (needs S-6).
  Build: **M2.2** (presence/typing) next.

### 2026-06-23 — M2.2 agent presence & typing (DEC-035) + S-6 confirmed
- Founder reported the **S-6** Maincloud republish done + asked to verify → ran `spacetime describe --server
  maincloud agentspace-hpm58 --json`; the live schema has `thread_agent`/`episode`/`agent_turn`/
  `reaper_schedule`/`reap_stale_runs`/`responds_to_agents`. **S-6 ✓ (founder-done, AI-verified); V-15…V-19
  unblocked.** Folded the S-6 tick into this PR's docs.
- Planned M2.2 thoroughly: 2 Explore sweeps confirmed it's **pure mobile, no schema change** (M2.1 already
  shipped a minimal "{name} is thinking…"; the real gap was the inbox + animation). Plan-mode ratified.
- Shipped on branch `feat/m2.2-presence-typing`: shared `thinkingLabel`; mobile `TypingDots` + `Avatar`
  pulse; `Thread.tsx` header subtitle + animated per-row; `ThreadList.tsx` inbox "🤖 {who} is thinking…".
  Docs same-commit: ROADMAP M2.2 ✓, CLAUDE §9, BACKLOG **BL-024** (human typing / per-agent presence),
  VERIFICATION **V-23**, SETUP **S-6 ✓**, DEC-035 + this entry + Snapshot.
- CI 16/16; Android bundle clean. **Next:** founder runs V-23 (+ the now-unblocked V-15…V-19, V-21/V-22).
  Build: **M2.3** (multi-party context isolation + NL "Hey {name}," address) next.

---

## Open Threads

> Unknowns awaiting an answer or decision. Resolve by linking a `DEC-` entry.

- **OT-001** — *AgentSpace project brief.* ✅ Resolved by DEC-004 (brief received,
  North Star set).
- **OT-002** — *SpacetimeDB module language.* ✅ Resolved by DEC-007 (TypeScript;
  access control via Views).
- **OT-003** — *React Native ↔ SpacetimeDB TS-SDK compatibility.* **[gate pending
  only]** Static analysis (DEC-012) **and** a clean Android Metro bundle (DEC-014,
  M0.2b) cleared the build/resolution risk. Sole remaining item: the live
  on-device connect — tracked as **`VERIFICATION.md` V-1** (founder-owned). Not
  blocking forward work.
- **OT-004** — *Streaming write cadence & cost.* ✅ **Resolved by DEC-030 (M1.9, 2026-06-22).**
  Root cause: `agent_reply_append` re-sent the **full cumulative text** every flush (~150+ growing
  row UPDATEs for a long reply), and over Maincloud's latency the client subscription **tail-dropped
  the burst**, dangling the cursor. Fix: **append-only `reply_delta` INSERTs** (small, constant-
  size, reliably delivered) — the `message` row takes only an empty begin + a single final
  `complete` write; client concatenates deltas by `seq`; deltas GC'd on finish. Shipped with the
  rest of the old M2.3 (idle/error timeout + cancellation-on-supersede). Headless-verified;
  on-device = V-13/V-14. *(Per-token metering off deltas = M5.3; durable delta retention is N/A —
  GC'd by design.)*
- **OT-005** — *Hosting & data stores.* The orchestrator **hosting model is now decided —
  central always-on (DEC-027)**; OT-005 narrows to the **specific** choices: SpacetimeDB host
  (Maincloud Pro vs self-host), the **specific** orchestrator host (Fly/Railway/Render/
  Maincloud-managed/micro-VM), and the Postgres/pgvector provider. Unblocks: M0 infra / M3 RAG.
  (Pricing/limits cited in research are reported-not-verified.) Also owns the **durable BYOK
  key store**: M1.4's gateway uses an in-memory AES-256-GCM store under an env KEK; the
  Postgres/KMS backing (`provider_keys.secret_ref`) lands with this decision (DEC-020/BL-011).
  Future orchestrator modes (on-device/desktop-self-host/serverless) = BL-017/018/019.
- **OT-006** — *Local model structured output.* OpenAI-compatible local providers
  lack the AI SDK's structured-output mode; decide the validation/JSON-repair
  strategy for local agents. Unblocks: M5.
- **OT-007** — *Orchestrator service-account auth.* The orchestrator still uses a
  persisted anonymous token (DEC-017); interactive SpacetimeAuth OIDC (DEC-019)
  doesn't fit a headless service. Decide the real grant (SpacetimeAuth
  client-credentials / a long-lived service token) and wire it. Unblocks: trusted
  agent identity in production. Likely alongside M1.6 (orchestrator reply loop).

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
- **SETUP.md / `S-n`** — founder-owned ledger of external setup only the human can
  do (register apps, dashboards, credentials); setup twin of `VERIFICATION.md`.
- **SpacetimeAuth** — SpacetimeDB's hosted OIDC provider (issuer
  `auth.spacetimedb.com/oidc`); the app's login source of identity (DEC-019).
