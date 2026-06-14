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

### BL-010 — More gateway providers (Google + OpenAI-compatible/local)
- **Source:** DEC-020 (M1.4 shipped anthropic + openai only).
- **Trigger:** an agent needs Gemini, or M5 local models (Ollama/vLLM/LM Studio).
- **Promotion:** add factories to `packages/gateway/src/providers.ts` (the registry
  already reserves `google`/`openai-compatible`); local lands with BL-006 (structured
  output) at M5.

### BL-011 — Durable BYOK key store (Postgres/KMS)
- **Source:** DEC-020 / OT-005 (M1.4 uses an in-memory AES-256-GCM store under an
  env KEK).
- **Trigger:** real per-user keys need persistence + a managed KMS; M3/infra stands
  up Postgres.
- **Promotion:** back `EncryptedKeyStore` with `provider_keys.secret_ref` (BLUEPRINT
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
