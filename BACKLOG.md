# BACKLOG.md — AgentSpace Carryover Queue

> Forward-looking. Owns **tactical deferrals** ("do X when Y happens") and the
> **Launch Gates** walked at the launch milestone. Strategic skips ("we won't do X
> in v1 at all") live in `ROADMAP.md` §5; this file is for things we *will* revisit
> on a trigger. Each entry: description · source · trigger · promotion target.

---

## Deferred items (revisit on trigger)

### BL-001 — On-device / edge inference
- **Source:** DEC-009 (local/edge timing).
- **Trigger:** v1 shipped *and* demand for offline/private on-device agents.
- **Promotion:** a dedicated post-v1 milestone (llama.cpp / MLC / ExecuTorch).

### BL-002 — iOS client
- **Source:** DEC-005 (Android-first).
- **Trigger:** Android v1 stable + iOS demand.
- **Promotion:** a client-platform milestone (RN keeps most code reusable).

### BL-003 — Agent marketplace / sharing
- **Source:** ROADMAP §5.
- **Trigger:** enough users build agents worth sharing; sharing/permission model
  designed.
- **Promotion:** a new ROADMAP milestone (needs auth/permissions + moderation).

### BL-004 — Voice / video calls
- **Source:** ROADMAP §5.
- **Trigger:** text product validated; real-time AV demand.
- **Promotion:** new milestone (likely a separate media stack).

### BL-005 — Web client
- **Source:** ROADMAP §5.
- **Trigger:** mobile validated; the existing `examples/chat-react-ts` web path can
  seed it.
- **Promotion:** new client milestone.

### BL-006 — Local-model structured-output strategy
- **Source:** OT-006.
- **Trigger:** M5 (local providers) — OpenAI-compatible local lacks SDK structured
  output; choose JSON-repair / constrained-decoding / validation.
- **Promotion:** an M5 task.

### BL-007 — Dedicated vector DB (if pgvector is outgrown)
- **Source:** DEC-010 / BLUEPRINT §6.
- **Trigger:** RAG QPS exceeds pgvector's comfortable range under load.
- **Promotion:** an M3/M5 infra task (Pinecone/Weaviate).

### BL-008 — Multi-region HA / durability beyond commit-log
- **Source:** OT-005 (hosting).
- **Trigger:** uptime/SLA requirements exceed single-region Maincloud.
- **Promotion:** an infra task (Enterprise tier / self-host replication).

### BL-009 — Typed boundary for generated SpacetimeDB bindings
- **Source:** M0.4 (`.audit/spike-orchestrator-client-2026-06-13.md`).
- **Problem:** `packages/stdb-bindings` can't emit a clean built `.d.ts` under
  `node-linker=hoisted` (TS2742; `--noCheck`/`tsup --dts`/`preserveSymlinks` don't
  fix it). It's consumed as source, so the `stdb-bindings` and `orchestrator`
  packages relax `noUnusedLocals`/`verbatimModuleSyntax`/etc.
- **Trigger:** the leniency hides a real bug, or we want full strictness on the
  orchestrator as it grows.
- **Promotion:** an infra task — try pnpm isolated linker + Metro symlink
  resolution (re-validate the mobile bundle), a codegen post-process that adds
  annotations, or upstream SpacetimeDB codegen improvements.

### BL-010 — More gateway providers — ✅ promoted to M1.8 (DEC-028)
- **Source:** DEC-020 (M1.4 shipped anthropic + openai only).
- **Status:** **promoted.** **M1.8.1** shipped all **13 single-API-key cloud providers** +
  a shared `PROVIDER_CATALOG`; **M1.8.2** = `openai-compatible`/local (per-agent `baseUrl`);
  **M1.8.3** = multi-credential Bedrock/Azure/Vertex. Local **structured-output** handling is
  still **BL-006 / OT-006** (local ships text + tool calls; JSON mode flagged, not solved).

### BL-011 — Durable BYOK key-store *backing* (Postgres/KMS)
- **Note:** the per-user BYOK **feature** is promoted to **ROADMAP M1.7** (key-entry
  UI + `provider_keys` flow + the orchestrator resolver swap). BL-011 now narrows to
  the **durable storage backing** under it.
- **Source:** DEC-020 / DEC-024 / OT-005 (M1.7's v1 store persists without Postgres;
  this is the hardened backend).
- **Trigger:** production key persistence + a managed KMS; M3/infra stands up Postgres.
- **Promotion:** back the M1.7 store with `provider_keys.secret_ref` (BLUEPRINT
  §3/§4); rotate the KEK via KMS. Satisfies Launch Gate **LG-2**.

### BL-012 — Gateway embeddings (`embed`)
- **Source:** DEC-020 (gateway `embed` throws "M3.1").
- **Trigger:** M3.1 knowledge ingestion/retrieval (RAG).
- **Promotion:** implement `embed` via the AI SDK `embedMany` on an embedding
  provider; wire into pgvector ingestion.

### BL-013 — Immutable agent version history (run-pinning)
- **Source:** DEC-022 (M1.5 inlined config + a `version` counter; no history table).
- **Trigger:** need reproducibility/rollback, or to pin the persona a `run` used.
- **Promotion:** add the `agent_versions` table (BLUEPRINT §3); `update_agent` writes a
  new immutable version; `run` records the pinned version.

### BL-014 — Agents as first-class contacts (per-agent identity)
- **Source:** DEC-022 (M1.5 chose service-identity binding; agents are per-thread configs).
- **Trigger:** **M2** multi-agent group threads (need distinct agent members with their
  own identity/presence), or the "deploy agents as contacts" product step.
- **Promotion:** mint a per-agent STDB identity (service-managed token), make each agent
  a first-class member with presence/avatar; the orchestrator drives N agent identities.
  Ties to OT-007 (orchestrator service-account auth) + hardening `register_service`.
- **Now scheduled as M2.4 (DEC-031):** M2's MVP ships agents as persona-*tagged* messages on the
  single connection (Candidate C); this item is the fast-follow that swaps the `agentId` tag for a
  real per-agent `Identity` + `user.online` presence + distinct avatars. Additive/reversible.

### BL-015 — Contacts / visibility / blocking model (non-global directory)
- **Source:** DEC-023 (M1.3 user search reads the *public* `user` table — every user
  sees every user).
- **Trigger:** real user volume / privacy needs, or a friends/contacts product step.
- **Promotion:** a contacts model (mutual add / requests), a scoped directory View, and
  block/report. Revisit the `user` table's `public` flag.

### BL-016 — Deep chat-polish pass
- **Source:** DEC-023 (M1.3 shipped a focused UI/UX pass; deeper polish deferred).
- **Trigger:** post on-device review (V-9), pre-launch UX bar (M6).
- **Promotion:** message grouping + day separators, unread badges/read state, typing
  indicators beyond the streaming cursor, animations/skeletons/haptics, light theme,
  swipe actions, image/attachment rendering.

### BL-017 — Phone on-device "local agent" mode
- **Source:** DEC-027 (v1 is central always-on; on-device is a future mode).
- **What:** run the orchestrator on the **same Android device** as the app (no separate PC) —
  via **`nodejs-mobile`** (embeds Node in the RN app) or a **Hermes port** of the reply loop —
  optionally with a local **SLM** (BL-001) so neither key nor prompt leaves the device.
- **Trigger:** v1 shipped + demand for a max-privacy, single-device personal assistant.
- **Constraints:** **device-capability/tier-gated** (quantized SLM only on capable phones) with
  **graceful cloud/central fallback**; **foreground-only** — Android background-execution limits
  (Doze / OEM battery-killers), *not* compute, mean it can't be always-available (no replies
  while asleep, no group/other-user replies, no scheduled workflows).
