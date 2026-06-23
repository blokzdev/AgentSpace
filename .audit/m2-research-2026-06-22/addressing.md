# M2 research — Research — addressing grammar

> Generated 2026-06-22 by the m2-multiagent-plan-research workflow (8 agents). See DEC-031.

I now have authoritative primary sources for the encoding conventions (Slack, Discord), the resolution/security model (`allowed_mentions`), the AI-routing pattern (AgentScope `@agent_name`, n8n, AutoGen speaker selection), and composer UX. I have enough to synthesize a concrete, implementable recommendation grounded in the actual AgentSpace code I read. Writing the final report.

---

# M2.1 Addressing Grammar — Research + Recommendation

## 1. How production chat systems encode mentions (the wire format question)

The single most important finding: **every mature system stores mentions as structured tokens that reference a stable participant ID, not as raw display-name text.** The display name is purely a render-time projection. This is the decisive design choice for AgentSpace.

**Slack** ([docs.slack.dev](https://docs.slack.dev/messaging/formatting-message-text), [api.slack.com/reference/surfaces/formatting](https://api.slack.com/reference/surfaces/formatting)):
- User mention = `<@U012AB3CD>` — angle brackets, `@`, then the **immutable user ID**. The client converts the ID to the current display name at render time, so renaming a user never breaks old messages.
- Special mentions are bang-commands, not IDs: `<!here>`, `<!channel>`, `<!everyone>`.
- User groups: `<!subteam^SAZ94GDB8>`.
- An optional pipe fallback label (`<@U…|bob>`) exists, but per Slack's own docs the pipe-label is really for *links*; for mentions the server does ID→name mapping. Only three chars are ever escaped: `&`, `<`, `>`.

**Discord** ([discordjs.guide](https://v13.discordjs.guide/miscellaneous/parsing-mention-arguments), [discord.com/developers](https://docs.discord.com/developers/resources/message)):
- User: `<@86890631690977280>` (or `<@!id>` historically for nicknames). Roles: `<@&id>`. Channels: `<#id>`. `@everyone`/`@here` are literal text but only *ping* when the bot has permission and the parse field allows them.
- Canonical parse regex: `/^<@!?(\d+)>$/`.

**The security layer — `allowed_mentions`** ([tutorial.vco.sh/tips/mentions](https://tutorial.vco.sh/tips/mentions/), [discord-api-docs#4270](https://github.com/discord/discord-api-docs/issues/4270)): a mention appearing in text does **not** automatically notify/trigger. The sender declares which mention classes are "live" (`users`/`roles`/`everyone`). This separates *the text contains a mention* from *the mention is allowed to act* — directly relevant to AgentSpace's cost-safety problem (a mention is a render artifact; whether it *triggers an agent* is a separate, gated decision).

**Takeaway for the wire format:** store mentions as **structured data keyed by a stable participant ID**, render the name from the live roster. Do *not* re-parse display-name strings on read. This survives persona renames (AgentSpace personas are user-editable and have a `version` counter), avoids display-name-collision ambiguity at read time, and lets the orchestrator's arbitration read mentions as data rather than re-parsing free text.

## 2. How AI group chats decide which bot answers (addressing → arbitration)

The pattern that recurs across frameworks is **explicit @-name routing with a deterministic fallback policy**, with the orchestrator/manager as the arbiter:

- **AgentScope** ([arxiv 2402.14034](https://arxiv.org/pdf/2402.14034)): a `@agent_name` "mentions" feature; a `filter_agents()` function screens message content and identifies mentioned agents; an agent responds "only when directly addressed or when their expertise is relevant." This is the closest published analog to AgentSpace's model.
- **n8n scalable multi-agent chat** ([n8n.io/workflows/3473](https://n8n.io/workflows/3473-scalable-multi-agent-chat-using-mentions/)): an "Extract mentions" node parses `@AgentName` against the defined agent set. **Mentioned → ordered sequential execution in mention order** (`@Gemma @Claude` runs Gemma then Claude); **no mention → fallback to all agents** (they shuffle; AgentSpace should *not* fan out to all — see arbitration note below). This validates "mention drives an ordered turn list."
- **Microsoft Agent Framework / AutoGen GroupChat** ([learn.microsoft.com group-chat](https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/group-chat), [AutoGen 0.2 groupchat](https://microsoft.github.io/autogen/0.2/docs/reference/agentchat/groupchat/)): a star topology with a central manager that picks the next speaker via `round_robin` / `manual` / `auto` (LLM-picks-the-name). Critical detail: in `auto` mode agent **names are case-sensitive, must not be abbreviated, and only names in the agent list are accepted** — i.e., name resolution must be exact and closed-set. ([Microsoft ISE coordinator patterns](https://devblogs.microsoft.com/ise/coordinator-patterns-multi-agent-systems/) covers the star/orchestrator trade-offs.)

**Takeaway:** addressing is the *input* to arbitration, not the arbiter itself. The grammar resolves a message to a **set of addressed participant IDs**; a separate policy turns that set into an ordered reply schedule. Unaddressed agents stay silent by default — this is exactly the storm/loop guard M2.1's acceptance bar needs.

## 3. Resolution robustness (the hard part: user-built persona names)

AgentSpace personas have free-form, user-chosen names → collisions ("Pete" twice), spaces ("Captain Pete"), case variance, and partial typing. How systems handle it:

- **They sidestep collisions entirely by resolving at *selection time* in the composer**, not at parse time on the server. The typeahead ([CSS-Tricks @mention autocomplete](https://css-tricks.com/so-you-want-to-build-an-mention-autocomplete-feature/), [react-mentions-ts](https://github.com/hbmartin/react-mentions-ts)) shows the user a disambiguated list; picking an entry inserts a **token bound to the ID**. The user never types a name the system has to fuzzy-match — they pick a row, and the ambiguity is resolved by human choice. Twitter/Slack/Notion all do this: type `@`, filter the roster (case-insensitive, prefix/substring), select → insert ID-bound token + trailing space.
- AutoGen's `auto` mode shows the *opposite* approach (LLM emits a name, server string-matches against a closed set, case-sensitive) — workable for agent→agent but brittle for human free-typing. AgentSpace should use composer-time ID binding for humans and closed-set matching only for the agent→agent path.

**Takeaway:** resolve mentions to IDs **in the composer at selection time**; the reducer should mostly *validate* pre-resolved IDs, not fuzzy-parse names. Keep one server-side fuzzy resolver (case-insensitive, exact-then-prefix match against the thread's persona roster) only as a fallback for (a) agent→agent mentions emitted as text by the LLM and (b) natural-language direct address.

## 4. Direct address without `@` ("Hey Pete, …")

No production chat system reliably parses NL direct address — it's left to humans reading the text. But AgentSpace needs it for arbitration. The robust, cost-safe approach: a **cheap deterministic heuristic in the orchestrator** (not the reducer, which can't do fuzzy work and must stay deterministic/fast), scoped tightly to avoid false triggers:
- Match a persona name from the thread roster as a **leading vocative** only: `^\s*(hey|hi|ok|okay|yo|@)?\s*<Name>[,:]` (case-insensitive, word-boundary, roster names escaped). Restricting to the message *prefix* + trailing `,`/`:` kills most false positives ("I talked to Pete yesterday" won't trigger).
- Treat an NL match as **weaker** than an explicit `@`-token: it addresses exactly one agent and never `@everyone`. If ambiguous (two "Pete"s), do nothing (no token cost) rather than guess.

This belongs in the orchestrator's arbitration layer, behind the same loop/cost guards, because it's a soft signal.

## 5. Recommended grammar for AgentSpace

### 5a. Wire format — structured, not parsed-on-read (store both)

Add a **`mentions`** structured field to the `message` row, populated by the composer at send time, alongside the human-readable `text`. The reducer validates and persists it; readers (mobile render + orchestrator arbitration) consume the structured field, never re-parse `text` on the hot path.

```
message.mentions : Vec<Mention>   // additive column; [] for legacy/un-addressed msgs
Mention = { kind: "agent" | "human" | "all", ref: Identity | 0, start: u32, len: u32 }
```
- `kind:"agent"` / `"human"` → `ref` is the participant **Identity** (per-agent identity if M2 mints them; otherwise the persona's `agentId` encoded — but Identity is cleaner and aligns with tension #1).
- `kind:"all"` → the `@everyone`/`@here` analog (`ref` unused).
- `start`/`len` index into `text` so the client can render the token range as a chip without re-tokenizing (Slack/Discord store the marker inline; AgentSpace stores text + offset sidecar, which is simpler than an inline `<@id>` codec and avoids an escape/parse layer in the reducer).

In `text`, keep a plain readable form (`@Pete`) so a client without mention-awareness still shows something sensible — the structured `mentions` array is the source of truth for addressing.

**Why a sidecar array over Slack-style inline `<@id>` codec:** the reducer stays trivial (validate that each `mentions[i].ref` is an actual `agent`/`human` member of the thread — gated by `ctx.sender`, deterministic, no parsing), and you never need an HTML-escape/unescape codec inside a SpacetimeDB reducer. It is also fully additive (one new column), matching the "additive + reversible" constraint.

### 5b. Composer UX (RN/Expo, Android-first)

Standard typeahead, bound to the thread's member roster (you already subscribe to thread members + can resolve persona names):
1. User types `@` → open a suggestion list filtered against thread participants (humans + agents), **case-insensitive prefix-then-substring**, plus a synthetic `@everyone` / `@here` row.
2. Selecting a row inserts the display token (`@Captain Pete `) into the `TextInput` value **and** pushes a `{kind, ref, start, len}` entry into composer state. Names with spaces work because the token came from selection, not from whitespace tokenizing.
3. On send, recompute `start/len` against final text (names can shift as the user edits) and submit `text` + `mentions`. RN's `TextInput` can't render inline chips, so render the token as styled text via `selection`/highlighting or a lightweight overlay; the structured array is what matters. Libraries like [react-mentions-ts](https://github.com/hbmartin/react-mentions-ts) document the token-replace-and-add-space interaction to mirror.
4. Collision handling is free: two "Pete"s appear as two distinct rows (badge them with model or avatar); the user picks one → unambiguous ID.

### 5c. Addressing semantics

- **`@<agent>`** → addresses that one agent.
- **Multiple `@a @b`** → addresses both; feeds an **ordered** turn list in mention order (per n8n).
- **`@everyone` / `@here`** → addresses all agents in the thread. Gate this hard (it's the storm vector): cap fan-out, and the per-thread one-in-flight + loop guards still apply.
- **Agent→agent** (`@Pete` appears in an *agent's* reply): allowed, but this is the infinite-loop vector. The orchestrator resolves agent-emitted names via the closed-set, case-insensitive resolver, then subjects the resulting turn to the **arbitration loop/cost guards** (depth counter, per-thread/per-window reply budget, no self-address, ignore if the addressed agent already spoke in this "burst"). The grammar *enables* agent→agent; arbitration *bounds* it.
- **No mention / NL address** → arbitration policy decides (see §5d). Unlike n8n's "fan out to everyone," AgentSpace's default for an unaddressed message in a multi-agent thread should be **at most one agent replies** (or none), never all — fan-out-to-all is the cost-existential failure mode.

### 5d. How addressing feeds turn arbitration (M2.1's core contract)

Addressing produces an **ordered candidate set**; arbitration converts it to a schedule under guards:

1. **Resolve** the message → `addressed: Identity[]` (from `mentions`; agents in the thread for `@all`; NL-heuristic match as a single soft candidate).
2. **Default-silence:** an agent that is *not* in `addressed` does **not** reply — unless an explicit per-thread/per-agent policy opts it in (e.g. an "always-on" persona, or relevance-by-LLM-judge deferred to M2.x). This is the storm guard.
3. **Schedule:** addressed agents reply in mention order, one in-flight at a time (extends the existing `Map<threadId, InFlight>` to a per-thread queue).
4. **Loop/cost guards (independent of addressing, always on):** depth/turn counter per human-initiated "burst", a hard reply budget per thread per time window, suppress self-address, and (recommended) **drop agent→agent addressing of an agent that already replied in the current burst** unless a human re-addresses. An agent reply is a `complete` message, so without these an `@`-volley between two personas loops forever — addressing must hand arbitration enough structure (who, in what order, at what depth) to terminate.

This cleanly separates the three concerns the milestone conflates: **grammar** (parse/resolve to IDs) → **policy** (who's a candidate) → **guards** (cost/loop ceilings). Each is independently testable; only the grammar lives partly in the reducer (validation), keeping the deterministic boundary clean.

### 5e. Implementability check against the codebase

- **Reducer (`modules/spacetime`):** one additive `mentions` column on `message`; the send reducer validates each `ref` is a current thread member (membership data it already has) and that `ctx.sender` is the message author. No parsing, no network — deterministic. Fully reversible (drop column / ignore field).
- **Orchestrator (`services/orchestrator/src/replyLoop.ts` + `prompt.ts`):** `selectPersona` (prompt.ts:66) generalizes from "the one `thread.agentId`" to "for each addressed agent in the thread, its persona." Arbitration reads `message.mentions` (structured — no regex on the hot path) and applies the guards above before enqueuing a reply. The NL-vocative regex + agent→agent closed-set resolver are pure functions, unit-testable like the existing `buildPrompt`/`createBatcher`.
- **Mobile:** typeahead over the already-subscribed member roster; structured `mentions` built in composer state.

## Sources

- Slack mention encoding: [docs.slack.dev/messaging/formatting-message-text](https://docs.slack.dev/messaging/formatting-message-text), [api.slack.com/reference/surfaces/formatting](https://api.slack.com/reference/surfaces/formatting)
- Discord mention format + parse regex + allowed_mentions: [discord.js v13 guide — parsing mentions](https://v13.discordjs.guide/miscellaneous/parsing-mention-arguments), [Discord Message resource](https://docs.discord.com/developers/resources/message), [Allowed Mentions tutorial](https://tutorial.vco.sh/tips/mentions/), [discord-api-docs#4270](https://github.com/discord/discord-api-docs/issues/4270)
- AI group-chat routing / speaker selection: [AgentScope (arXiv 2402.14034)](https://arxiv.org/pdf/2402.14034), [n8n scalable multi-agent chat via @mentions](https://n8n.io/workflows/3473-scalable-multi-agent-chat-using-mentions/), [AutoGen 0.2 GroupChat](https://microsoft.github.io/autogen/0.2/docs/reference/agentchat/groupchat/), [Microsoft Agent Framework group chat](https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/group-chat), [Microsoft ISE coordinator patterns](https://devblogs.microsoft.com/ise/coordinator-patterns-multi-agent-systems/)
- Composer @mention UX: [CSS-Tricks @mention autocomplete](https://css-tricks.com/so-you-want-to-build-an-mention-autocomplete-feature/), [react-mentions-ts](https://github.com/hbmartin/react-mentions-ts)

## Key files referenced (absolute paths)
- `E:\Cloud\AgentSpace\services\orchestrator\src\prompt.ts` — `selectPersona` (line 66, single-persona resolution to generalize), `buildPrompt` (line 20, 2-role mapping that multi-party prompting must extend), `createBatcher`
- `E:\Cloud\AgentSpace\services\orchestrator\src\replyLoop.ts` — the `Map<threadId, InFlight>` one-in-flight model that arbitration extends to a per-thread ordered queue
- `E:\Cloud\AgentSpace\modules\spacetime\src\index.ts` — where the additive `message.mentions` column + send-reducer validation lands

**One-line recommendation:** store mentions as a structured `mentions: Mention[]` sidecar on the message (kind + participant Identity + text offset), resolved to IDs in the RN composer at selection time; the reducer only validates membership; the orchestrator turns the resolved address-set into an ordered, guard-bounded reply schedule where unaddressed agents stay silent by default.
