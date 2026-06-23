# M2 research — FINAL synthesized design input (recommendation)

> Generated 2026-06-22 by the m2-multiagent-plan-research workflow (8 agents). See DEC-031.

The code confirms every load-bearing claim in the adversarial critique. The critical facts are verified:

- `replyLoop.ts:63` — `if (msg.runId !== '') return` is the only loop guard; agent replies carry a non-empty runId so they don't re-trigger today.
- `replyLoop.ts:141` — `isAgent: m.sender.isEqual(self)` — under a shared service identity this would be true for *every* agent's message (the persona-bleed showstopper).
- `replyLoop.ts:45` — `Map<bigint, InFlight>` keyed by threadId; `replyLoop.ts:67` supersedes exactly one entry.
- `prompt.ts:21` — sort returns `0` on `sentMicros` ties (no total-order tiebreak).
- `prompt.ts:67` — `selectPersona` reads the singular `thread.agentId`.

I have everything needed. Here is the final synthesized design input.

---

# M2 MULTI-AGENT GROUP THREADS — FINAL DESIGN INPUT

This is the decision-ready synthesis feeding the M2.1/M2.2/M2.3 write-plans. Recommendation is **Candidate C (tagged single-connection MVP → per-agent identity upgrade)**, decisively, with the rationale and the full deltas below. Uncertainties are flagged explicitly in §5, not papered over.

---

## 1. RECOMMENDED M2 ARCHITECTURE

### 1.1 Identity / participation — **Candidate C: persona-tagged single connection now, per-agent SpacetimeDB identity later**

Ship the multi-agent **correctness + cost-safety** layer on the **existing single `service` connection**, with each agent message **tagged** by `agentId`. Defer per-agent SpacetimeDB identities (real presence) to a later, reversible upgrade (M2.4 / BL-014).

**Why C and not A or B (the decisive trade-off):** The M2 existential risk is **cost/loops, not presence realism** — and that risk is *identical* across all three candidates because the entire safety system (episode budget, turn de-dup, per-run token cap) is **net-new code that does not exist today** (verified: `agent_reply_begin` enforces only runId-nonempty + agent-membership + runId-uniqueness; nothing about cost or turns). Given the safety system must be built from scratch regardless, pick the candidate that lets you build and prove it with the **fewest new failure surfaces**:

- **Candidate A (per-agent identity) is the wrong *first* step.** It forces a hard binary gate up front — a spec-compliant self-hosted OIDC issuer + JWKS reachable by the STDB host + a connection pool + a new `agent_identity` table — before a *single* multi-agent thread works. Worse, A has the **worst default coherence**: N independent connections react to the same human message with no shared scheduler (all N stream at once) and suffer cross-connection ordering races (agent B may build context before agent A's reply is visible in B's subscription → answers stale context). A's presence realism and A's coherence are in direct tension.
- **Candidate B (service-tag, permanent)** accrues **synthetic-presence machinery** (a fake `agent_presence` table with no `clientDisconnected` safety net → "Pete is typing…" forever after a crash) that you'd delete on the way to A. It's debt pointed away from the vision.
- **Candidate C** ships the cost-safe, coherent core on **zero new infra** (single connection → natural turn serialization in one in-memory loop → ordered, coherent turns), **derives typing from existing `streaming` message rows** (no synthetic-presence table, self-heals via the M1.9 watchdog/reaper), and the arbitration + multi-party-prompt work is **identity-agnostic** — it survives the eventual A migration unchanged. The `agentId` tag demotes cleanly to provenance when real identities land. This matches the research's strongest signals (Poe/Discord *addressing-as-arbitration*, AutoGen/SK *iteration-cap-as-safety-net*, enforcement *in the reducer*) and Finding 5's explicit "phase A with B-style tagging as the bridge."

### 1.2 Arbitration policy — **addressed-only + hard episode guards, enforced in the reducer**

