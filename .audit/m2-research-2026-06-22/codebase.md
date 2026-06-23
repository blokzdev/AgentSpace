# M2 research — Codebase map — single-agent assumptions

> Generated 2026-06-22 by the m2-multiagent-plan-research workflow (8 agents). See DEC-031.

Now I'll compile my findings into a comprehensive map:

## AGENTSPACE CODEBASE MAP: SINGLE-AGENT ASSUMPTIONS FOR M2

### PART A: SpacetimeDB Module (modules/spacetime/src/index.ts)

#### Tables & Single-Agent Assumptions

| Table | Relevant Field | Single-Agent Assumption | M2 Change Needed |
|-------|----------------|----------------------|------------------|
| **thread** (line 20–30) | `agentId: t.u64()` | Singular persona per thread (line 28 comment: "bound persona for an agent DM (0 = human-only thread)"). All agent logic keyed on this one ID. | M2 must extend: threads may have **multiple agent members** now. `agentId` becomes vestigial; agents are identified via `thread_member` roles instead. M2 design choice: drop `agentId` entirely or keep it for backward compat / agent-group metadata? |
| **thread_member** (line 33–48) | `role: 'human' \| 'agent'` | Role is **static per membership**. All "agent" members are the **single service identity** (ctx.sender in replyLoop). No per-agent identity tracking. | M2: each agent member must have a **distinct SpacetimeDB identity** so they appear as separate presence/avatar/participant. `role='agent'` alone no longer identifies which agent. Need new mapping: agent identity → agent persona. |
| **message** (line 52–68) | `sender: t.identity()` | Assumes sender is either a human OR the **single `service` identity**. The orchestrator always posts as `self` (replyLoop line 61: `if (msg.sender.isEqual(self)) return`). | M2: message.sender could be any of **N agent identities**. Orchestrator must map `sender` → agent persona to retrieve context. |
| **run** (line 74–90) | `agent: t.identity()` | Agent is always the **same `service` identity** (line 83, 388 in reducer). One run per thread at a time (inFlight Map<threadId, InFlight>). | M2: **multiple agents can reply concurrently** in a group thread. Needs run arbitration: which agent(s) reply? When? Cost guards essential. |
| **replyDelta** (line 99–114) | `runId: t.string()` | Correlation key linking to the **one in-flight agent reply per thread** (line 110 denormalization comment). | M2: multiple runs per thread → need thread + agent ID to disambiguate. Or extend runId format. |
| **agent** (line 121–137) | `owner: t.identity()` | Agent config is immutable data, indexed by owner. No agent-specific identity; the orchestrator fetches it by `thread.agentId`. | M2: OK as-is; agent configs remain immutable. But now the orchestrator must resolve **N personas per group** and pick/route replies. |
| **service** (line 142–148) | `identity` + `encPubKey` | **Singleton** (id=0). One orchestrator identity for the entire system. All agent replies posted as this identity. | M2 TENSION: Either (1) keep service singleton + tag messages with agent persona ID (message.agentId?), or (2) mint **per-agent SpacetimeDB identities** and move to auth OT-007 service-account model. Path (2) requires new table `agent_identity` or extend `agent`. |
| **providerKey** (line 153–168) | `by_owner_provider` index | Sealed keys are per (owner, provider). Orchestrator decrypts via `my_persona_keys` view filtering by persona owner. | M2: unchanged. But orchestrator must resolve keys for **each agent persona** at call time, not just one. |

#### Reducers with Single-Agent Logic

| Reducer | Single-Agent Assumption | M2 Change Needed |
|---------|----------------------|------------------|
| **create_agent_dm** (line 316–331) | Line 320–321: fetches `service` singleton, adds it as role='agent' member. Binds `thread.agentId` to the one persona. | M2: agent DMs can remain 1:1. But creation flow must decide: mint a new agent identity or keep using service singleton? If per-agent identities, this reducer becomes the first to use OT-007 service-account mechanism. |
| **add_member** (line 333–342) | Line 335–341: allows a human to add humans to groups. Role is 'human' | 'agent' hardcoded. Only the **service identity** can post as 'agent'. | M2: need **add_agent** reducer (or extend add_member) to add agent **personas** to a group thread. Must mint new identity per agent or reuse service + tag. |
| **agent_reply_begin** (line 375–405) | Line 379–381: guards `if (m.role === 'agent')` — checks that ctx.sender (the orchestrator) is an agent member. Only the **single service identity** can call this. | M2: multiple orchestrator instances / agent identities calling this. Each agent identity must own its own runs. Authentication/verification becomes critical (OT-007). |
| **agent_reply_finish / cancel / delta** (line 441–485) | Lines 449–450, 478: re-check `ctx.sender` owns the run (only the one who called begin can finish). Guards against cross-agent clobbering, but assumes **one agent per thread**. | M2: unchanged logic (good), but with multi-agent identities, this re-check now **separates agent A's reply from agent B's**. Reducer stays safe. |
| **send_message** (line 345–361) | No agent-specific logic; humans send human messages. | M2: unchanged for humans. But agents now send via distinct identities, so reducer auto-routes by ctx.sender. |

