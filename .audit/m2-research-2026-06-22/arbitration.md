# M2 research — Research — turn arbitration & loop prevention

> Generated 2026-06-22 by the m2-multiagent-plan-research workflow (8 agents). See DEC-031.

I have everything I need across all named systems plus the loop/cost guard literature, with verified specifics. The AutoGen FSM `allowed_speaker_transitions_dict` finding is the strongest direct analog to AgentSpace's "agent-cannot-trigger-agent-unless-addressed" requirement. Synthesizing now.

---

# M2 Turn Arbitration & Loop Prevention — Research Findings

Research into how production multi-agent systems decide **who speaks when** in shared chats, and how they bound agent↔agent loops and cost. Opinionated recommendation for AgentSpace's reactive SpacetimeDB model at the end.

## 1. Per-system survey (speaker-selection · termination · loop bound)

### Microsoft AutoGen (`GroupChat` / `GroupChatManager`)
The canonical "shared room" design and the closest structural match to AgentSpace. A `GroupChatManager` runs the loop: select a speaker → that agent speaks → manager **broadcasts** the message to all agents → repeat.

- **Selection policy (`speaker_selection_method`):** `auto` (default — the manager's *own LLM* picks the next speaker from the roster), `round_robin`, `random`, `manual` (asks a human), or a **custom function** `f(last_speaker, groupchat) -> Agent | mode_string | None`. Returning `None` **terminates** the chat — i.e., selection and termination are the same decision point.
- **Termination:** `max_round` (a hard cap on select→speak→broadcast cycles; the tutorials default it to 6) **or** an agent emitting a defined termination phrase **or** the custom selector returning `None`.
- **Loop bound / agent→agent containment — the key mechanism:** the **FSM / constrained-transition** feature. You pass `allowed_or_disallowed_speaker_transitions` (a dict, with `speaker_transitions_type ∈ {"allowed","disallowed"}`) — a **directed graph** where nodes are agents and edges are permitted "who may follow whom" transitions. AutoGen's own docs justify this explicitly: as agents grow, the N-choose-2 transition pairs explode, "increasing the risk of sub-optimal transitions, which leads to **wastage of tokens** and/or poor outcomes." This is the literal production implementation of *"an agent cannot trigger an agent unless the graph allows it."*
- Sources: [Customize Speaker Selection](https://microsoft.github.io/autogen/0.2/docs/topics/groupchat/customized_speaker_selection/), [Conversation Patterns](https://microsoft.github.io/autogen/0.2/docs/tutorial/conversation-patterns/), [FSM GroupChat blog](https://microsoft.github.io/autogen/0.2/blog/2024/02/11/FSM-GroupChat/), [FSM transition-constraints notebook](https://microsoft.github.io/autogen/0.2/docs/notebooks/agentchat_groupchat_finite_state_machine/).

### Microsoft Semantic Kernel (`AgentGroupChat`)
Cleanest **separation of the two orthogonal decisions** — who speaks vs. when to stop — which AgentSpace should copy conceptually.

- **SelectionStrategy** (`.next(...)`): default is **sequential/round-robin**; `KernelFunctionSelectionStrategy` lets an **LLM prompt** choose the next agent from history (with `InitialAgent` fallback, `ResultParser` to extract the name, and `EvaluateNameOnly`/`HistoryReducer` to cut context cost).
- **TerminationStrategy** (`.should_terminate(...)`): evaluated *after each agent response*. `KernelFunctionTerminationStrategy` runs a binary prompt over history (e.g., watch for `"APPROVED"`). The crucial detail: **`DefaultTerminationStrategy` never terminates on its own** — it relies purely on the iteration cap.
- **Loop bound:** **`MaximumIterations`** is a hard cap "after which the chat ends **regardless of function output**." The recommended pattern combines both: content-based termination for the *happy path*, iteration cap as the **safety net that prevents runaway cost**.
- Sources: [Selection & Termination strategies (Systenics)](https://systenics.ai/blog/2025-04-22-understanding-selection-and-termination-strategy-functions-in-dotnet-semantic-kernel-agent-framework/), [MS Learn AgentChat archive](https://learn.microsoft.com/en-us/semantic-kernel/support/archive/agent-chat), [DevLeader walkthrough](https://www.devleader.ca/2026/03/10/multiagent-orchestration-with-semantic-kernel-in-c-agentgroupchat-and-selection-strategies).

### LangGraph (supervisor / swarm)
Two patterns, two loop-bound stories.

- **Supervisor:** a central LLM receives every message, classifies intent, routes to one specialist; **control always returns to the supervisor**, which decides "route again or end." Routing is one focused LLM call. *Documented failure mode:* the supervisor re-routes to the same specialist forever ("billing → billing → billing"); fix is to **feed resolution notes back into supervisor context** so it sees what's already handled.
- **Swarm:** agents hand off **peer-to-peer** via `Command`, bypassing a coordinator — lower latency (~half the LLM calls per the cited benchmark) but the loop bound is now your job: **"track handoff count in state and set a hard limit"** to stop ping-pong.
- **Global safety net:** `recursion_limit` (default **25**) caps graph supersteps before forcing a stop. The guidance: hitting it should be *alarming* — ">1% of runs reaching it" means the router is looping on a prompt bug, not doing real work. A `remaining_steps` counter lets you end gracefully (e.g., at 2) before the hard limit throws.
- Sources: [Supervisor vs Swarm tradeoffs (DEV)](https://dev.to/focused_dot_io/multi-agent-orchestration-in-langgraph-supervisor-vs-swarm-tradeoffs-and-architecture-1b7e), [Supervisor pattern (CallSphere)](https://callsphere.ai/blog/langgraph-supervisor-multi-agent-orchestration-2026).

### OpenAI Swarm → Agents SDK (handoffs)
Routing-by-handoff rather than a shared room — **control transfers, it doesn't broadcast**.

- **Selection:** a tool/function **returns an `Agent` object** ⇒ the runner sets `current_agent = result` ("Transferred to X. Adopt persona immediately"). Only the current agent is "live"; there's no simultaneous multi-speaker.
- **Termination:** the loop exits when "the LLM produces text output … and there are **no tool calls**" (no handoff, no tool ⇒ done). The original Swarm/cookbook `while True` loop was **unbounded** by visible code.
- **Loop bound:** the production Agents SDK adds **`max_turns`**; exceeding it raises **`MaxTurnsExceeded`** (each LLM call for the current agent = one turn). `error_handlers` can convert that into a controlled final output instead of an exception; `max_turns=None` disables it. This is the "a turn budget per request" primitive.
- Sources: [Orchestrating Agents cookbook](https://developers.openai.com/cookbook/examples/orchestrating_agents), [Agents SDK — running agents](https://openai.github.io/openai-agents-python/running_agents/), [openai/swarm](https://github.com/openai/swarm).

### CrewAI (hierarchical process)
- **Selection:** `Process.hierarchical` + a `manager_llm` (or custom `manager_agent`) that delegates to workers, simulating an org chart.
- **Loop bound:** `max_iter` per agent (cap on reasoning iterations to a final answer) + `max_rpm`. The community's hard-won rule for containment: set **`allow_delegation=False` on every worker** so only the manager can delegate — *"a weak manager produces circular or incomplete delegation."* This is "only a coordinator may route" expressed as config.
- *Caveat for us:* multiple write-ups report the hierarchical manager underperforms in practice (sequential execution, high latency, mis-delegation) — evidence that **handing turn-arbitration to an LLM manager is fragile and expensive**; deterministic rules are more reliable.
- Sources: [Hierarchical Process docs](https://docs.crewai.com/en/learn/hierarchical-process), [Why CrewAI's Manager-Worker fails (TDS)](https://towardsdatascience.com/why-crewais-manager-worker-architecture-fails-and-how-to-fix-it/), [discussion #1220](https://github.com/crewAIInc/crewAI/discussions/1220).

### Consumer multi-bot products (the human-in-the-loop reference class — most relevant to AgentSpace)
- **Poe multi-bot chat:** the **user @-mentions** which bot to summon ("similar to Slack"); bots **do not autonomously decide to speak or chain off each other** — the human drives every turn. Side-by-side compare is one human message → multiple bot replies. Addressing *is* the arbitration. ([Poe blog](https://poe.com/blog/multi-bot-chat-on-poe), [VentureBeat](https://venturebeat.com/ai/poe-introduces-multi-bot-chat-and-plans-enterprise-tier-to-dominate-ai-chatbot-market))
- **Character.AI group chats:** the **user is the moderator** — tap a character's avatar to make it the recipient of the next message; up to ~10 characters. A dedicated lightweight model (**PipSqueak**) handles turn-taking/coherence so characters don't interrupt or reply out of context. Best practice: **distinct roles** (devil's advocate / fact-checker / motivator) beat a room of identical assistants — directly relevant to multi-party prompting. ([C.AI group-chat announcement](https://blog.character.ai/new-feature-announcement-character-group-chat/), [TechCrunch](https://techcrunch.com/2023/10/11/character-ai-introduces-group-chats-where-people-and-multiple-ais-can-talk-to-each-other/), [Group Chat FAQ](https://support.character.ai/hc/en-us/articles/23957256282523-Group-Chat-FAQ))
- **Discord/Slack multi-bot etiquette (the loop-prevention folk wisdom):** the universal first line of every handler is **`if message.author.bot: return`** — bots ignore bot-authored messages by default. In shared channels, **require an explicit @mention** to respond; free-response only in a bot's "home" channel. And **never let a bot's output @mention another bot** (or ignore bot-origin mentions), or you get a cascade. ([Discord infinite-loop thread](https://community.latenode.com/t/discord-bot-creates-infinite-loop-when-responding-to-messages-discord-bot/24954), [Hermes multi-agent cascade-prevention issue](https://github.com/NousResearch/hermes-agent/issues/14853))

### The cost-of-getting-it-wrong anchor (the $47K loop)
A Nov-2025 pipeline: an **Analyzer and a Verifier agent ping-ponged** — Analyzer generates, Verifier requests more analysis, Analyzer obliges — for **264 hours / 11 days → $47,000**. Post-mortem root causes: **no per-agent budget ceiling** and **no pre-execution enforcement** ("they had observability; they did not have enforcement"). Load-bearing lessons:
- **Alerts ≠ enforcement.** Alerts are async; the damage compounds in the gap between "alert fired" and "session stopped."
- **Enforcement must live outside agent code / in the infrastructure path** — "an agent told 'stop after $X' in its prompt will honor it right up until it's task-motivated not to." The session must terminate **synchronously, before the next API call**, regardless of where the agent is in its reasoning.
- Layered guards: **step counts** (cap turns) + **elapsed-time ceilings** + **idle-time guards**.
- Sources: [The $47,000 Agent Loop (DEV)](https://dev.to/waxell/the-47000-agent-loop-why-token-budget-alerts-arent-budget-enforcement-389i), [Stop the Loop (DEV)](https://dev.to/alessandro_pignati/stop-the-loop-how-to-prevent-infinite-conversations-in-your-ai-agents-ekj), [Galileo coordination strategies](https://galileo.ai/blog/multi-agent-coordination-strategies).

## 2. The arbitration-policy menu (for a real-time, human-in-the-loop chat)

| Policy | How "who speaks next" is decided | Pros | Cons | Cost profile |
|---|---|---|---|---|
| **Addressed-only (reactive)** | Only agents @mentioned / directly addressed reply; nothing else fires | Zero arbitration cost; intuitive; naturally loop-safe (Poe/Discord model) | No emergent multi-agent banter; user must drive | Lowest — 0 extra LLM calls |
| **Round-robin** | Fixed rotation among thread's agents | Deterministic, trivially bounded, no router cost | Ignores relevance; agents speak when they have nothing to add | Bounded by rotation length |
| **Coordinator/router LLM** | A cheap LLM picks 0..N next speakers (AutoGen `auto`, SK selection, LangGraph supervisor) | Relevance-aware; "everyone"/multi-select natural | +1 LLM call **per turn**; router can loop (CrewAI/LangGraph failure mode); a point of latency | Highest & least predictable |
| **Reactive / interest-bid** | Each agent cheaply self-scores "should I reply?"; top-K fire | Emergent, parallel, no central bottleneck | K cheap calls/message; needs dedup so all don't say the same thing | Medium (K small classifier calls) |
| **Constrained-transition FSM** | A graph gates who may follow whom (AutoGen FSM, CrewAI `allow_delegation=False`) | **Structurally forbids storms/loops**; pairs with any policy above | Author/derive the graph; less spontaneous | Whatever the inner policy costs |

## 3. Recommendation for AgentSpace (opinionated)

AgentSpace is **reactive, real-time, human-in-the-loop chat — not an autonomous crew.** The crew frameworks optimize for a goal-driven task converging to "done"; you optimize for an **open-ended conversation that must never converge to a bill.** That inverts the priorities: the iteration cap is not a safety net here, it's the **primary control surface.** Concretely:

**Primary policy: Addressed-only + bounded reactive fallback (hybrid of Poe/Discord + a thin AutoGen-FSM).** This fits the SpacetimeDB model perfectly because arbitration is **deterministic and lives in the reducer**, not an LLM:

1. **Addressing drives arbitration (M2.1).** Parse @mentions / direct address in the *human* message → resolve to a set of agents (one / several / "everyone" / agent-by-name). The resolved set is exactly the set that's allowed to reply. This is the Poe model and needs **zero router LLM call**. Unaddressed agents stay silent. (If you later want ambient liveliness, add an optional cheap per-agent "interest" classifier as the *fallback* when nobody is addressed — top-K, never all.)

2. **Reducers are the enforcement layer the $47K post-mortem demands.** The decisive lesson is "enforcement must be outside agent code, synchronous, before the next call." In AgentSpace the **reducer is that infrastructure boundary**: it gates every write by `ctx.sender` and is deterministic. Put the arbitration counters in STDB state and have the reducer *refuse to admit* a run that violates them — the orchestrator (agent code) literally cannot start a reply the reducer won't allow. This is architecturally stronger than every framework surveyed, all of which enforce in app code.

**The hard guards (encode in the module, not the orchestrator prompt):**

- **Turn budget per human message.** Each human `complete` message opens a **"conversation episode"** with a hard cap on total agent turns it may cause (start at **~4–6**, mirroring AutoGen's default `max_round=6`). Track `episode.agentTurnsRemaining` in STDB; the reducer rejects `agent_reply_begin` when it hits 0. This is your `MaximumIterations` / `recursion_limit` / `max_turns`, and it's the **single most important guard.**
- **Agent-cannot-trigger-agent-unless-addressed (the anti-cascade rule).** An agent's `complete` message must **not** by itself wake any agent. An agent only replies when (a) a *human* addressed it, or (b) **another agent explicitly @mentioned it AND the episode budget is >0 AND that agent hasn't already spoken this episode.** This is Discord's `if message.author.bot: return` plus AutoGen's FSM `allowed_speaker_transitions` plus CrewAI's `allow_delegation=False` — three independent production systems converging on the same rule. Default agent→agent addressing **off** per persona; make it opt-in.
- **Per-agent once-per-episode (de-dup / no self-reply).** An agent replies **at most once** per human episode (prevents A→B→A oscillation even if addressing would otherwise allow it). Never let an agent be woken by its own message.
- **Cooldown.** Per-(agent, thread) minimum interval between replies — cheap rate-limit that also smooths the real-time UX.
- **Max concurrent agent replies.** Cap simultaneous in-flight runs per thread (extend the existing `Map<threadId, InFlight>` to allow ≤ N, e.g., 2–3). Bounds burst token spend and keeps the stream readable; ties into M1.9's run lifecycle (idle timeout + cancel-on-supersede already give you the elapsed-time and idle guards the post-mortem recommends).
- **Hard cost ceiling per episode (and per thread/day).** Sum token usage across the episode's runs (M1.9 already reports usage at `agent_reply_finish`); reducer refuses new runs past the ceiling. This is the per-session/per-fleet budget that was *the* missing control in the $47K loop. Budget-aware multi-agent work ([BAMAS](https://arxiv.org/pdf/2511.21572)) corroborates that the budget must be a first-class scheduling input, not an afterthought.

**Explicitly reject for v1: the coordinator/router LLM** (AutoGen `auto`, SK `KernelFunctionSelectionStrategy`, LangGraph supervisor, CrewAI `manager_llm`). It adds a per-turn LLM call (latency + cost on the critical path), it's the documented loop source in both LangGraph and CrewAI, and deterministic @mention resolution gives you 90% of the value at zero marginal cost and zero loop risk. Keep it on the roadmap as an *optional* arbitration mode for a "let the agents figure it out" thread setting once the deterministic core is proven — gated behind the same episode budget so even a looping router is financially harmless.

**Multi-party prompting note (feeds M2.3):** Character.AI's lesson — **distinct roles beat overlapping ones**, and a per-agent "you are X; the others are Y, Z" framing keeps each in character while it sees others' turns. Map the multi-human/multi-AI transcript to user/assistant by **name-tagging every line** (`[Alice]:`, `[PiratePete]:`) so a single LLM can disambiguate speakers; the agent being prompted sees its own prior turns as `assistant` and everyone else (humans and other agents) as name-tagged `user`.

**One-line summary:** Copy Poe/Discord's *addressing-as-arbitration* and AutoGen/SK's *iteration-cap-as-safety-net*, but move both into the **SpacetimeDB reducer** so enforcement is deterministic and pre-execution — the exact property whose absence cost the $47K-loop team eleven days and a five-figure bill.

### Key sources
- AutoGen speaker selection + FSM: [customized speaker selection](https://microsoft.github.io/autogen/0.2/docs/topics/groupchat/customized_speaker_selection/) · [FSM GroupChat](https://microsoft.github.io/autogen/0.2/blog/2024/02/11/FSM-GroupChat/) · [FSM notebook](https://microsoft.github.io/autogen/0.2/docs/notebooks/agentchat_groupchat_finite_state_machine/)
- Semantic Kernel selection/termination/MaximumIterations: [Systenics](https://systenics.ai/blog/2025-04-22-understanding-selection-and-termination-strategy-functions-in-dotnet-semantic-kernel-agent-framework/) · [MS Learn](https://learn.microsoft.com/en-us/semantic-kernel/support/archive/agent-chat)
- LangGraph supervisor/swarm + recursion_limit: [tradeoffs](https://dev.to/focused_dot_io/multi-agent-orchestration-in-langgraph-supervisor-vs-swarm-tradeoffs-and-architecture-1b7e)
- OpenAI handoffs + max_turns: [cookbook](https://developers.openai.com/cookbook/examples/orchestrating_agents) · [Agents SDK running](https://openai.github.io/openai-agents-python/running_agents/)
- CrewAI hierarchical + allow_delegation: [docs](https://docs.crewai.com/en/learn/hierarchical-process) · [why it fails](https://towardsdatascience.com/why-crewais-manager-worker-architecture-fails-and-how-to-fix-it/)
- Consumer products: [Poe multi-bot](https://poe.com/blog/multi-bot-chat-on-poe) · [Character.AI group chat](https://blog.character.ai/new-feature-announcement-character-group-chat/)
- Discord/Slack etiquette: [infinite-loop thread](https://community.latenode.com/t/discord-bot-creates-infinite-loop-when-responding-to-messages-discord-bot/24954) · [cascade-prevention issue](https://github.com/NousResearch/hermes-agent/issues/14853)
- Loop/cost guards: [$47K loop](https://dev.to/waxell/the-47000-agent-loop-why-token-budget-alerts-arent-budget-enforcement-389i) · [Stop the Loop](https://dev.to/alessandro_pignati/stop-the-loop-how-to-prevent-infinite-conversations-in-your-ai-agents-ekj) · [Galileo](https://galileo.ai/blog/multi-agent-coordination-strategies) · [BAMAS](https://arxiv.org/pdf/2511.21572)