Reject the LLM-router (AutoGen `auto` / LangGraph supervisor / CrewAI `manager_llm`) for v1: it adds a per-turn LLM call on the critical path, is the documented loop source in both LangGraph and CrewAI, and deterministic @mention resolution gives ~90% of the value at zero marginal cost and zero loop risk. Keep it as an *optional* future thread mode, gated behind the same episode budget so even a looping router is financially harmless.

The policy, in three separable layers (each independently testable):

1. **Grammar** (parse/resolve a message → an address set of agent IDs).
2. **Policy** (the address set *is* the candidate reply set; unaddressed agents stay silent by default).
3. **Guards** (episode budget / turn de-dup / token ceiling — always on, independent of addressing).

**The enforcement boundary is the reducer, not the orchestrator.** The $47K-loop post-mortem's load-bearing lesson is "enforcement must be outside agent code, synchronous, pre-execution." In AgentSpace the reducer *is* that boundary: `agent_reply_begin` refuses to admit a run that violates the episode budget, so the orchestrator (agent code) literally cannot start a reply the module won't allow. This is architecturally stronger than every framework surveyed (all enforce in app code).

### 1.3 Addressing grammar — **structured `mentions` sidecar, resolved to IDs in the composer**

Store mentions as a **structured array keyed by stable participant ID**, populated by the RN composer at selection time; render the display name from the live roster. Never re-parse display-name text on read (survives persona renames; the `agent` table has a `version` counter and names are user-editable and collidable).

```
message.mentions : Vec<Mention>            // additive column; [] for legacy/unaddressed
Mention = { kind: 'agent' | 'human' | 'all', ref: u64 /* agentId; 0 for 'all' */, start: u32, len: u32 }
```

- `start`/`len` are offsets into `text` so the client renders a chip without re-tokenizing.
- `text` keeps a plain readable form (`@Pete`) for mention-unaware fallback; the `mentions` array is the source of truth for addressing.
- **MVP `ref` = `agentId` (u64)**, because agents have no distinct identity yet under C. On the A upgrade, `ref` migrates to `Identity` (the change is additive; old rows keep their `agentId` semantics as provenance).
- Semantics: `@<agent>` → that agent; `@a @b` → both, ordered by mention position; `@everyone`/`@here` (`kind:'all'`) → all agents in the thread (the storm vector — capped by the episode budget = `addressedCount`); agent→agent `@mention` in an agent's reply → **allowed but default-off per persona**, and bounded by the episode budget + once-per-episode de-dup.
- **NL direct address** ("Hey Pete, …") is an *orchestrator-side* soft heuristic (a leading-vocative regex `^\s*(hey|hi|ok|okay|yo)?\s*<RosterName>[,:]`, roster names escaped), weaker than an explicit `@`, addresses exactly one agent, never `@everyone`; ambiguous → do nothing. It lives in the arbitration layer behind the same guards — **not** in the deterministic reducer.

### 1.4 Multi-party prompt recipe — **per-agent role-flip + inline name-tags + roster footer + isolation by construction**

Replace `buildPrompt` (which today maps `isAgent ? 'assistant' : 'user'` on a 2-role assumption). For each agent being asked, build a fresh viewpoint over the *shared* transcript:

1. **Role-flip per target agent:** the target agent's own prior turns → `assistant` (unlabeled); **every** other participant's turns (all humans AND all other agents) → `user`.
2. **Name-tag every non-self turn inline** as `Name: text` inside the `user` content (do **not** rely on the API `name` field — inconsistent/rejected across the 16 providers; OpenAI forbids spaces). Merge consecutive non-self turns into one `user` block (newline-separated) so providers that require alternation (Anthropic) stay happy.
3. **Roster/identity footer** appended to the persona's *own* `systemPrompt`: `You are "{selfName}", one participant in a group chat. Others present: - Alice (human) - Ada (AI agent) … Messages from others are prefixed with their name. Write ONLY {selfName}'s next message as plain text; do not prefix it with your name; never write or continue another participant's message.`
4. **Context isolation = what is *not* shared.** The transcript is common; **each agent sees only its own `systemPrompt`** — never concatenate another agent's system prompt (the leakage vector). Isolation falls out by construction.
5. **Anti-impersonation guards:** pass other participants' `"\n{Name}:"` strings as `stop` sequences to the gateway; post-process the reply to strip a leading `^{anyRosterName}:\s*`.
6. **Transcript hygiene (already partly present):** keep only `streamState === 'complete'` rows (skip in-flight/failed/cancelled), and **end on a `user` turn** (keep the existing trailing-assistant pop).