#### Views (Access Control)

| View | Single-Agent Assumption | M2 Change Needed |
|------|----------------------|------------------|
| **my_active_personas** (line 591–602) | Line 595–601: filters threads where ctx.sender is `role='agent'` member, then returns `agent` rows for `thread.agentId`. Assumes one agent per thread. **The orchestrator's runtime persona lookup.** | M2 CRITICAL: Orchestrator now sees **all personas bound to threads it's an agent member of**. But logic stays the same: iterate my_thread_members (role='agent'), lookup agent by ID. `my_active_personas` becomes the **persona roster**, not "the active persona." Orchestrator must **selectPersona(agentIdPerThread, ...)** or iterate all. |
| **my_persona_keys** (line 624–635) | Line 631: looks up keys for the **one bound agent**'s owner: `thread.agentId` → `agent.owner` → keys. Assumes one persona per thread. | M2: View must now expose keys for **all agent owners in threads the orchestrator is an agent member of**. Expand the flatMap: for each thread, find all agent members, map to their personas, union all their owners' keys. |
| Other views (my_threads, my_thread_members, my_thread_messages, my_reply_deltas) | No explicit single-agent assumption; membership-scoped correctly. | M2: unchanged. |

---

### PART B: Agent Orchestrator (services/orchestrator/src/)

#### replyLoop.ts (line 37–217)

| Function / Variable | Single-Agent Assumption | M2 Change Needed |
|---------------------|----------------------|------------------|
| **startReplyLoop** (line 37–70) | Line 45: `inFlight = Map<bigint, InFlight>()` maps threadId → one in-flight reply. Line 64–68: when any human message arrives in a thread the orchestrator is an agent member of, it **always** triggers a reply. | M2: inFlight must become `Map<(threadId, agentId), InFlight>` to track **N concurrent replies per thread**. TURN ARBITRATION: logic to decide **which agents reply** to which messages (or all?). If all agents reply to all messages → infinite loop risk + unbounded token cost. Need a scheduler/cost guard. |
| **handleReply** (line 80–217) | Line 126–133: selects one persona via `selectPersona(threads, agents, threadId)`. Single persona per thread. Line 146: `credentialRef = <ownerHex>:${model.provider}` assumes **one persona's owner**, not N. | M2: must accept `agentId: bigint` parameter. Call `selectPersona(threads, agents, threadId, agentId)` to pick the right one. Loop structure per agent ID, not just threadId. |
| **message filter** (line 60–64) | Filters: skip own writes, skip in-flight streams, skip other agents' replies (runId != ''), skip if not an agent member. Assumes **only one agent member** (self) per thread. | M2: filter still works! But now `msg.sender.isEqual(self)` only matches **that specific agent identity**, not all agents. Other agent's messages slip through with runId='', so they're not fed back (good). |

#### prompt.ts (line 1–145)

| Function / Interface | Single-Agent Assumption | M2 Change Needed |
|---------------------|----------------------|------------------|
| **selectPersona** (line 66–80) | Core logic: threads → agentId → agents → pick one. Falls back to DEFAULT_MODEL if no agent bound. Returns `Persona` with one model + owner. | M2: signature stays same, but caller must iterate agents and call this **per agent per thread**. No change to selectPersona itself; it's already per-ID. |
| **buildPrompt** (line 20–34) | Line 25: `r.isAgent ? 'assistant' : 'user'`. Maps messages to 2-role LLM format. Assumes **one agent voice**. | M2 HARD PROBLEM: with N agents + M humans in the same thread, how do you represent them to an LLM with only user/assistant/system roles? Options: (1) name-tag in message text (e.g., "Alice (human): …", "Bob (agent): …"); (2) per-agent separate conversations (each agent gets a thread view filtered to only itself); (3) agent-specific system prompt modulation (e.g., "You are X; here's the group chat: …"). SPEC §5 placeholder. |
| **AgentRef / ThreadRef** (line 47–58) | Minimal views. No single-agent assumption here. | M2: unchanged. |