- **Promotion:** an RN-runnable orchestrator runtime + per-agent identity (BL-014) + on-device
  inference (BL-001); pairs with desktop self-host (BL-018) on the self-host spectrum.

### BL-018 — Desktop self-host orchestrator
- **Source:** DEC-027.
- **What:** run the **existing** Node orchestrator on the user's own **always-on** PC/GPU (e.g.,
  an RTX 4070) pointed at **local Ollama/vLLM** via the gateway's `openai-compatible` path
  (DEC-009/DEC-020). The most feasible "nothing leaves my hardware" mode — no RN port — and
  always-on while the PC is on.
- **Trigger:** power-user / self-host demand; pairs with local-model support (BL-010 at M5).
- **Promotion:** a packaging/onboarding task (a one-command self-host bundle pointed at the
  user's Maincloud DB + local model) + per-agent identity (BL-014) for multi-agent.

### BL-019 — Event-driven serverless orchestrator
- **Source:** DEC-027 (today's orchestrator is a persistent subscriber — the opposite of
  request-scoped serverless).
- **Trigger:** a reliable SpacetimeDB **outbound push/webhook** trigger matures (DEC-008 flags
  `procedures` HTTP as unstable today).
- **Promotion:** invert to **stateless per-turn functions** (DB event → function resolves
  persona+key → LLM → stream reply back → exit) for scale-to-zero / no idle cost; resolve the
  streaming-duration limits (a long reply vs function max-duration) and identity/keypair custody
  in a stateless context.

### BL-020 — M2 multi-agent deferrals (router mode / metering / selective visibility)
- **Source:** DEC-031 (M2 ships addressed-only, episode-budgeted, single-connection).
- **Trigger:** post-M2 demand for richer multi-agent UX or finer cost control.
- **Promotion:** (a) an **LLM coordinator/router** arbitration mode (optional per-thread "let the
  agents self-organize" setting), always gated behind the episode budget; (b) **per-agent / per-day
  cost metering + budgets** beyond the per-episode ceiling (intersects BL-011 durable key backing);
  (c) **selective per-agent message visibility** (an agent sees only messages it was mentioned in) —
  distinct from M2.3's *instruction* isolation (all agents share the transcript in M2).

---

## Launch Gates (walked at M6 before tagging v1)

Each MUST be satisfied before the v1 tag. Owner ticks with evidence.

- [ ] **LG-1 — Thread authorization proven.** No client can read messages/threads
      it isn't a member of (Views audited; hostile-subscription test passes).
- [ ] **LG-2 — Key safety.** BYOK keys are encrypted at rest, decrypted only
      in-memory, never in STDB, never on device, never logged (audit + test).
- [ ] **LG-3 — No dangling streams.** Every agent run ends `complete`/`failed`;
      cancellation works; run records reconcile with messages.
- [ ] **LG-4 — Abuse/rate limits live.** Per-user send + run quotas; input
      sanitization at every untrusted boundary (model/tool/user).
- [ ] **LG-5 — Privacy & data handling.** A privacy policy + data-deletion path;
      telemetry defaults (no PII beyond uid; sanitized payloads).
- [ ] **LG-6 — Push notifications** function on a real Android device.
- [ ] **LG-7 — Observability.** Error capture + usage dashboards in place.
- [ ] **LG-8 — Pre-launch drift sweep** run; `[critical]`/`[important]` findings
      routed (CLAUDE.md §7).

*(Open Human-Verification `[gate]` items at milestone-close flow here with trigger
"verify before v1 ships.")*