**The CRITICAL fix this implies (verified showstopper):** under C's shared service identity, `isAgent = m.sender.isEqual(self)` is **true for every agent's message** → agent A would see agent B's words as its *own* prior `assistant` output → persona-bleed (A literally continues B's text). So `PromptRow` **must gain an `agentId` (and a `senderName`/`senderKind`)**, and `isAgent` must be computed from the **tag** (`m.agentId === self.agentId`), never from the shared identity. This is the single thing most likely to ship silently broken — it is a blocking prerequisite, not a nice-to-have.

### 1.5 Presence / typing — **derive from `streaming` message rows (MVP); real `user.online` on the A upgrade**

MVP renders "🤖 {name} is thinking…" purely from the existing `streamState === 'streaming'` message rows (which already carry `agentId` + `runId` and already render a `▍` cursor today) — **no new presence table, no crash-fragility**. A stuck streaming row is finalized by the M1.9 idle watchdog + a new **module-side reaper** (a reducer/scheduled sweep that fails out `streaming` messages / `running` runs older than T) so a non-restarting orchestrator crash can't leave a permanent "thinking" indicator. On the A upgrade, presence upgrades to real `user.online` via the `clientConnected/Disconnected` lifecycle hooks with **no arbitration change** — the derive-from-streaming seam is exactly where that swap happens.

---

## 2. CONCRETE DELTAS

### 2.1 SpacetimeDB module (`modules/spacetime/src/index.ts`)

**New tables**
- `thread_agent` — `{ threadId: u64, agentId: u64, addedBy: identity, addedAt }`, unique on `(threadId, agentId)`. The many-agents-per-thread join (generalizes the singular `thread.agentId`).
- `episode` — `{ id: u64 (autoinc/pk), threadId: u64, rootMessageId: u64, turnsRemaining: u8, tokenBudgetRemaining: u64, openedAt, status: 'open'|'closed' }`. The cost/loop ledger. **Opened only by `send_message` on a *human* `complete` message.**
- `agent_turn` — `{ episodeId: u64, agentId: u64 }`, unique on `(episodeId, agentId)`. Once-per-episode-per-agent de-dup.

**Changed columns (all additive)**
- `message.mentions: Vec<Mention>` (sidecar; `[]` default).
- `message.agentId: u64` — `0` for humans, the persona id for an agent message (provenance tag; sender stays the service identity under C, survives as provenance under A).
- `message.episodeId: u64` — **the episode-inheritance column the candidates omitted.** Threaded trigger → reply → next trigger so agent→agent replies inherit the *same* budget instead of resetting it. Also the key for **per-episode supersede** (§2.2).
- `run.agentId: u64` and `run.episodeId: u64` — same tags on the run.

