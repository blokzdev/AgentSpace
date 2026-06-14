# MEMORY.md — AgentSpace Durable Memory Ledger

> The continuity ledger. The dev container is ephemeral; this committed file is
> how context survives across sessions. **Read this first every session.**
> Governed by the Memory Protocol in `CLAUDE.md` §3.
>
> - **Snapshot** & **Open Threads** are mutated in place (current state).
> - **Decision Log** & **Session Journal** are append-only (history is the value).

---

## Snapshot — where we are right now

*Last refreshed: 2026-06-14.*

**M0 closed; all six M1 build phases shipped; milestone-close in progress.** Merged
PRs #2–#13. AgentSpace is a working app: sign in (SpacetimeAuth/OIDC, M1.2) → find
people by name + DM/group chat (M1.1/M1.3) → author AI agents (Agent Studio, M1.5) →
the orchestrator streams real LLM replies into chat as the bound persona (Model
Gateway M1.4 + reply loop M1.6). Every layer is verified **headlessly** (CI 16/16 +
real-local-STDB integrations + `spacetime call` reducer checks); **nothing has run
on a device yet**. **M1.7 per-user BYOK shipped (this branch, DEC-025):** users enter
their own provider key in a 🔑 Keys screen; it's **box-sealed client-side** to the
orchestrator's pubkey and stored as **ciphertext only** in `provider_key` (raw key never
in STDB); the orchestrator decrypts per-(owner,provider) in-memory. Proven headlessly
end-to-end + 14 orchestrator tests; CI 16/16. So **all M1 build phases (M1.1–M1.7) are
done.** **`M1 [shipped]` tag HELD** only on the on-device V-checklist (esp. V-7/V-8 on
the real BYOK path).

- **Active branch:** `claude/agentspace-initial-setup-w8rx3n`.
- **Stack:** RN + Expo (SDK 52) · SpacetimeDB (TS module) · Node/TS Orchestrator +
  Vercel-AI-SDK v6 Model Gateway (AES-256-GCM BYOK) · (Postgres + pgvector for M3 RAG).
  pnpm `node-linker=hoisted` (DEC-014). Autonomous loop (DEC-013/016).
- **Open founder work:** S-1/S-2 **done** (client_id wired + validated, PR #15);
  **S-3** (Maincloud publish — AI is 401-blocked, founder runs it) + **S-4** (interim
  key) pending → unblock V-5/V-6. The full on-device batch (V-4/V-5/V-7/V-8/V-9) ideally
  runs *after* M1.7 so V-7/V-8 use the real BYOK path.
- **Next:** all M1 build phases done. Founder runs **S-3** (Maincloud publish) + **S-4**
  (now optional — keys go in-app) → on-device **V-5/V-7/V-8** on the real BYOK path →
  tag `M1 [shipped]`. Build-wise: **M2** (multi-agent groups, BL-014) / **M3** (RAG) /
  **BL-016** (chat polish, after on-device review) / **BL-011** (durable key backing).

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
- **OT-004** — *Streaming write cadence & cost.* Confirm batched row UPDATEs
  (~50ms) for partial agent tokens don't strain SpacetimeDB/energy budget at
  realistic concurrency. Unblocks: M2 streaming work.
- **OT-005** — *Hosting & data stores.* Decide SpacetimeDB host (Maincloud Pro
  vs self-host), orchestrator host, and the Postgres/pgvector provider. Unblocks:
  M0 infra / M3 RAG. (Pricing/limits cited in research are reported-not-verified.)
  Now also owns the **durable BYOK key store**: M1.4's gateway uses an in-memory
  AES-256-GCM store under an env KEK; the Postgres/KMS backing (`provider_keys.secret_ref`)
  lands with this decision (DEC-020).
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
