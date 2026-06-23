# M2 research — Candidate architectures (design options)

> Generated 2026-06-22 by the m2-multiagent-plan-research workflow (8 agents). See DEC-031.

I have read all three core files. The findings are well-grounded and consistent with the actual code. I now have everything needed to synthesize the candidate architectures. Let me compose the deliverable.

---

# M2 Multi-Agent Group Threads — Candidate Architectures

Grounded in the read of `modules/spacetime/src/index.ts`, `services/orchestrator/src/replyLoop.ts`, and `services/orchestrator/src/prompt.ts`. Three coherent candidates, then a phased recommendation with an MVP-first cut.

A few load-bearing facts I confirmed in the code that shape every option:

- **The reply reducers already gate on "`ctx.sender` is a `role='agent'` member of this thread"** (`agent_reply_begin` line 379–382, and `finish`/`delta`/`cancel` re-check `m.sender.isEqual(ctx.sender)` / `x.agent.isEqual(ctx.sender)`). They do **not** assume the service singleton anywhere — they assume "the caller is an agent member and owns its own run." This is why per-agent identities are *additive*, not a rewrite.
- **`selectPersona` (prompt.ts:66) is already per-ID** — it resolves `thread.agentId → agent`. The single-agent baking is that the *caller* invokes it once per thread, and that `my_active_personas`/`my_persona_keys` key off the singular `thread.agentId` (lines 598, 631).
- **The reply trigger filters out other agents' replies** (`replyLoop.ts:63` `if (msg.runId !== '') return`). This is the seed of loop-safety: an agent reply carries a non-empty `runId`, so it never wakes the loop today. M2 must keep this property and extend it.
- **`inFlight` is `Map<bigint, InFlight>`** keyed by `threadId` (replyLoop.ts:45) — exactly one in-flight reply per thread, superseded on a new human message.

Across all candidates the **arbitration policy is the same** (the research is unambiguous: addressed-only + hard episode guards, enforced in the reducer; reject the LLM router for v1). The candidates differ on the **identity/participation model**, which is the real fork.

---

## Candidate A — Per-Agent Identity ("agents-as-contacts")

Each deployed agent is a real SpacetimeDB `Identity`, a real `thread_member` with `role='agent'`, and a real `user` row. The orchestrator runs its own OIDC issuer (`iss=ours`, `sub=agent:<agentId>`) and holds **N WebSocket connections**, one per active agent.

### Data model

- **New: `agent_identity`** table — `{ agentId: u64 (pk/unique), identity: t.identity(), createdAt }`. The durable agentId→identity binding so the orchestrator knows which connection serves which persona and reducers can attribute.
- **`thread.agentId`** becomes vestigial metadata (keep for back-compat of 1:1 DMs; new group threads leave it `0n`). Agent participation is read from `thread_member` where `role='agent'`.
- **`message.mentions`** additive column — `Vec<{kind:'agent'|'human'|'all', ref: Identity, start:u32, len:u32}>` (sidecar offsets per Finding 3; default `[]`).
- **New: `episode`** table — the cost/loop guard ledger. `{ id, threadId, rootMessageId, turnsRemaining: u8, tokenBudgetRemaining: u64, openedAt, status }`. Opened by `send_message` on a human `complete` message; decremented in `agent_reply_begin`.
- **New: `agent_turn`** table (de-dup) — `{ episodeId, agentIdentity }` unique; enforces once-per-episode-per-agent.
- **`user`** gains nothing for presence (agents reuse the existing `online` + `clientConnected/Disconnected`); add **`typing: bool`** (or a tiny `presence` event) flipped on `agent_reply_begin`/cleared on finish.

### Reducers