#### index.ts (line 36–53)

| Function | Single-Agent Assumption | M2 Change Needed |
|----------|----------------------|------------------|
| **createOrchestrator** + **main** | Line 44: registers **the one service identity**. Line 46–49: BYOK resolver per persona owner. Line 52: `startReplyLoop(conn, identity, gateway)` — passes `identity` (the service). | M2: if per-agent identities, the orchestrator becomes **N separate processes** (one per agent) or **one process with N sub-loop instances**. If service-singleton reuse, change is minimal: just replyLoop arbitration. |

#### spacetime.ts (line 30–54)

| Function | Single-Agent Assumption | M2 Change Needed |
|----------|----------------------|------------------|
| **connectOrchestrator** | Persists auth token so orchestrator keeps a stable Identity (the **one service identity**). | M2: if per-agent identities, each agent process needs its own token. Orchestrator becomes multi-tenant auth. If reused service identity, unchanged. |

#### byok.ts (line 73–101)

| Function | Single-Agent Assumption | M2 Change Needed |
|----------|----------------------|------------------|
| **createByokResolver** | Resolves `ref = "<ownerHex>:<provider>"` by iterating `my_persona_keys` (which is **all the orchestrator's agent members' owners' keys**). No single-agent assumption. | M2: unchanged! View expansion (my_persona_keys) means resolver sees keys from all agent owners. Orchestrator can seamlessly decrypt for any agent persona. |

---

### PART C: Mobile App (apps/mobile/src/screens/)

#### Thread.tsx (line 19–161)

| Component Logic | Single-Agent Assumption | M2 Change Needed |
|-----------------|----------------------|------------------|
| **Header title** (line 73–84) | Line 76: if `thread.agentId !== 0n`, show agent name. Assumes **one agent per thread**. | M2: for agent DMs, unchanged. For group threads with agents, either (1) show all agent names ("Chat with Alice, Bob, Charlie"), or (2) show generic "Group with 2 agents, 3 humans". |
| **Sender badge** (line 86–87, 116) | Line 116: `agentMemberHexes.has(sender)` checks if sender is any agent member; displays emoji. No single-agent assumption here! | M2: unchanged. But now agent members are distinct identities, so this Set correctly identifies **each agent individually**. |
| **Message display** (line 114–141) | Line 116, 130–132: uses sender identity + hex to look up name. Works for N agents. | M2: unchanged. But now we need per-agent presence/typing indicator (section E below). |
| **Compose** (line 89–93) | Sends as sender (the human). No agent logic. | M2: unchanged. Humans can't compose as agents. |

#### ThreadMembers.tsx (line 10–131)

| Component Logic | Single-Agent Assumption | M2 Change Needed |
|-----------------|----------------------|------------------|
| **isGroup check** (line 31) | `thread?.kind === 'group' && thread.agentId === 0n` — assumes groups have no agent bound to the thread-level agentId field. | M2: this check becomes **group and not already an agent DM**. M2 groups CAN have agent members (via thread_member roles). Logic OK, just semantics. |
| **Add member UI** (line 76–79) | Shows "+ Add member" only for groups. Calls `add_member` reducer with `role: 'human'`. Assumes only humans can be added. | M2: need **separate "+ Add agent" flow** (or extend add_member to support role selection). Opens agent picker instead of user picker. |
| **Members list** (line 83–119) | Line 89, 95: `role === 'agent'` check + emoji. Renders all members (human + agent). | M2: unchanged! But now agent members are distinct identities with presence. Should show: agent name, agent status (online/typing), option to remove (if creator). |
| **Remove member** (line 106–115) | Creator-only, calls `removeMember`. Works for any member. | M2: unchanged, but also works for removing agent members now. |

#### ThreadList.tsx (line 10–80)

| Component Logic | Single-Agent Assumption | M2 Change Needed |
|-----------------|----------------------|------------------|
| **Thread avatar** (line 54–71) | Line 55–58: if `t.agentId !== 0n`, use agent emoji. Lines 59–71: else if DM or group. Assumes **one agent per thread**. | M2: for agent DMs, unchanged. For groups with agents, show group emoji or multi-agent badge. |
| **Subtitle (last message)** (line 74–76) | Shows last message text (no agent distinction). | M2: unchanged. But could show "Bob (agent): …" or icon prefix. |

#### UserPicker.tsx (line 14–87)

| Component Logic | Single-Agent Assumption | M2 Change Needed |
|-----------------|----------------------|------------------|
| **User selection** | Picks from `user` table (public, all users). No agent-specific logic. | M2: add parallel **AgentPicker** to pick from available agents (my_agents). Or merge both into "MemberPicker" with tabs. |

#### AgentList.tsx (line 8–86)

| Component Logic | Single-Agent Assumption | M2 Change Needed |
|-----------------|----------------------|------------------|
| **onChat** (line 34–42) | Creates or opens **an agent DM** with the persona. `createAgentDm` reducer. | M2: unchanged for 1:1 DMs. For groups, need **addAgentToGroup** flow instead. |

#### AgentEditor.tsx (line 16–201)

| Component Logic | Single-Agent Assumption | M2 Change Needed |
|-----------------|----------------------|------------------|
| **Agent config UI** | Edits name, system prompt, provider, model, baseUrl. No group/thread-specific logic. | M2: unchanged. Personas remain immutable configs. |

#### App.tsx (line 46–105)

| Function | Single-Agent Assumption | M2 Change Needed |
|----------|----------------------|------------------|
| **findDm** (line 58–66) | Searches for human-only DM: `t.kind === 'dm' && t.agentId === 0n`. Excludes agent DMs. | M2: unchanged; logic correctly identifies human DMs. |
| **startDm / startGroup** (line 78–95) | Creates DM between two humans, or creates a human-only group (no agents). | M2: unchanged. Agents join groups via **addAgentToGroup** separate flow. |

---

### PART D: Design Space Tensions (Unresolved for M2)

#### 1. **IDENTITY / PARTICIPATION**

**Current Model (M1.9):**
- One `service` identity = the orchestrator as an entity.
- All agents post messages as `service.identity`.
- Humans have distinct identities.
- **Result:** Presence/avatar/typing is identity-based. Service identity has "one presence" shared by all agents.

**M2 Options:**
- **(A) Per-Agent SpacetimeDB Identities:** Each agent persona gets a distinct identity (like humans). Orchestrator manages N identities. Requires OT-007 service-account auth (currently punted).
- **(B) Service Singleton + Message Tagging:** Keep one service identity, add `message.agentId: u64` field to tag which persona sent it. Presence still shared (all agents show as "service"). Simpler, but less "agent-as-contact" realism.
- **(C) Hybrid:** Different agents (from different owners) get different identities; same-owner agents share an identity. Splits the difference.

**M2 Decision Placeholder:** DEC-022 explicitly defers per-agent identities to M2. This map assumes path will be chosen in M2.1 design.

#### 2. **TURN ARBITRATION** (Existential Risk)

**Current Model:**
- One agent per thread. When a human sends a message in a thread with an agent, the agent replies.

**M2 Problem:**
- 2+ agents in a thread, 2+ humans. **Who replies?**
  - **All agents reply?** → Separate reply loops per agent. But then: each agent sees others' replies as new messages → agents reply to agents → **infinite loop** unless filtered. And unbounded token cost (cost guard DEC-026).
  - **One agent replies (pick HOW)?** → Need election/assignment. But which logic? Random? Turn-based? Selective via addressing?
  - **Agent addresses each other?** → Prevents loop. But requires addressing grammar (M2.1).

**Current Guard:**
- `inFlight = Map<threadId, InFlight>` (one reply per thread). Replyloop waits for finish before accepting next message. Prevents concurrent replies.
- Idle timeout (IDLE_TIMEOUT_MS = 60s) + watchdog aborts stalled runs.

**M2 Changes Required:**
- Arbitration policy: which agent(s) reply to a message?
- Cost guard: token meter per agent per day? Reject reply if over budget?
- Loop breaker: exclude agent-to-agent messages from reply trigger? Or require addressing?
- **(DEC-026 / BL-014):** Explicitly scoped out of M2.1/M2.2, but M2.3 must land it.

#### 3. **ADDRESSING GRAMMAR** (M2.1 Scope)

**Current Model:**
- No addressing. Human message → agent replies.

**M2.1 Requirement:**
- @mention / direct address parsing: "Bob, help me" vs "everyone check this".
- Resolver: one agent, several agents, "all agents", agent→agent, human→agent.
- Grammar integration with arbitration: addressing **determines who replies**.

**Implementation Targets:**
- Add message.mentions: `Vec<Identity>` or `Vec<u64>` (agent IDs)? To be designed.
- Orchestrator parses message text for @mention syntax (regex / grammar TBD).
- replyLoop filters: only reply if mentioned or in a "reply-all" group.

#### 4. **MULTI-PARTY PROMPTING** (M2.3 / Post-M2?)

**Current Model:**
- message.isAgent boolean (agent reply = 'assistant', human = 'user').
- buildPrompt maps to 2-role LLM format.
- System prompt is the persona's.

**M2 Problem:**
- N agents + M humans. LLM only has user/assistant/system.
- Option A: Name-tag in message text: `"Bob (agent): …"` vs `"Alice (human): …"`. Parseable but verbose, might confuse some models.
- Option B: Per-agent conversation views. Agent A sees only messages it was mentioned in + context. Breaks group coherence.
- Option C: System prompt modulation. "You are Bob, a helpful engineer. You are in a group chat with Alice (human), Charlie (agent), David (human). …" Requires dynamic system prompt per agent + thread state.
- Option D: Multi-persona prompt (advanced). Separate blocks per agent in the system prompt, each with constraints. Complex, model-dependent.

**SPEC §5 Placeholder:** This is explicitly unresolved; M2.3 research task.

---

### PART E: Per-Agent Presence & Typing (M2.2 Scope)

**Current Model:**
- `user.online` boolean (human presence).
- No typing indicator for agents or humans.

**M2.2 Requirement:**
- Agent presence: "Bob (agent) is typing…" or "thinking…".
- Typing indicator: `typing` table or message.streamState enough?
- If per-agent identities (path A), agent presence = agent identity's online status. Table `user` already has online. Just add agent identities to it.
- If per-service tagging (path B), need a separate `agent_presence` table (agentId, active, streamState, etc.) in each thread context.

**Implementation:**
- Add `agent_presence` table or extend `user`?
- Orchestrator: when reply_begin, set agent presence (typing). When reply_finish/cancel, clear.
- Mobile: subscribe to agent_presence. Show "🤖 Bob is thinking…" with cursor during streaming.

---

### PART F: Per-Agent Context Isolation (M2.3 Scope)

**Current Model:**
- All agents see all messages in a thread (via my_thread_messages view).
- buildPrompt ingests all completed messages for context.

**M2.3 Requirement:**
- Selective visibility: Agent A only sees messages it was mentioned in (or a specific thread subset)?
- Or: All agents see all messages but each is prompted separately with role-specific instructions?
- Cost/privacy concern: avoid leaking Agent-A's system prompt / training to Agent-B?

**Implementation:**
- New View: `my_context_messages(agentId)` — filters to agent-specific visibility.
- Or: orchestrator builds prompt per agent with different context windows.
- Requires arbitration + addressing to work first (know who is being asked).

---

### PART G: Run / Cancellation / Cost Metering (M1.9 inheritance)

**Current Model (M1.9):**
- `run` table: {id, runId, threadId, agent (identity), model, status, inputTokens, outputTokens, startedAt, updatedAt}.
- `message.runId` correlates to run.
- Cancellation-on-supersede: if human sends again mid-stream, abort the previous run (replyLoop line 67–68).
- Idle timeout + watchdog (60s, rearmable on every token).
- Delta-streaming (append-only) instead of cumulative updates (OT-004 fix).

**M2 Changes:**
- `run.agent` now identifies which of N agents owns the run (stays as identity, but no longer always == service).
- Multiple concurrent runs per thread: inFlight becomes `Map<(threadId, agentId), InFlight>`.
- Cancellation logic: "if another message arrives, cancel all in-flight replies in that thread" OR "cancel only the addressed agent's reply"? TBD by addressing grammar.
- Cost metering (DEC-026): token budget per agent per day. Reject reply_begin if over budget. Requires new table `agent_cost_meter` and checks in reply loop.

---

## SUMMARY TABLE: File Impact for M2

| File Path | Key Single-Agent Points | M2 M ajor Changes |
|-----------|------------------------|--------------------|
| **modules/spacetime/src/index.ts** | thread.agentId (singular), message.sender (1 agent identity), inFlight per threadId, my_persona_keys (1 owner), selectPersona (1 persona per thread) | 1. Extend my_persona_keys view to include all agent-owner keys in a thread. 2. Add new reducers: add_agent, remove_agent_from_thread. 3. New table or extend: agent_presence / typing (M2.2). 4. Option: add message.agentId or rely on distinct sender identities. 5. New view: my_group_agents (all agents in threads I'm in). |
| **services/orchestrator/src/replyLoop.ts** | inFlight = Map<threadId, ...>, one reply per thread, isAgentMemberOf filter assumes one agent | 1. Expand inFlight to track (threadId, agentId). 2. Arbitration policy: which agent(s) trigger a reply? Gate on cost + addressing. 3. Loop per agent or parallel loops (depends on identity choice A vs B). 4. Wrap in try-catch for cost limit exceeded. |
| **services/orchestrator/src/prompt.ts** | selectPersona logic (already per-ID, but assumes one per thread) | 1. Caller (replyLoop) now calls per agent, not once. 2. buildPrompt: handle N agents + M humans → implement naming/role strategy (M2.3 open). |
| **services/orchestrator/src/index.ts** | One service identity, one BYOK resolver | 1. If per-agent identities (path A): register N identities, each with own token. 2. If service-singleton (path B): unchanged, resolver already handles multi-owner keys. |
| **services/orchestrator/src/spacetime.ts** | Persists one orchestrator identity | 1. If path A (per-agent): persist N identities, or one per agent process. 2. If path B: unchanged. |
| **services/orchestrator/src/byok.ts** | No single-agent assumption | No changes needed (expansion of my_persona_keys view supplies all needed keys). |
| **apps/mobile/src/screens/Thread.tsx** | thread.agentId in header (one agent), agentMemberHexes set (distinct agent identities OK) | 1. Header: for groups with agents, show multi-agent badge or list. 2. Agent presence/typing indicator (M2.2): show "🤖 Bob is thinking…" during streaming. 3. Addressing UI: @mention picker in composer (M2.1). |
| **apps/mobile/src/screens/ThreadMembers.tsx** | isGroup check (agentId === 0n), add member flow (humans only) | 1. Add button + flow: "+ Add agent" (distinct from "+ Add member"). 2. Opens agent picker (available agents from my_agents that aren't already in the thread). 3. Agent presence indicator (online, typing) in member list. 4. Remove agent: creator can remove. |
| **apps/mobile/src/screens/ThreadList.tsx** | thread.agentId in avatar logic | 1. For agent DMs: unchanged (still show 🤖). 2. For groups with agents: show group badge + agent count, or multi-agent emoji. 3. Last message subtitle: could show agent sender prefix (M2.1). |
| **apps/mobile/src/screens/UserPicker.tsx** | Picks humans from user table | No direct change. Used in "Add member" flow (humans). Create separate **AgentPicker** component for "Add agent" flow. |
| **apps/mobile/src/screens/AgentList.tsx** | onChat creates agent DM | Unchanged for 1:1. For groups: new flow to add agent to existing group thread (separate from launch). |
| **apps/mobile/src/screens/AgentEditor.tsx** | Agent config (immutable persona) | Unchanged. Personas remain global configs owned by user. |
| **apps/mobile/App.tsx** | findDm, startDm, startGroup (human-only) | 1. Add startAddAgentToThread flow. 2. AgentPicker screen. 3. Integrate addressing UI (composer mention parsing) in Thread component. |

---

## Key Design Decisions Still Open (for M2 kickoff)

1. **Per-Agent Identity Path:** OT-007 service-account auth + N identities (path A) vs service-singleton + message tagging (path B)?
2. **Turn Arbitration + Cost Guard:** How do we prevent loops + unbounded token cost? (DEC-026 placeholder)
3. **Addressing Grammar:** @mention syntax, resolver, and integration with turn arbitration. (M2.1 design doc)
4. **Multi-Party Prompting:** Name-tagging vs context isolation vs system prompt modulation? (M2.3 research)
5. **Agent Presence / Typing:** New table or extend user? Separate views or flattened?

---

This map provides the complete topology of what the single-agent model bakes in and where M2 must extend or replace it. Use it as the authoritative reference for M2 design + implementation scope.