**Changed reducers**
- `send_message` — accept `mentions`; validate each `ref` is a current thread member (deterministic, membership data already present; gated by `ctx.sender == author`); on a *human* message, **open an `episode`** with `turnsRemaining = max(MAX_TURNS≈6, addressedAgentCount)` and `tokenBudgetRemaining = EPISODE_TOKEN_CEILING`, stamp `message.episodeId`.
- `agent_reply_begin` — **the enforcement boundary.** In addition to today's checks, atomically and *before* the message INSERT: load the episode by the triggering message's `episodeId`; **reject** if `episode.status != 'open'`, `turnsRemaining == 0`, `tokenBudgetRemaining <= 0`, an `agent_turn{episodeId, agentId}` already exists, or the count of `run` rows with `threadId=X && status='running'` ≥ `MAX_CONCURRENT` (≈2–3); else **decrement `turnsRemaining`, insert `agent_turn`**, stamp `run.episodeId`/`run.agentId`. (Concurrency cap lives **here in the reducer**, not orchestrator memory — so it survives the A upgrade where per-connection in-memory maps can't see each other.)
- `agent_reply_finish` — decrement `episode.tokenBudgetRemaining` by the run's reported tokens; close the episode when `turnsRemaining == 0` (or on a TTL).

**New reducers**
- `add_agent_to_thread(threadId, agentId)` — gated to a thread member; inserts the `thread_agent` join row. (Under C the *member* posting remains the service identity; under A this switches to inserting a real per-agent `thread_member`.)
- `remove_agent_from_thread(threadId, agentId)` — creator-gated.
- A **streaming reaper** — a reducer (or scheduled-table tick) that drives `streaming` messages / `running` runs older than `STREAM_TTL` to `failed`/`cancelled` (presence self-heal + stuck-run cleanup for the no-restart crash case).

**Changed Views**
- `my_persona_keys` — **must be rewritten off `thread_agent`** (today it reads the singular `thread.agentId`). Without this, N−1 agents in a group resolve no key → `MissingKeyError`. For each thread the orchestrator serves, union the keys of *all* agents in `thread_agent` → their personas → owners.
- `my_active_personas` — generalize from the singular `thread.agentId` to all `thread_agent` rows in served threads (the persona *roster*, not "the active persona").

### 2.2 Orchestrator (`services/orchestrator/src/`)

- `replyLoop.ts`: `inFlight: Map<bigint, InFlight>` → **`Map<` `${threadId}:${agentId}` `, InFlight>`** (concurrent per-agent replies). The trigger (lines 60–69) becomes: keep the `msg.runId !== ''` loop guard; on a `complete` message, resolve `msg.mentions → agentId[]` (+ NL heuristic as one soft candidate), and for **each admitted agent** that the orchestrator serves, enqueue a reply tagged with its `agentId` and the message's `episodeId`. Process addressed agents **in mention order, one in-flight at a time per thread** (single loop → ordered, coherent turns).
- **Supersede semantics (verified gap — `replyLoop.ts:67` supersedes exactly one thread entry).** A new human message must supersede **per-episode, not per-thread**: cancel only in-flight replies whose `episodeId` is now superseded; the new message opens a fresh episode. (Per-thread cancel-all would livelock agents in a 2-human thread — every keystroke kills mid-stream replies; cancel-none loses the M1.9 stale-context guard.) This reuses the `episodeId` column from §2.1.
- **Per-run output-token cap:** pass `maxOutputTokens` to `gateway.stream`. The episode budget can't bound a *single* run's cost (usage is only known after the call), so worst-case spend = `turns × maxOutputTokens`.
- `prompt.ts`: `PromptRow` gains `agentId` + `senderName` + `senderKind`; `isAgent` computed from the **tag** (§1.4 showstopper); replace `buildPrompt` with the role-flip + name-tag + roster-footer recipe; **add a `message.id` tiebreak to the sort** (line 21 returns `0` on `sentMicros` ties → non-deterministic transcript under concurrency). `selectPersona` is called **per addressed agent** (its signature is already per-ID — no change to the function itself, only the caller loops).
- `byok.ts` / `index.ts`: **no change** — the resolver already keys on `"<ownerHex>:<provider>"` and the `my_persona_keys` view rewrite (§2.1) feeds it all owners' keys; the single orchestrator box keypair in `service` decrypts for all agents. (Preserve the keyless local-provider path per agent.)
- **Error-reply hygiene:** coalesce/suppress per-agent `⚠️` messages so an `@everyone` with 2 missing keys doesn't spam 2 warnings per human turn (error replies already carry a non-empty runId so they don't re-trigger — fine on the loop axis, bad on UX).

