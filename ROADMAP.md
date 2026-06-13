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

*2026-06-13.* **M0 closed** (all spikes cleared). In **M1**: realtime **chat MVP**
(M1.1) + **SpacetimeAuth login** (M1.2 ✓) + **Model Gateway v1** (M1.4 ✓) + the
**agent reply loop** (M1.6 ✓ — the orchestrator streams real LLM replies into chat
via batched UPDATEs; mobile renders them live). The end-to-end **build-an-agent →
live reply** vision now works with a seeded default persona. Working under the
autonomous build loop (CLAUDE.md §4). Open checks: `VERIFICATION.md` V-1/V-2/V-4/V-5/
V-6/V-7; founder setup `SETUP.md` S-1…S-3 (SpacetimeAuth + Maincloud), S-4 (provider
key). **Next: M1.5** Agent Studio (author personas); **M1.3** (groups/contacts) and
**M2** (multi-agent groups) when those tracks resume.

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

## M1 — Realtime core (A) + Agent MVP (B)

**Acceptance bar:** a user signs in, builds an agent persona, and holds a live,
streamed 1:1 conversation with it on-device; the same app supports human↔human
1:1 and group threads with presence.

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
  add-by-identity-hex).
- **M1.4 (B)** Model Gateway v1: Vercel AI SDK with **two providers** (Anthropic +
  one of OpenAI/Google), streaming + tool-calling interface; BYOK key store
  (encrypted) and resolution. ✓ *Done 2026-06-13 — `packages/gateway` on AI SDK v6:
  provider registry (anthropic + openai; google/openai-compatible inert), `streamText`
  → `GatewayDelta`; AES-256-GCM `EncryptedKeyStore` + injected resolver (DEC-020).
  CI 16/16 (headless via `MockLanguageModelV3`); live round-trip `V-6` (key `SETUP.md`
  S-4). `embed`→M3.1; orchestrator streaming→M1.6.*
- **M1.5 (B)** Agent Studio v1: create/edit a persona (identity, system prompt,
  model + params); persisted as an agent + version.
- **M1.6 (B)** Orchestrator reply loop: detect an agent is addressed in a 1:1
  thread → build context → stream a reply back via batched UPDATEs; `run` records.
  ✓ *Done 2026-06-13 — `run` table + `message.runId` + `agent_reply_begin/append/
  finish`; `replyLoop.ts` (gateway.stream → ~50ms batched UPDATEs, `streaming`→
  `complete`) + seeded default persona; mobile streaming cursor (DEC-021). CI 16/16;
  local mock-gateway integration proves the round-trip headlessly. Live on-device
  reply `V-7` (key `SETUP.md` S-4).*

Human verification: `[gate]` build-an-agent → live 1:1 reply on-device;
`[gate]` real BYOK key round-trip.

---

## M2 — Multi-agent group threads + streaming polish

**Acceptance bar:** a group thread with ≥2 humans and ≥2 agents converses
coherently in real time, with addressing, agent presence/typing, and robust
streaming.

- **M2.1** Addressing grammar (@mentions / direct address) + turn arbitration.
- **M2.2** Agent presence & typing indicators.
- **M2.3** Streaming hardening: backpressure, cancellation, error/timeout states,
  run lifecycle (SPEC §agent-run).
- **M2.4** Multi-agent context isolation per thread.

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
- **iOS** — RN keeps the door open; not a v1 target.
- **Agent marketplace / sharing** — post-v1.
- **Voice / video calls** — out of scope for v1.
- **Web client** — RN-first; revisit after mobile.

*(Deferrals with revisit triggers live in `BACKLOG.md`.)*
