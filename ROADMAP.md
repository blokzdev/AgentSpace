# ROADMAP.md — AgentSpace Sequencing

> Forward-looking. Owns **sequencing**: milestones, phases, tasks, acceptance
> bars, and strategic skips. When "what to build next" is the question, this is
> the answer. Rationale for *choices* lives in `MEMORY.md` (DEC-IDs); this file
> references them rather than re-arguing them.

Ladder: **Milestone (Mn) › Phase (Mn.k) › Task**. Two interlocking tracks run in
parallel from M0 (DEC-011): **A = Realtime**, **B = Agent/AI**. A milestone is
done when its acceptance bar — something a reviewer can hold us to — is met.

---

## Current state

*2026-06-22.* **M0 closed; M1 ✓ SHIPPED** — all build phases (M1.1 chat, M1.2 login, M1.3
contacts/groups+UX, M1.4 gateway, M1.5 Agent Studio, M1.6 agent replies, **M1.7 per-user
BYOK**, **M1.8 full multi-provider**) done, and the **build-an-agent → converse-with-your-own-key**
loop is **verified on-device** vs Maincloud (V-5/V-7/V-8; DEC-029, PRs #29–#31). **Current chunk =
`M1.9` Streaming hardening (fixes OT-004; pulls all of M2.3 forward)** — delta-streaming
(append-only INSERTs replace cumulative-text UPDATEs) + run lifecycle (backpressure, idle/error
timeout, cancellation-on-supersede). Built + headless-verified; on-device is V-13/V-14 (DEC-030).
Then **M2** (multi-agent groups, BL-014), **M3** (RAG), **BL-016** (chat polish), **BL-011**
(durable key backing). Optional: **V-9/V-10/V-11**. Autonomous build loop (CLAUDE.md §4); founder
setup S-1/S-2/S-3 done (S-2 redirect now reverse-DNS); S-4 optional.

---

## M0 — Foundations & spikes  ✓ CLOSED (2026-06-13)

**Acceptance bar:** the monorepo builds in CI (lint + typecheck + build + test
green); an Expo app connects to a published SpacetimeDB module from a device/
emulator and renders a live row; the orchestrator writes a row as a trusted
client; and the three spikes are decided and recorded as DEC entries.

*Outcome: monorepo + CI (M0.1), RN↔STDB GO + Expo probe (M0.2/M0.2b), module +
Views access-control (M0.3), orchestrator round-trip (M0.4), doc suite (M0.6) — all
done; the three risky spikes cleared on the AI side. M0.5 (auth) relocated to M1.2.
Device checks V-1/V-2 pending (non-blocking). Drift-sweep deferred (docs kept
current per-PR; run `/audit` on demand).*

- **M0.1 — Monorepo & CI.** pnpm workspaces (+ Turborepo); packages per the
  BLUEPRINT layout; TS strict; CI workflow (lint/typecheck/build/test, with
  concurrency-cancel). *Separate scaffold PR(s) from execution PRs.*
- **M0.2 — Spike: RN ↔ SpacetimeDB (OT-003).** ✓ *Done (2026-06-13): **GO**,
  two polyfills, no bridge — DEC-012, `.audit/spike-rn-stdb-2026-06-13.md`.*
- **M0.2b — Expo connectivity probe.** ✓ *Done: `apps/mobile` probe typechecks,
  lints, and bundles for Android via Metro (561 modules) — DEC-014. Live device
  connect is `VERIFICATION.md` V-1 (founder). Bindings vendored from the example
  until M0.3.*
- **M0.3 — Module + access control (DEC-007).** ✓ *Done (2026-06-13):
  `modules/spacetime` (users/threads/thread_members/messages + reducers + per-user
  Views) builds, publishes locally, generates bindings; `tsc`/`eslint` green.
  Membership write-gating + positive Views read-path verified via CLI
  (`.audit/spike-stdb-access-control-2026-06-13.md`); non-member negative case is
  `VERIFICATION.md` V-2.*
- **M0.4 — Orchestrator as trusted client (DEC-008).** ✓ *Done (2026-06-13):
  `services/orchestrator` connects with a stable identity, subscribes to
  `my_thread_messages`, and replies via a reducer. Proven end-to-end (echo
  round-trip) by the local integration script —
  `.audit/spike-orchestrator-client-2026-06-13.md`. Uses a persisted anonymous
  token; real OIDC service account is M0.5.*
- **M0.5 — Auth wiring.** → **relocated to M1.2** (founder DEC: close M0, fold auth
  into M1 with SpacetimeAuth built-in OIDC).
- **M0.6 — Doc suite & code-reality.** ✓ *Done — the doc suite + per-PR code-reality
  updates.*

Human verification: V-1 (Expo connect on a real Android device).

---

## M1 — Realtime core (A) + Agent MVP (B)  ✓ SHIPPED (2026-06-22)

**Acceptance bar:** a user signs in, **enters their own provider key (BYOK)**, builds
an agent persona, and holds a live, streamed 1:1 conversation with it on-device — the
agent reply uses *their* key; the same app supports human↔human 1:1 and group threads
with presence.

*Outcome: **met on-device** (2026-06-22, local session, DEC-029) — Android dev build on the
Pixel_8 emulator vs Maincloud: SpacetimeAuth login → "Pirate Pete" streams pirate-speak
replies via the user's BYOK Anthropic key (V-5/V-7/V-8 verified). Getting there fixed six
device-only bugs (PRs #29–#31). Carried: **OT-004** — long replies dangle the streaming
cursor (cumulative-text UPDATE tail-drop over Maincloud); short/medium settle cleanly; the
full delta-streaming fix is the next chunk (**M1.9 / M2.3 streaming hardening**). V-9/V-10/V-11
remain optional. Focused milestone-close (docs were reconciled per-PR this session; no separate
drift sweep run).*

- **M1.0 (A)** Realtime data model + reducers + membership Views. ✓ *Delivered in
  M0.3 (`modules/spacetime`).*
- **M1.1 (A)** Mobile realtime **chat MVP**: thread list, thread view, composer,
  presence, create group + add-member. ✓ *Done 2026-06-13 — typechecks/lints/
  bundles for Android; on-device behavior `V-4`. Anonymous identity until M1.2.*
- **M1.2 (A)** **SpacetimeAuth** login (OIDC via `expo-auth-session`): real device
  login → ID token → stable `Identity`; replaces the anonymous token. ✓ *Done
  2026-06-13 — `src/auth.ts` (code+PKCE, SecureStore refresh-token persistence) +
  `Login` screen + `App.tsx` `.withToken()` gate (DEC-019). CI 16/16; Android bundle
  clean. Founder setup `SETUP.md` S-1…S-3; on-device login `V-5`. Orchestrator
  service account deferred to `OT-007` (was bundled here).*
- **M1.3 (A)** Group/membership management + contacts/user-search (beyond
  add-by-identity-hex). ✓ *Done 2026-06-13 — searchable user directory (public `user`
  table) → `UserPicker` for New chat + Add member; creator-gated `remove_member`/
  `set_thread_title` + `create_dm` dedupe; `ThreadMembers` screen; plus a UI/UX pass
  (avatars + presence, inbox with last-message/relative-time, name nudge, auto-scroll)
  — DEC-023. CI 16/16; reducers verified via `spacetime call`. On-device `V-9`; deep
  polish `BL-016`; visibility model `BL-015`.*
- **M1.4 (B)** Model Gateway v1: Vercel AI SDK with **two providers** (Anthropic +
  one of OpenAI/Google), streaming + tool-calling interface; BYOK key store
  (encrypted) and resolution. ✓ *Done 2026-06-13 — `packages/gateway` on AI SDK v6:
  provider registry (anthropic + openai; google/openai-compatible inert), `streamText`
  → `GatewayDelta`; AES-256-GCM `EncryptedKeyStore` + injected resolver (DEC-020).
  CI 16/16 (headless via `MockLanguageModelV3`); live round-trip `V-6` (key `SETUP.md`
  S-4). `embed`→M3.1; orchestrator streaming→M1.6.*
- **M1.5 (B)** Agent Studio v1: create/edit a persona (identity, system prompt,
  model + params); persisted as an agent + version. ✓ *Done 2026-06-13 — `agent`
  table (inline config + `version` counter) + `service` singleton + `thread.agentId`;
  mobile `AgentList`/`AgentEditor`; orchestrator `selectPersona` drives the reply
  (DEC-022, service-identity binding). CI 16/16; local integration proves persona
  injection ("Pirate Pete"). Immutable version history → BL-013; agents-as-contacts
  → BL-014/M2. On-device `V-8`.*
- **M1.6 (B)** Orchestrator reply loop: detect an agent is addressed in a 1:1
  thread → build context → stream a reply back via batched UPDATEs; `run` records.
  ✓ *Done 2026-06-13 — `run` table + `message.runId` + `agent_reply_begin/append/
  finish`; `replyLoop.ts` (gateway.stream → ~50ms batched UPDATEs, `streaming`→
  `complete`) + seeded default persona; mobile streaming cursor (DEC-021). CI 16/16;
  local mock-gateway integration proves the round-trip headlessly. Live on-device
  reply `V-7` (interim key `SETUP.md` S-4).*
- **M1.7 (B)** **Per-user in-app BYOK** *(gates the M1 tag)*. ✓ *Done 2026-06-14 —
  Option A (DEC-025): the orchestrator publishes a NaCl box pubkey (`service.encPubKey`/
  `service_info`); the app **seals** the key client-side (`tweetnacl`) and stores
  **ciphertext only** in `provider_key` (`set_provider_key`); the orchestrator decrypts
  per-`<owner>:<provider>` in-memory (`createByokResolver`), resolved from
  `my_persona_keys`. Mobile `ApiKeys` screen (🔑 Keys). Raw key never in STDB;
  `envResolver`/`.env` now only the gateway smoke (V-6). CI 16/16 (14 orch tests);
  headless integration proves seal→ciphertext→decrypt→reply. On-device `V-7/V-8`.
  Durable Postgres/KMS backing `BL-011`; orchestrator service account `OT-007`.*
- **M1.8 (B)** **Full multi-provider BYOK + model UX** (DEC-028): expand the gateway from
  2 providers to the whole Vercel-AI-SDK catalog + refresh the provider/model UI.
  - **M1.8.1** Single-API-key cloud providers (13: Anthropic, OpenAI, Google, Mistral,
    Cohere, Groq, xAI, DeepSeek, Perplexity, Together, Fireworks, DeepInfra, Cerebras) + a
    shared **`PROVIDER_CATALOG`** (single source for the gateway registry + both mobile
    screens) + curated-model suggestion chips + per-provider key cards ("Get a key →").
    ✓ *Done 2026-06-22 — `provider`/`model` are free-form strings so **no STDB change**; CI
    green (gateway per-provider coverage + catalog-integrity tests); Android bundle clean
    (633 modules). Live round-trip `V-10`.*
  - **M1.8.2** Local / **openai-compatible** (Ollama/vLLM/LM Studio) — per-agent `baseUrl`
    (appended `agent.baseUrl` column + regenerated bindings) + `createOpenAICompatible`
    (key optional; the orchestrator resolves a keyless local provider to `''`). ✓ *Done
    2026-06-22 — CI green; headless integration re-proves the path on the new schema;
    Android bundle clean. Founder re-publishes the module to Maincloud (`--delete-data`
    for the new column) before testing. On-device `V-11` (Ollama on the host; the emulator
    needs no GPU).*
  - **M1.8.3** Multi-credential providers (Bedrock/Azure/Vertex) — structured creds **sealed
    as JSON** (no `provider_key` schema change) + multi-field key forms. ✓ *Done 2026-06-22
    — `ProviderFactory` parses the JSON credential into the SDK settings; `ApiKeys` renders a
    field form per provider; new **`PROVIDERS.md`** documents getting every key. CI green
    (gateway 20). `V-12`.*

Human verification: `[gate]` build-an-agent → live 1:1 reply on-device **with the
user's own BYOK key** (V-7/V-8 after M1.7).

---

## M1.9 — Streaming hardening (fixes OT-004; pulls M2.3 forward)

**Acceptance bar:** on-device vs Maincloud, a **long multi-paragraph reply streams
token-by-token AND settles to `complete` with no dangling cursor**; an interrupting
message **cancels** the in-flight reply cleanly (cursor clears, run `cancelled`) and the
new message is answered; **no run is ever left non-terminal** (idle/error timeout). Proven
headlessly (no key) by the local-STDB integration + orchestrator unit tests. (Founder
folded all of the old M2.3 in here — DEC-030; harden the substrate before M2 multiplies
streaming load.)

- **M1.9.1 — Delta-streaming core (OT-004 fix).** ✓ *Done 2026-06-22 — replaced the
  cumulative-text `message` UPDATE (`agent_reply_append`, O(n²), tail-dropped over Maincloud)
  with **append-only `reply_delta` INSERTs**: new private `reply_delta` table + `my_reply_deltas`
  View + `agent_reply_delta(runId, seq, text)` reducer; `agent_reply_finish` writes the
  authoritative final text + **GCs the run's deltas** (same txn). The `message` row stays empty
  while `streaming`; the orchestrator emits coalesced deltas (per-flush `seq`); mobile
  concatenates deltas by `seq` and renders, falling back to `message.text` once not `streaming`.
  Bindings regenerated + synced ×3. Headless integration proves delta order + concatenation + GC;
  Android bundle clean. On-device `V-13`.*
- **M1.9.2 — Run lifecycle & robustness.** ✓ *Done 2026-06-22 — backpressure (coalescing batcher
  + a soft per-INSERT cap); an **idle/error timeout** (no token for 60s → abort → terminal
  `failed`) so a stalled provider can't hang a run; **cancellation-on-supersede** (a new human
  message aborts the in-flight stream via `AbortController` — threaded into the gateway — and
  finalizes it via `agent_reply_cancel` → message `failed` w/ partial text, run `cancelled`; the
  new message is then answered). Every run reaches `succeeded|failed|cancelled`. 4 new orchestrator
  unit tests (happy/timeout/error/cancel) + the integration's cancellation scenario. On-device
  `V-14`.*

Human verification: `V-13` (long reply settles clean, no dangling cursor) + `V-14`
(cancellation) on-device vs Maincloud — needs a Maincloud re-publish (`--delete-data`, new table).

---

## M2 — Multi-agent group threads

**Acceptance bar:** a group thread with ≥2 humans and ≥2 agents converses
coherently in real time, with addressing and agent presence/typing. (Robust
streaming is now inherited from **M1.9**.)

- **M2.1** Addressing grammar (@mentions / direct address) + turn arbitration.
- **M2.2** Agent presence & typing indicators.
- **M2.3** Multi-agent context isolation per thread. *(was M2.4; old M2.3 "Streaming
  hardening" pulled forward into M1.9 — DEC-030.)*

---

## M3 — Knowledge bases (RAG) + tool/API toolkits

**Acceptance bar:** an agent answers from an uploaded knowledge base and
successfully calls a configured API tool.

- **M3.1** Knowledge ingestion: upload → chunk → embed (AI SDK) → store
  (Postgres + pgvector, DEC-010).
- **M3.2** Retrieval injected into agent context; citations.
- **M3.3** Tool layer: typed function tools + **MCP client** integration; per-agent
  toolkit scoping; secure execution + approval policy.

---

## M4 — Workflows & multi-agent orchestration

**Acceptance bar:** a scheduled workflow runs an agent autonomously and posts
results to a thread; multi-agent teams take turns coherently in a group.

- **M4.1** Trigger model: on-message, on-schedule (STDB scheduled reducers,
  idempotent), on-event/webhook.
- **M4.2** Workflow engine: define → trigger → run → post; run history.
- **M4.3** Multi-agent orchestration patterns (coordinator/turn-taking) in groups.

---

## M5 — Local models + routing + metering

**Acceptance bar:** an agent runs on a self-hosted local model (OpenAI-compatible),
and per-user usage is metered with quotas.

- **M5.1** Local/self-hosted providers (Ollama/vLLM/LM Studio) via the gateway;
  per-agent model selection; structured-output fallback (OT-006).
- **M5.2** Provider routing + fallbacks + retries.
- **M5.3** Usage metering (tokens/cost per run/user) + quotas.

---

## M6 — Production hardening → v1 ship

**Acceptance bar:** the launch-gate checklist (BACKLOG) clears; v1 is tagged.

- **M6.1** Security & abuse: input sanitization, rate limits, key-handling audit,
  thread authz review (Monitor→Enforce rollout for new gates).
- **M6.2** Push notifications (Expo/FCM).
- **M6.3** Observability: logs/traces/usage dashboards; error capture.
- **M6.4** Performance pass + load smoke at target concurrency.
- **M6.5** Pre-launch drift sweep + launch-gate walk → tag `[shipped]`.

---

## §5 Strategic skips (not in v1)

- **On-device / edge inference** — own milestone post-v1 (heavy; device-perf risk).
- **Orchestrator hosting** — v1 is a single **central always-on** service (DEC-027); the three
  alternative modes (**phone on-device** BL-017 · **desktop self-host** BL-018 · **serverless**
  BL-019) are post-v1. The *specific* v1 host is OT-005.
- **iOS** — RN keeps the door open; not a v1 target.
- **Agent marketplace / sharing** — post-v1.
- **Voice / video calls** — out of scope for v1.
- **Web client** — RN-first; revisit after mobile.

*(Deferrals with revisit triggers live in `BACKLOG.md`.)*