### 2.3 Mobile (`apps/mobile/src/screens/`)

- `Thread.tsx`: @mention typeahead composer over the subscribed member roster (humans + agents + a synthetic `@everyone` row), case-insensitive prefix-then-substring, selection inserts an ID-bound token + pushes a `Mention` into composer state; recompute `start/len` on send. Multi-agent header (list/badge). **Audit the delta render: it must group `reply_delta` concatenation by `runId`** (today's world has one stream per thread; two concurrent streaming rows otherwise garble interleaved text). Typing indicator derives from `streaming` rows, prefixed with the agent name.
- `ThreadMembers.tsx`: a **"+ Add agent"** flow (distinct from "+ Add member") → a new **`AgentPicker`** (over `my_agents`, excluding agents already in the thread) → `add_agent_to_thread`; agent rows in the member list show name + derived presence + creator-gated remove.
- `ThreadList.tsx`: group-with-agents avatar/badge; optional `Name:` sender prefix in the last-message subtitle.
- New `AgentPicker.tsx` (parallel to `UserPicker`).

---

## 3. PHASING (MVP-first; maps to M2.1/M2.2/M2.3)

**MVP slice (the smallest coherent, cost-safe cut — ships first, inside M2.1):** one group thread, addressed-only, ≥2 tagged agents on the existing single connection. Schema: `thread_agent`, `message.mentions`/`agentId`/`episodeId`, `episode`, `agent_turn`. Reducers: `add_agent_to_thread`, episode open in `send_message`, episode/turn/concurrency enforcement in `agent_reply_begin`, the streaming reaper. Orchestrator: `Map<threadId:agentId>`, addressed-only trigger, per-episode supersede, per-run token cap, tag-based `buildPrompt`. Mobile: @mention composer + add-agent picker + by-runId delta grouping. **No OIDC, no presence table, no LLM router.** This alone clears the acceptance bar's hard, existential part (coherent + cost-safe multi-agent conversation).

- **M2.1 — Addressing + arbitration (the MVP).** *Acceptance:* ≥2 humans + ≥2 agents converse coherently; an `@everyone` storm and an agent↔agent volley both **terminate within the episode budget**; unit-testable arbitration + a headless integration in the style of the existing `scripts/integration.ts` (no key needed). Default agent→agent addressing **off** per persona.
- **M2.2 — Presence/typing.** Derive "🤖 {name} is thinking…" from `streaming` rows (no new table). This is the seam where the A upgrade later swaps in real `user.online`.
- **M2.3 — Multi-party context isolation.** Land the full `buildPrompt` recipe (role-flip + name-tag + roster footer + `stop` sequences + leading-label strip), each agent seeing only its own `systemPrompt`. (Note: the *tag-based `isAgent`* fix is pulled **forward into the MVP** because it's a correctness showstopper, not deferrable to M2.3 — M2.3 is the *quality* layer on top.)

**Explicitly deferred (→ BACKLOG / later milestone):**
- **Per-agent SpacetimeDB identities + real presence + OIDC issuer + connection pool** → **M2.4 / BL-014** (closes OT-007 + DEC-022). The `agentId` tag demotes to provenance; reply-reducer guard reverts to the untouched M1.9 form; reversible to the single-connection MVP.
- **LLM coordinator/router arbitration mode** (optional "let the agents figure it out" thread setting) → BACKLOG, gated behind the episode budget.
- **Per-agent cost metering dashboards / per-day-per-agent budgets** beyond the per-episode ceiling → BACKLOG.
- **Selective per-agent message *visibility*** (an agent seeing only messages it was mentioned in) → BACKLOG; M2.3 isolates *instructions*, not *visibility* (all agents see the shared transcript).

---

## 4. MUST-HAVE SAFETY GUARDS (blocking — gate ANY multi-agent ship)

Every one is **net-new** (verified absent from `index.ts`/`replyLoop.ts` today). 1–4 and 8 are the cost/loop existential set; 6 is the correctness showstopper:

1. **Episode + turn budget, enforced pre-execution in `agent_reply_begin`** (reducer). Open only on a *human* `send_message`; reject when `turnsRemaining == 0`. The single most important guard.
2. **`episodeId` threaded trigger → reply → next trigger** (new column). Without inheritance, agent→agent replies reset the budget and the cap is meaningless; also fixes per-episode supersede.
3. **Once-per-episode-per-agent de-dup** (`agent_turn` unique, checked+inserted in `agent_reply_begin`). Addressing alone does *not* stop A↔B; this does. Makes `@everyone` self-limiting (budget = `addressedCount`).
4. **Per-run output-token cap** (`maxOutputTokens` to the gateway). The episode budget can't bound a single catastrophic run; worst case becomes `turns × maxOutputTokens`.
5. **Concurrency cap enforced in the reducer** (count `running` runs in the thread), never in orchestrator memory — survives the A per-connection upgrade.
6. **Tag-based role-flip in `buildPrompt`** — add `agentId` to `PromptRow`; compute `isAgent` from the tag, never the shared sender identity. The persona-bleed showstopper; most likely to ship silently broken.
7. **`buildPrompt` tiebreak on `message.id`** — deterministic transcript under same-microsecond concurrent turns.
8. **Episode token ceiling** summed across runs (decrement in `agent_reply_finish`; reject new runs past it) — the per-session budget that was *the* missing control in the $47K loop.
9. **Module-side reaper** for `streaming`/`running` rows older than T — the orchestrator watchdog dies with the process; this clears stuck "typing" + orphaned runs on a non-restarting crash.
10. **Audit the mobile delta render groups by `runId`** before allowing two concurrent streaming rows — else interleaved deltas garble.
11. **`my_persona_keys` rewritten off `thread_agent`** — else N−1 agents hit `MissingKeyError`; coalesce per-agent error messages.

---

## 5. TOP OPEN QUESTIONS / FOUNDER DECISIONS

1. **`MAX_TURNS` per episode + `EPISODE_TOKEN_CEILING` + `MAX_CONCURRENT` + cooldown — the actual numbers.** Recommend `MAX_TURNS = max(6, addressedCount)`, `MAX_CONCURRENT = 2`, plus a per-(agent,thread) cooldown (≈a few seconds). The token ceiling needs a real cost target — *founder input needed* (what's the most a single human message may cost?). These are the dials between "feels dead" and "bankrupts us."
2. **`@everyone` vs the turn cap — confirm `addressedCount` self-limiting.** With a fixed cap of 6 and `@everyone` to 5 agents, the 6th turn is one straggler. Recommend budget = `addressedCount + slack` so every addressed agent speaks exactly once. Confirm this is the desired `@everyone` UX (all answer once, then stop) vs. a hard small cap that silently drops agents.
3. **Agent→agent addressing default — off per persona (recommended), opt-in.** Confirm. This is the loop vector; default-off is the Discord/AutoGen-FSM consensus. Should an opt-in agent be allowed to wake *another* agent, or only respond when a *human* re-addresses? (Recommend: opt-in agent may wake another, but strictly bounded by episode budget + once-per-episode.)
4. **When to spend the per-agent-identity (Candidate A) upgrade.** C ships real value without it, but agents render as a shared "service" presence until A lands. Decide whether real per-agent avatars/online-dots are a launch requirement (pull A into M2) or a fast-follow (M2.4). Carries the OIDC-issuer infra risk (Finding 5 issue #2600: JWKS reachability).
5. **NL direct address ("Hey Pete") in MVP or deferred?** It's a soft heuristic with false-positive risk. Recommend shipping `@mention` only in the MVP and adding the NL vocative heuristic in M2.3 once the explicit path is proven. Confirm.
6. **Does the existing `thread.agentId`-bound 1:1 agent DM stay as-is, or migrate to a `thread_agent` row with one agent?** Recommend keeping `create_agent_dm`/`thread.agentId` for back-compat (degenerate single-agent case) and using `thread_agent` only for groups, to keep the change additive. Confirm no desire to unify immediately.

---

## 6. SUGGESTED VERIFICATION (V-n) + BACKLOG CARVE-OUTS

**New `VERIFICATION.md` items (on-device / real-world, founder-owned):**
- **V-10 — Multi-agent coherence (on-device).** A group with ≥2 humans + ≥2 agents; `@`-address one agent → only it replies; `@a @b` → both reply in order, each seeing the other's turn; conversation reads coherently with correct name attribution and no persona-bleed.
- **V-11 — Loop/cost guard (on-device, real key).** Enable agent→agent addressing on two personas; have them `@`-volley; confirm the exchange **terminates within the episode budget** and total token spend stays under the ceiling (watch `run` token sums). The existential test.
- **V-12 — `@everyone` storm bound.** `@everyone` in a thread with N agents → each addressed agent replies at most once, then it stops; no runaway.
- **V-13 — Typing indicator + crash self-heal.** Agents show "🤖 {name} is thinking…" while streaming; kill the orchestrator mid-stream and confirm the indicator clears (via the reaper/watchdog) rather than sticking.
- **V-14 — Per-agent BYOK in a group.** Two agents owned by different users (different keys) both reply correctly in one group thread; an agent whose owner has no key produces a single (non-re-triggering) ⚠️, not spam.
- (When A lands) **V-15 — per-agent identity presence/avatars** (real `user.online`, distinct avatars).

**BACKLOG carve-outs:**
- **BL-014 / M2.4** — per-agent SpacetimeDB identities + OIDC issuer + connection pool + real presence (closes OT-007 + DEC-022). Revisit trigger: real per-agent avatars/presence become a launch requirement.
- **BL-0xx** — LLM coordinator/router arbitration mode (optional thread setting), gated behind the episode budget.
- **BL-0xx** — per-agent / per-day cost metering + budgets beyond the per-episode ceiling (the BAMAS "budget as first-class scheduling input" direction).
- **BL-0xx** — selective per-agent message *visibility* (mentioned-only context windows), distinct from M2.3's instruction isolation.
- **BL-0xx** — durable Postgres/KMS BYOK backing (existing BL-011) intersects multi-agent key resolution; revisit when agent count per thread grows.

---

**One-line bottom line:** Build Candidate C — ship the reducer-enforced *addressed-only arbitration + episode budget + per-run token cap + tag-based prompt role-flip* on the existing single connection with persona-tagged messages (the identity-agnostic, cost-critical core that clears the acceptance bar), and defer per-agent SpacetimeDB identities/real presence to a reversible M2.4 upgrade where the `agentId` tag demotes to provenance and the arbitration work survives unchanged. The blocking prerequisites are guards 1–4, 6, and 8–11 in §4 — they are the entire safety + correctness system and none of them exist in the code today.

Relevant files (absolute): `E:\Cloud\AgentSpace\modules\spacetime\src\index.ts` (episode/agent_turn/thread_agent tables, `agent_reply_begin` enforcement, `episodeId` threading, `my_persona_keys`/`my_active_personas` rewrite, streaming reaper); `E:\Cloud\AgentSpace\services\orchestrator\src\replyLoop.ts` (`Map<threadId:agentId>`, addressed-only trigger, per-episode supersede, per-run output cap); `E:\Cloud\AgentSpace\services\orchestrator\src\prompt.ts` (`PromptRow.agentId`/`senderName`, tag-based `isAgent`, `message.id` sort tiebreak, multi-party recipe); `E:\Cloud\AgentSpace\apps\mobile\src\screens\{Thread,ThreadMembers}.tsx` + new `AgentPicker.tsx` (@mention composer, add-agent flow, by-runId delta grouping).
