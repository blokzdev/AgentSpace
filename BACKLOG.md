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
- **Re-scheduled (DEC-038, 2026-06-23):** M2.4 shipped the **lean cut** (a public `thread_agent_cards`
  projection → cross-owner names/avatars, closing BL-021) and **kept `message.sender` = the service
  identity**. The **full** per-agent identity (mint N STDB identities + a connection pool + `user.online`
  presence dots + sender = the agent identity) is now a **committed milestone scheduled AFTER M2.9** (the
  Google-auth re-key settles the issuer first, so it isn't throwaway). Additive/reversible; the
  card-derived render is a forward-bridge to it.

### BL-015 — Contacts / visibility / blocking model (non-global directory)
- **Source:** DEC-023 (M1.3 user search reads the *public* `user` table — every user
  sees every user).
- **Trigger:** real user volume / privacy needs, or a friends/contacts product step.
- **Promotion:** a contacts model (mutual add / requests), a scoped directory View, and
  block/report. Revisit the `user` table's `public` flag.

### BL-016 — Deep chat-polish pass
- **Source:** DEC-023 (M1.3 shipped a focused UI/UX pass; deeper polish deferred).
- **Trigger:** post on-device review (V-9), pre-launch UX bar (M6). *(Scope line — DEC-037: the **M2.9**
  auth/**login** UX is pulled forward as a foundation beat; this BL-016 **broad** app/chat polish stays at
  **M6** — don't over-polish before the product is validated.)*
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
  distinct from M2.3's *instruction* isolation (each agent already sees only its own `systemPrompt`; all
  agents still share the transcript); (d) **agent-side NL soft-address** — M2.3 (DEC-036) shipped the NL
  "Hey {name}," vocative for **human** messages only; the audited `addressing.md` also contemplated a
  server-side fuzzy resolver for agent→agent text mentions — deferred until agent↔agent volleys need it.

### BL-021 — M2.1 implementation deferrals (cross-owner agent names · cooldown enforcement)
- **Status (2026-06-23):** **(a) RESOLVED by M2.4 lean (DEC-038)** — the new public `thread_agent_cards`
  projection (name + avatar, `by_member` predicate, no secret columns) + a card-first mobile render let
  every member see a cross-owner agent's real name+avatar. **(b) cooldown still deferred** (below).
- **Source:** DEC-032 (M2.1 build).
- **Trigger:** ~~cross-owner names (done)~~; per-agent rate-shaping is needed.
- **Promotion:** ~~(a) resolve other users' agent names — DONE via the public `thread_agent_cards`
  projection (M2.4 lean).~~ (b) **Enforce the per-(agent,thread) cooldown** — `AGENT_COOLDOWN_MS` is reserved in `@agentspace/shared`
  + the module dials but not yet checked in `agent_reply_begin`; add it to the enforcement boundary if
  rapid-fire agent turns need throttling beyond the episode budget.

### BL-022 — On-device connection resilience (auto-reconnect, app + orchestrator) — ✅ promoted to M2.5 (DEC-034)
- **Status:** **promoted + shipped (2026-06-23, M2.5).** App: `ConnectionGate` (`apps/mobile/src/reconnect.tsx`)
  unmounts the provider on a drop (forcing the SDK manager to evict the dead socket), refreshes the id token,
  remounts with backoff, and is foreground-aware. Orchestrator: `runOrchestrator` supervisor
  (`services/orchestrator/src/supervise.ts`) reconnects with backoff + re-arms the reply loop on the fresh
  connection, never exiting. Shared full-jitter `nextBackoff` + pure `reconnectReducer` (`@agentspace/shared`),
  unit-tested; integration Scenario G proves orchestrator self-heal. No schema change. On-device = V-21/V-22.
- **Source:** 2026-06-23 on-device verification — the app's Maincloud WebSocket dropped mid-session and
  got stuck on "Connecting to AgentSpace…" (no auto-reconnect); the orchestrator's Maincloud socket also
  dropped and the process exited.
- **Trigger:** on-device reliability, or any always-on deployment (OT-005 / DEC-027) — a dropped socket
  must self-heal rather than strand the app or kill the service.
- **Deferred follow-ups (not in M2.5):** preserving deep navigation state across an app reconnect (MVP lands
  on the inbox); aborting in-flight orchestrator gateway streams on disconnect (the reaper + idle timeout
  already finalize stuck runs); a "revoked refresh token while present" → immediate Login (M2.5 keeps retrying
  on a transient failure, only `invalid_grant`-class errors route to Login). Intersects OT-007 (real
  service-account auth) + DEC-027 (always-on hosting).

### BL-023 — Revisit license / repo-visibility / commercial posture (pre-launch)
- **Source:** DEC-033 (founder Q on monetization + "going private"; repo stays public under Apache-2.0 now).
- **Decision today:** repo stays **public** under **Apache-2.0**. Monetization is fully compatible with
  public (hosted SaaS / open-core / dual-licensing) — the moat is the running service + ops + brand, not
  the source. The protective lever is the **license** (chosen now), **not** the visibility toggle: going
  private later can't recall already-public commits or revoke a license already granted on them, so it is
  **not** the default action.
- **Trigger:** pre-GA, **or** first paying users, **or** first credible competitor-clone signal.
- **Promotion:** a **launch-gate decision** (an acceptance item under a future GA/launch milestone) — re-decide
  whether to tighten the **server** packages to **AGPL-3.0 / BSL 1.1** (dependency-graph-correct: keep
  anything the mobile app imports, e.g. `packages/shared`, permissive to avoid the App-Store ↔ copyleft
  conflict) and/or sell a commercial dual-license. As sole copyright holder this stays open without going
  private.

### BL-024 — Human typing indicators + per-agent online presence (needs a `presence` table)
- **Source:** M2.2 (DEC-035) — M2.2 shipped *agent* presence/typing derived from `streaming` message rows
  with **no new table**. Two adjacent presence features are deferred because they need state the message
  stream can't provide.
- **Trigger:** a richer presence UX is wanted (humans see each other typing; agents show online/idle).
- **Promotion:** add the BLUEPRINT-sketched `presence` table (`identity`/`agent_id`, `state`,
  `typing_in_thread`) + a transient, debounced typing signal for **human typing**; **per-agent online
  presence** rides on per-agent identities (**M2.4 / BL-014**). Keep the M2.2 client derivation as the
  agent-thinking path; presence rows augment it.

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
- [ ] **LG-9 — Production app signing.** Build the release APK/AAB with a real
      **production keystore** (not the debug key) and sign for distribution (Play App
      Signing / a managed keystore + secret). The `build-apk` workflow is a **release**
      build but **debug-signed** for testing only — swap in the prod signing config +
      a keystore secret at launch. Source: the manual Build APK workflow.
- [ ] **LG-10 — Deploy discipline (schema-first; correct publish target).** A Maincloud
      **module publish MUST pass `--server maincloud`** — `modules/spacetime/spacetime.json`
      pins `server=local`, which overrides the CLI default, so a bare `spacetime publish`
      silently goes to the local server (the S-8 incident, 2026-06-23). And a **schema
      republish must precede an APK build**: the mobile bindings subscribe to views/columns
      (e.g. `thread_agent_cards`/`avatar_emoji`) that must already exist on the target DB, or
      the app's subscription/decode fails. Confirm both at release: the live Maincloud schema
      matches the shipped bindings (`spacetime describe --server maincloud agentspace-hpm58`).

*(Open Human-Verification `[gate]` items at milestone-close flow here with trigger
"verify before v1 ships.")*