- **`add_agent_to_thread(threadId, agentId)`** — validates caller is a member + owns or can-deploy the agent; looks up `agent_identity`; inserts a `thread_member{member: that identity, role:'agent'}`. *Reuses the `add_member` spine* — agents join exactly like humans.
- **`mint_agent_identity`** path is orchestrator-side (OIDC), not a reducer; `register_agent(agentId)` records the binding in `agent_identity` (gated like `register_service`).
- **`send_message`** extended: accept `mentions`; validate each `ref` is a current member (deterministic); **open an `episode`** with `turnsRemaining = MAX_TURNS` (≈4) + `tokenBudgetRemaining`.
- **`agent_reply_begin`** extended: in addition to the existing agent-member check, **reject if** the message's episode has `turnsRemaining == 0`, token budget exhausted, or this agent already has an `agent_turn` row for the episode. Decrement + insert `agent_turn` atomically. **This is the enforcement boundary the $47K post-mortem demands — pre-execution, in the reducer, synchronous.**

### Views

- **Zero new read-gating Views needed** for the core. `my_thread_members`, `my_thread_messages`, `my_reply_deltas` already key on `ctx.sender` and each agent connection sees exactly its threads.
- **Generalize `my_active_personas` / `my_persona_keys`**: instead of `thread.agentId`, map each `role='agent'` membership → its `agent_identity` → persona → owner keys. (For a per-agent *connection*, `ctx.sender` is that one agent identity, so each connection's view is naturally its own persona — even simpler.)

### Orchestrator changes (extending M1.9)

- **Connection-pool manager**: open/refresh/close one connection per active agent (lazy by thread activity; cap concurrency). Each connection runs the *existing* `startReplyLoop` almost verbatim — `self` is now that agent's identity.
- **`inFlight: Map<bigint, InFlight>`** stays per-thread but is now **per-connection** (each agent independently tracks its own one-in-flight-per-thread). Concurrent agents = concurrent connections, no shared mutation.
- **Trigger generalization** (replyLoop.ts:60–69): keep the `runId !== ''` loop guard; add "reply only if `self`'s identity ∈ `msg.mentions` (or `@all`), and the episode admits a turn." Agent→agent: an agent's reply carrying `mentions` of another agent is allowed to wake *that* agent — but the episode budget + `agent_turn` de-dup bound it.
- **Prompt** (prompt.ts): swap `buildPrompt` for the multi-party recipe (Finding 4): role-flip per `self` (own turns→`assistant`, all others→name-tagged `user`), roster footer in the system prompt, `stop` sequences = other participants' `"\nName:"`, strip a leading `^Name:` from output. `selectPersona` is called per-connection (its own persona) — trivial.

### Mobile changes

- **Add-agent flow**: `ThreadMembers` gets "+ Add agent" → an `AgentPicker` (over `my_agents`) → `add_agent_to_thread`. (Finding 1 Part C.)
- **Presence/typing is free**: agents render through the *same* `Avatar` + presence-ring + "is typing…" path humans use, because they're real `user` rows.
- **Composer @mention typeahead** over the member roster (humans + agents), emits structured `mentions` (Finding 3 §5b).
- Header/avatar for multi-agent groups; sender badge already keys on "is this sender an agent member" so it works per-agent unchanged.

| | |
|---|---|
| **Pros** | Real presence/typing/avatars for free; agents-as-contacts (the `DEC-022` vision); reuses `add_member` + all 5 membership Views unchanged; reply reducers unchanged; per-agent context isolation falls out of `ctx.sender`; closes `OT-007`. |
| **Cons** | New auth surface: a self-hosted OIDC issuer + JWKS + N connections + token refresh; connection fan-out (N agents × M threads subscriptions). |
| **Risk** | **Medium-high** — the OIDC/JWKS issuer is genuinely new infra (JWKS must be reachable + spec-compliant by the STDB host; see Finding 5 issue #2600). Mitigated by phasing it as a standalone M2.0 proven headlessly before any UI. |
| **Build size** | **L.** Issuer + connection pool is the bulk; schema/reducers/mobile are moderate and additive. |

---

## Candidate B — Service Singleton + Persona Tag ("one actor, N masks")

Keep the single `service` identity. It posts every agent's messages, **tagged** with which persona via a new `message.agentId`. Agent "membership" of a group becomes a `thread_agent` join table (generalizing the singular `thread.agentId`). Presence/typing are **synthetic** rows the orchestrator maintains.

### Data model

- **New: `thread_agent`** table — `{ threadId, agentId, addedBy, addedAt }`, the many-agents-per-thread join (replaces the single `thread.agentId` for groups).
- **`message.agentId: u64`** additive — `0` for humans, the persona id for an agent message (provenance tag; sender stays the service identity).
- **`run.agentId: u64`** additive — same tag on the run.
- **`message.mentions`** as in A (sidecar), but `ref` resolves to `agentId` (u64) not Identity, since agents have no identity.
- **New: `agent_presence`** table — `{ threadId, agentId, state: 'idle'|'typing'|'thinking', updatedAt }`, written by the orchestrator. **No `clientDisconnected` safety net** — the orchestrator must sweep stale rows on reconnect/crash.
- **`episode` / `agent_turn`** guard tables as in A (keyed by `agentId` instead of identity).

### Reducers

- **`add_agent_to_thread(threadId, agentId)`** — new join-table insert (can't reuse `add_member`; there's no identity to add).
- The reply reducers need a **new auth model**: today they check `ctx.sender` is a `role='agent'` member. Under B, `ctx.sender` is *always* the service identity for *every* agent. So `agent_reply_begin` must now take `agentId`, verify `(threadId, agentId) ∈ thread_agent` AND `ctx.sender == service.identity`, and tag the message/run with `agentId`. **This is a real change to the M1.9 reducers' guard logic** (vs. A, where they're untouched).
- **`set_agent_presence(threadId, agentId, state)`** — gated to the service identity.
- `send_message` opens an `episode` as in A.

### Views

- **New synthetic Views** for the human-facing side: `thread_agents` (the roster — who's in the room), `my_agent_presence` (typing/thinking). Membership Views still work for the orchestrator (the service identity is a member of every agent thread) but **per-agent context isolation must be enforced in orchestrator code**, since one identity sees everything.
- `my_persona_keys` generalizes over `thread_agent` (all agents' owners' keys).

### Orchestrator changes

- **One connection** (unchanged auth). The reply loop runs N logical agent-loops *inside* one process: `inFlight` becomes **`Map<(threadId, agentId), InFlight>`** to allow concurrent per-agent replies in a thread.
- Trigger: on a human `complete` message, resolve `mentions → agentId[]`, and for each admitted agent enqueue a reply tagged with its `agentId`. Loop guard: an agent message has `agentId != 0` → don't re-trigger unless it `@mentions` another agent and the episode admits it.
- **Synthetic presence is the orchestrator's burden**: write `agent_presence='typing'` on begin, clear on finish/cancel, and a **crash-recovery sweep** on reconnect (the part with no STDB safety net).
- Prompt: same multi-party recipe, but "self" is identified by `agentId` tag rather than identity.

### Mobile changes

- Same add-agent + composer-mention UX as A.
- **Presence/typing renders from the synthetic `agent_presence`/`thread_agents` Views**, not the `user` table — a *separate* render path from human presence (more UI code than A).

| | |
|---|---|
| **Pros** | One connection, no OIDC/issuer infra, `OT-007` untouched; cheap fan-out; BYOK unchanged (already keyed on persona owner). |
| **Cons** | Synthetic presence is crash-fragile (no `clientDisconnected`); **changes the M1.9 reply reducers' auth logic** (adds `agentId` + re-gates on service identity); needs new join table + new synthetic Views; per-agent context isolation is hand-rolled in app code; explicitly the state `DEC-022` deferred *from* — accrues machinery you'd delete to reach A. |
| **Risk** | **Medium** — no new infra, but the synthetic-presence + reducer-guard rewrite is fiddly and the stale-presence failure mode is user-visible ("Pete is typing…" forever after a crash). |
| **Build size** | **M.** No issuer, but more schema (join table + presence + tags), more Views, more mobile render paths, and a reply-reducer change. |

---

## Candidate C — Hybrid / Phased: Service-Tag MVP → Per-Agent Identity ("bridge to A")

Ship B's *tagging* as the **MVP correctness layer** (multi-agent coherence + arbitration + cost guards working end-to-end on the **existing single connection**), then migrate the *identity/presence* layer to A without throwing the arbitration work away. The insight from the code: **arbitration, episodes, mentions, and the multi-party prompt are identity-agnostic** — they work whether the sender is one tagged service identity or N real identities. Only presence/avatars and the reply-reducer auth differ.

### MVP (the C-MVP, ships first)

- Schema: `thread_agent` join, `message.agentId` + `message.mentions`, `episode` + `agent_turn`. **No presence table, no issuer.**
- Reducers: `add_agent_to_thread`, episode guards in `send_message`/`agent_reply_begin`, `agentId` tag (B's reducer model, single connection).
- Orchestrator: `Map<(threadId, agentId), InFlight>`, addressed-only arbitration, multi-party prompt. Presence is **derived, not stored**: mobile shows "🤖 thinking…" purely from the *existing* `streamState='streaming'` message rows (which already carry `agentId` + `runId`) — **no new presence table at all** for the MVP. This sidesteps B's crash-fragility entirely (a streaming row is GC'd/finalized by the existing M1.9 finish/cancel/timeout paths).
- Mobile: add-agent, @mention composer, multi-agent header; typing indicator from streaming rows (already rendered as `▍` today — extend to show which agent).

### Phase-up to identity (post-MVP, the A migration)

- Stand up the OIDC issuer (M2.0-style), add `agent_identity`, switch `add_agent_to_thread` to insert a real `thread_member` for the agent identity, and let the reply reducers revert to the **untouched M1.9 guard** (`ctx.sender` is a `role='agent'` member). The `message.agentId` tag survives as **pure provenance** (Finding 5's "bridge note"), so no data migration of historical rows. Presence upgrades from "derived-from-streaming" to "real `user.online`" with no arbitration rework.

| | |
|---|---|
| **Pros** | Fastest path to a *working, cost-safe* multi-agent thread (the acceptance bar's hard part) with **zero new infra**; the expensive arbitration/prompt work is built once and is identity-agnostic; defers the OIDC issuer risk until coherence is proven; MVP avoids B's synthetic-presence trap by deriving typing from existing streaming rows; clean migration to A (tag → provenance). |
| **Cons** | The MVP carries B's reply-reducer `agentId` change, which is then partly reverted in the A phase (some throwaway in the reducer guard, though the schema columns persist as provenance); two-step rollout. |
| **Risk** | **Low-medium** — MVP touches no auth and no fragile presence; each phase is independently shippable and reversible. |
| **Build size** | **MVP: M (small-M).** Full path to A: M + the issuer (L) later, but spread across milestones. |

---

## Recommendation — adopt **Candidate C** (B-tag MVP → A-identity), mapped to the M2 phases

Rationale: the M2 existential risk is **cost/loops**, not presence realism. C lands the deterministic, reducer-enforced arbitration + episode budget — the single most important guard — on the **existing single connection with no new infra**, then earns per-agent presence by migrating to A once coherence is proven. It treats the arbitration/prompt layer (identity-agnostic, the real engineering) as built-once, and the identity layer (the risky OIDC infra) as a deferred, reversible upgrade. This matches the research's strongest signals: Poe/Discord *addressing-as-arbitration*, AutoGen/SK *iteration-cap-as-safety-net*, enforcement *in the reducer* (Findings 2 & 3), and Finding 5's explicit "phase A with B-style tagging as the bridge."

### Phase mapping

- **M2.1 — Addressing + arbitration (the MVP, do this first).**
  - Schema: `message.mentions` (sidecar), `thread_agent` join, `message.agentId`/`run.agentId` tags, `episode` + `agent_turn`.
  - Reducers: `add_agent_to_thread`; `mentions` validation in `send_message`; **episode budget + once-per-episode enforcement in `agent_reply_begin`** (the cost-safety boundary). Default agent→agent addressing **off** per persona.
  - Orchestrator: `Map<(threadId, agentId)>`; addressed-only trigger; keep the `runId !== ''` loop guard; hard guards (turn budget ≈4, per-(agent,thread) cooldown, max concurrent ≤2–3, per-episode token ceiling summed from M1.9's `agent_reply_finish` usage).
  - Mobile: @mention typeahead composer + add-agent picker.
  - *Acceptance:* ≥2 humans + ≥2 agents converse coherently; an `@everyone` storm and an agent↔agent volley both terminate within the episode budget (unit-testable arbitration, headless integration like the existing `scripts/integration.ts`).

- **M2.2 — Presence/typing.** MVP: derive "🤖 <name> is thinking…" from the existing `streamState='streaming'` rows (carry `agentId`) — **no new table, no crash-fragility**. This is the seam where, when the A migration lands, presence upgrades to real `user.online` with no arbitration change.

- **M2.3 — Multi-party context isolation.** Replace `buildPrompt` with the Finding 4 recipe: per-`self` role-flip (own→`assistant`, others→name-tagged `user`), roster/identity system footer, `stop` sequences + leading-label strip, each agent sees **only its own** `systemPrompt` over the shared transcript. Isolation is by construction (never concatenate another agent's system prompt). Skip non-`complete` streaming rows so half-written turns never enter context.

- **M2.0 / later — Per-agent identity (the A upgrade), slotted when presence realism is wanted.** Self-hosted OIDC issuer + `agent_identity` + connection pool; `add_agent_to_thread` switches to a real `thread_member`; reply-reducer guard reverts to the untouched M1.9 form; `agentId` tag demotes to provenance. Closes `OT-007`/`DEC-022`. Reversible to the single-connection MVP.

### MVP-first cut (smallest shippable coherent slice)

A **single group thread, addressed-only, two tagged agents on one connection**: `message.mentions` + `thread_agent` + `episode`/`agent_turn` + episode-guarded `agent_reply_begin`; orchestrator `Map<(threadId,agentId)>` with addressed-only trigger and the hard guards; composer @mention + add-agent picker; typing derived from streaming rows; multi-party prompt. No OIDC, no presence table, no LLM router. That alone clears the M2 acceptance bar's hard, existential part (coherent + cost-safe multi-agent conversation) and leaves per-agent identity/presence as a clean, reversible follow-on.

---

### Key files for implementation (absolute paths)

- `E:\Cloud\AgentSpace\modules\spacetime\src\index.ts` — add `thread_agent`, `message.mentions`/`message.agentId`, `episode`/`agent_turn`, `add_agent_to_thread`; extend `send_message` (mentions + open episode) and `agent_reply_begin` (episode/turn guard); generalize `my_active_personas`/`my_persona_keys` off `thread_agent`. (`agent_identity` + real-member path is the A phase.)
- `E:\Cloud\AgentSpace\services\orchestrator\src\replyLoop.ts` — `inFlight` → `Map<(threadId,agentId)>`; addressed-only trigger reading `msg.mentions`; keep `runId !== ''` guard; per-agent run lifecycle (begin/delta/finish already per-run-owner-safe).
- `E:\Cloud\AgentSpace\services\orchestrator\src\prompt.ts` — generalize `selectPersona` to per-addressed-agent; replace `buildPrompt` with the multi-party role-flip + name-tag + roster-footer recipe (Finding 4 §7).
- Mobile: `apps/mobile/src/screens/{Thread,ThreadMembers}.tsx` (+ new `AgentPicker`) — @mention composer, add-agent flow, derived typing indicator.

**One-line recommendation:** Build C — ship the reducer-enforced addressed-only arbitration + episode budget on the existing single connection with persona-tagged messages (the identity-agnostic, cost-critical core), then upgrade to per-agent SpacetimeDB identities for real presence as a deferred, reversible phase; the arbitration and multi-party-prompt work is built once and survives the migration unchanged.
