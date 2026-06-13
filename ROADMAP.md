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

*2026-06-13.* Plan ratified; doc suite authored. Entering **M0**. Only the
reference app (`examples/chat-react-ts`) and the operating harness exist. The
top open risk is RN↔SpacetimeDB compatibility (OT-003).

---

## M0 — Foundations & spikes

**Acceptance bar:** the monorepo builds in CI (lint + typecheck + build + test
green); an Expo app connects to a published SpacetimeDB module from a device/
emulator and renders a live row; the orchestrator writes a row as a trusted
client; and the three spikes are decided and recorded as DEC entries.

- **M0.1 — Monorepo & CI.** pnpm workspaces (+ Turborepo); packages per the
  BLUEPRINT layout; TS strict; CI workflow (lint/typecheck/build/test, with
  concurrency-cancel). *Separate scaffold PR(s) from execution PRs.*
- **M0.2 — Spike: RN ↔ SpacetimeDB (OT-003, [critical]).** Minimal Expo app +
  SpacetimeDB TS client: prove WebSocket connect, a subscription, and a reducer
  call on Hermes (Android). Decide go / polyfill / bridge / alternative. Record
  DEC.
- **M0.3 — Spike: module language & access control (DEC-007).** Stand up a TS
  module with `users`/`threads`/`thread_members`/`messages`; prove per-user
  `ViewContext` Views hide non-member rows from a subscribing client. Record
  findings.
- **M0.4 — Spike: orchestrator as trusted client (DEC-008).** Node/TS service
  connects via an OIDC service identity, subscribes to messages, and writes a row
  via a reducer. Confirm the service identity is stable.
- **M0.5 — Auth wiring.** Choose + wire the OIDC provider (SpacetimeAuth built-in
  vs Auth0/Clerk); device login → stable `Identity`.
- **M0.6 — Doc suite & code-reality.** (this PR) ROADMAP/PRD/BLUEPRINT/SPEC/
  BACKLOG + CLAUDE.md §9 + MEMORY updated.

Human verification: `[gate]` Expo app connects to STDB on a real Android device.

---

## M1 — Realtime core (A) + Agent MVP (B)

**Acceptance bar:** a user signs in, builds an agent persona, and holds a live,
streamed 1:1 conversation with it on-device; the same app supports human↔human
1:1 and group threads with presence.

- **M1.1 (A)** Data model v1 + reducers: users, threads, thread_members, messages,
  presence; membership-scoped Views.
- **M1.2 (A)** Mobile chat UI: thread list, thread view, composer, presence,
  optimistic send.
- **M1.3 (A)** Group threads + membership management.
- **M1.4 (B)** Model Gateway v1: Vercel AI SDK with **two providers** (Anthropic +
  one of OpenAI/Google), streaming + tool-calling interface; BYOK key store
  (encrypted) and resolution.
- **M1.5 (B)** Agent Studio v1: create/edit a persona (identity, system prompt,
  model + params); persisted as an agent + version.
- **M1.6 (B)** Orchestrator reply loop: detect an agent is addressed in a 1:1
  thread → build context → stream a reply back via batched UPDATEs; `run` records.

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
