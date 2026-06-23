# M2 research — Research — multi-party prompt representation

> Generated 2026-06-22 by the m2-multiagent-plan-research workflow (8 agents). See DEC-031.

I now have all the load-bearing mechanisms confirmed from primary/secondary sources. I have enough to synthesize the recommendation. Here is the research deliverable.

---

# Research: Representing a multi-party conversation to a single LLM playing ONE agent

This is a research memo for AgentSpace M2. It answers the prompt-construction question and ends with a concrete recipe for rewriting `services/orchestrator/src/prompt.ts:buildPrompt` (currently at `E:\Cloud\AgentSpace\services\orchestrator\src\prompt.ts`, lines 20-34).

## TL;DR recommendation

Keep the chat-roles API (system/user/assistant) but change what maps to what, **per agent**:

1. **Role-flip per target agent** (the AutoGen / "RPUP" pattern): from the perspective of the agent that is about to speak, *its own* prior turns map to `assistant`; *every other participant's* turns (humans AND other agents) map to `user`.
2. **Name-tag every non-self turn inline** as a `Name: text` prefix inside the `user` content (do NOT rely on the API `name` field — support is inconsistent across your 16 providers). This is the single most important technique: it's what makes a transcript with N speakers legible to a model that only has 3 roles.
3. **Roster + identity in the system prompt**: append a generated block to the persona's own systemPrompt naming who's in the room and pinning the agent's own display name ("You are Pirate Pete. Others in this chat: Alice (human), Ada (AI), Bob (human). Only ever write Pirate Pete's next message; never write for anyone else.").
4. **Context isolation = each agent gets ONLY its own systemPrompt over the shared transcript.** Never concatenate other agents' system prompts into the context. The shared transcript is common; the system prompt and the role-flip are per-agent. This is what keeps personas separate and prevents instruction leakage.
5. **Stop-sequence / anti-impersonation guard**: instruct "write only your own message, no name prefix on your own line" and (optionally) add other participants' `Name:` labels as stop sequences so the model can't continue the transcript for others.

This is additive to your current `buildPrompt` signature — it takes more inputs (the speaker roster, each row's sender identity + display name, and which identity is "self") but still emits `GatewayMessage[]` of system/user/assistant.

---

## 1. Name-tagging vs role-mapping — you need BOTH, they solve different problems

These are not alternatives; they are orthogonal and both required.

- **Role-mapping** answers "is this turn mine or someone else's?" The model's instruction-following and persona behavior is anchored to the `assistant` channel — that's where it learned "this is me." So the target agent's own past turns must be `assistant`. Everyone else (all humans, all other agents) becomes `user`. This is exactly what AutoGen's `ConversableAgent` does: "when the agent composes and sends the message, the role is `assistant`; when the agent receives a message, the role is `user`" — and crucially this mapping is *recomputed per agent*, so the same physical message is `assistant` to its author and `user` to everyone else ([AutoGen ConversableAgent docs](https://microsoft.github.io/autogen/0.2/docs/reference/agentchat/conversable_agent/)). The research literature calls this Role-Playing Utterance Prompting (RPUP): "separating previous utterances of a selected speaker ... into alternating assistant and user messages ... helps an LLM maintain consistency and identity in multi-party conversations" ([Improving LLMs in Multi-party Conversations Through Role-Playing, Springer](https://link.springer.com/chapter/10.1007/978-981-97-5663-6_18); [Contrastive Speaker-Aware Learning, arXiv 2503.08842](https://arxiv.org/pdf/2503.08842)).

- **Name-tagging** answers "*which* of the several non-self speakers said this?" Role-mapping alone collapses Alice, Bob, and agent Ada all into `user` — indistinguishable. The fix every framework converges on is a speaker label inside the content: the canonical format in the literature is `#{n} - {speaker}: {utterance}` or simply `Speaker: utterance` (e.g. `"King: I am blessing you with my visit."`) ([Is ChatGPT a Good Multi-Party Conversation Solver?, arXiv 2310.16301](https://arxiv.org/pdf/2310.16301); [Who Speaks Next? Murder Mystery turn-taking, arXiv 2412.04937](https://arxiv.org/pdf/2412.04937)). Speaker-aware encoding (prepending a per-speaker identifier to each utterance) is the standard input format for multi-party modeling ([Contrastive Speaker-Aware Learning, arXiv 2503.08842](https://arxiv.org/pdf/2503.08842)).

**Why inline `Name:` and not the API `name` field?** The OpenAI `name` field exists exactly for this — "an optional name for the participant ... to differentiate between participants of the same role" ([OpenAI chat completion `name` field discussion](https://community.openai.com/t/chat-completion-message-object-name-issues/486357); [OpenAI Responses API multi-participant thread](https://community.openai.com/t/dealing-with-multiple-participants-using-the-responses-api-message-name/1154818)). But: (a) it's `^[a-zA-Z0-9_-]+$` on OpenAI (no spaces — "Pirate Pete" is invalid), (b) most non-OpenAI providers in your catalog (Anthropic, Google, Mistral, Cohere, the local/openai-compatible shims) either ignore it or reject it, and (c) models attend to it inconsistently. Since the Vercel AI SDK normalizes across **16 providers**, the portable choice is to put the label **in the content string**. Reserve the `name` field, if anything, as a redundant secondary signal — never the only one.

## 2. Should other participants' turns be `user` or `assistant`?

**All non-self turns → `user`, including other AI agents' turns.** This is the consensus and it's the right call for AgentSpace:

- From the target agent's standpoint there is exactly one "self." Everything it did NOT author is external input = `user`. AutoGen does precisely this — every message an agent receives (whoever authored it) is `user` from that agent's `_oai_messages` perspective ([AutoGen ConversableAgent docs](https://microsoft.github.io/autogen/0.2/docs/reference/agentchat/conversable_agent/); [AutoGen Multi-agent Conversation Framework](https://microsoft.github.io/autogen/0.2/docs/Use-Cases/agent_chat/)).
- Putting another agent's turn as `assistant` is the classic bug: the model treats it as *its own* prior output and continues it / adopts its voice → persona bleed. Keep other agents firmly on the `user` channel with their name label, so the target model sees them as "another participant talking," not "me."
- This also keeps the alternation clean: a run of consecutive non-self turns (Alice, then Bob, then Ada) becomes a sequence of `user` messages — which is fine for all your providers — or can be merged into one `user` message with newline-separated `Name: text` lines if a provider is strict about consecutive same-role turns (Anthropic historically prefers alternation; merging consecutive `user` turns into one block is the safe normalization).

## 3. Handling the agent's OWN prior turns

- Map them to `assistant`. Do **not** prefix your own turns with `Self-Name:` in the content — the model should learn "my output is just the message text, no label." (If you label your own turns, the model will start emitting `Pirate Pete:` prefixes in its replies — format drift.)
- The transcript must still end on a `user` turn (your current code already enforces this by popping trailing `assistant` turns — keep that). In a group thread the "trigger" is usually a human/other-agent message, so this falls out naturally, but the guard stays important because another agent's reply could be the last completed row.
- Coherence caveat from the literature: even strong models degrade at *turn-taking* and at *grounding on multiple characters* simultaneously ([Multi-Party Chat / MultiLIGHT, arXiv 2304.13835](https://arxiv.org/abs/2304.13835) — its two named failure modes are "when to talk" and "coherent utterances grounded on multiple characters"). That's an argument for doing turn arbitration *outside* the prompt (your M2.1 arbitration layer decides WHO speaks; the prompt only ever asks ONE agent for its line). Don't ask the model to decide whether it should speak — decide that in the orchestrator and only then build a prompt. This sidesteps the weakest capability.

## 4. Injecting "you are <persona>, in a group with <participants>"

Build a system message = `persona.systemPrompt` + a generated **roster/identity footer**. Recommended footer template:

```
--- Group chat context ---
You are "{selfName}". You are one participant in a group chat. Other participants:
{for each other participant} - {name} ({"human" | "AI agent"})
Messages from others are shown prefixed with their name (e.g. "Alice: ..."). 
Write ONLY {selfName}'s next message. Do not prefix it with your name. 
Never write, continue, or role-play any other participant's messages. 
If a message is not addressed to you and needs no reply from you, you may respond with an empty message.
```

Notes:
- Put the persona's *own* systemPrompt FIRST (its character must dominate), then the roster footer. The footer is mechanical framing, not character.
- "human" vs "AI agent" labeling matters: it tells the model the social setting (it's allowed to talk to the other AIs, address them by name, etc.) — directly supports your @mention/agent→agent addressing goal (M2.1).
- The "empty message" escape hatch is a soft fallback only; your real turn-gating is the arbitration layer, not the model.

## 5. Context isolation — the core of M2.3

**Per-agent isolation is achieved by what is and isn't shared:**

| Element | Shared across agents? | Per-agent? |
|---|---|---|
| Transcript rows (the messages) | ✅ shared (one thread) | role-flipped + relabeled per viewer |
| System prompt | ❌ never shared | ✅ only this agent's own |
| Roster footer | mostly shared | ✅ "you are X" line differs |
| BYOK credential / model | — | ✅ per persona (you already do this) |

So each agent sees the **same events** but **only its own instructions**, with itself as `assistant` and everyone else as labeled `user`. Never concatenate Agent A's systemPrompt into Agent B's context — that's the leakage vector. Your existing `selectPersona` already resolves a single persona's systemPrompt/model; M2 generalizes the loop to call it per-agent-being-asked, building a fresh `buildPrompt` view each time. The transcript itself stays identical; only the viewpoint transform changes.

This is exactly the AutoGen model: one shared GroupChat message list, but each agent's LLM call applies its own role mapping over it ([AutoGen GroupChat](https://microsoft.github.io/autogen/0.2/docs/reference/agentchat/groupchat/)).

## 6. Known pitfalls and the guard for each

| Pitfall | Cause | Guard |
|---|---|---|
| **Speaking as the wrong persona / continuing the transcript** ("Alice: …") | Model treats the labeled transcript as a script to continue | (a) explicit "write only your own message, no name prefix"; (b) add other participants' `"\n{name}: "` labels as **stop sequences**; (c) post-process: strip a leading `^{anyKnownName}:\s*` from the model output. The murder-mystery paper's fix: a controlled model "refrains from answering and only outputs utterances for characters it directly controls" ([Who Speaks Next?, arXiv 2412.04937](https://arxiv.org/pdf/2412.04937)). |
| **Persona bleed / impersonating another agent** | Another agent's turn was placed on `assistant`, or labels missing | Keep ALL non-self turns on `user` with name labels (§2). |
| **Instruction leakage** (agent reveals/obeys another agent's system prompt) | Other agents' system prompts leaked into context | Never include other agents' system prompts; isolation by construction (§5). |
| **Format drift** (emits `Name:` on its own line, JSON, stage directions) | Model imitates the transcript's labeled format | Don't label self-turns; one-line instruction "reply as plain chat text"; few-shot the clean format if needed. |
| **Self-name confusion** (loses track of which one it is) | Roster ambiguous, or own turns unlabeled and indistinguishable | Pin `selfName` in the footer; rely on `assistant` role to mark self. |
| **Infinite agent→agent loops / cost blowup** | Agents reply to agents' `complete` messages forever | NOT a prompt problem — solve in arbitration (turn budget per "human-initiated round," loop/depth cap, @mention-gated agent→agent). The prompt layer should never be the thing stopping the loop. (Your TASK already scopes this to M2.1; flagging that no prompt trick substitutes for a hard guard.) |

## 7. Concrete recipe for AgentSpace `buildPrompt`

A drop-in evolution of the current function. New inputs in **bold**; output type unchanged (`GatewayMessage[]`).

```ts
interface PromptRow {
  senderHex: string;        // NEW: who authored this row (identity hex or persona key)
  senderName: string;       // NEW: display name ("Alice", "Pirate Pete")
  senderKind: 'human' | 'agent';  // NEW
  text: string;
  sentMicros: bigint;
}

interface Participant { name: string; kind: 'human' | 'agent'; }

function buildGroupPrompt(
  rows: PromptRow[],
  self: { hex: string; name: string; systemPrompt: string },  // the agent being asked
  roster: Participant[],                                       // everyone in the thread
): GatewayMessage[] {
  const ordered = [...rows].sort(byMicros);

  // 1. System = persona's own prompt + mechanical roster/identity footer.
  const others = roster.filter(p => p.name !== self.name);
  const rosterLines = others.map(p => `- ${p.name} (${p.kind === 'human' ? 'human' : 'AI agent'})`).join('\n');
  const system =
    self.systemPrompt + '\n\n--- Group chat context ---\n' +
    `You are "${self.name}", one participant in a group chat. Others present:\n${rosterLines}\n` +
    `Messages from others appear prefixed with their name (e.g. "Alice: hi"). ` +
    `Write ONLY ${self.name}'s next message as plain text. Do not prefix it with your name. ` +
    `Never write or continue another participant's message.`;

  // 2. Role-flip + name-tag. Self -> assistant (no label). Others -> user, "Name: text".
  const turns: GatewayMessage[] = [];
  for (const r of ordered) {
    if (r.text.length === 0) continue;               // skip in-flight streaming rows
    if (r.senderHex === self.hex) {
      turns.push({ role: 'assistant', content: r.text });        // own turn, unlabeled
    } else {
      const line = `${r.senderName}: ${r.text}`;
      const prev = turns[turns.length - 1];
      if (prev && prev.role === 'user') prev.content += '\n' + line;  // merge consecutive others
      else turns.push({ role: 'user', content: line });
    }
  }

  // 3. Must end on a user turn (unchanged guard).
  while (turns.length && turns[turns.length - 1].role === 'assistant') turns.pop();

  return [{ role: 'system', content: system }, ...turns];
}

// At call time also pass to the gateway:
//   stop: others.map(p => `\n${p.name}:`)   // anti-impersonation stop sequences
// And post-process the reply: strip a leading /^(self|other names):\s*/ if the model adds one.
```

Backward-compat: the single-agent DM case is this function with `roster = [self, theHuman]` — one human → one `user` turn, no labels needed visually but harmless if present. You can keep the old `buildPrompt` for 1:1 and add `buildGroupPrompt`, or unify (recommended) and treat 1:1 as the degenerate roster. Keep `DEFAULT_SYSTEM_PROMPT` and the trailing-assistant pop exactly as they are today.

Two AgentSpace-specific call-outs:
- **Streaming rows**: your `streaming`/`reply_delta` rows must be excluded until `complete` (you already skip empty text — extend to skip non-`complete` rows so half-written agent turns don't enter another agent's context mid-flight).
- **The `stop` sequence + leading-label strip** are the cheap, provider-portable belt-and-suspenders against the No.1 failure (writing `Bob: …`). Do both; the AI SDK passes `stopSequences` through to every provider that supports it.

---

## Sources

- [Is ChatGPT a Good Multi-Party Conversation Solver? (arXiv 2310.16301)](https://arxiv.org/pdf/2310.16301) — `#{n} - {speaker}: {utterance}` speaker-label format.
- [Multi-Party Chat / MultiLIGHT — Conversational Agents in Group Settings with Humans and Models (arXiv 2304.13835)](https://arxiv.org/abs/2304.13835) — the canonical humans+models group-chat study; two failure modes "when to talk" and "grounding on multiple characters."
- [Improving LLMs in Multi-party Conversations Through Role-Playing (Springer)](https://link.springer.com/chapter/10.1007/978-981-97-5663-6_18) — RPUP: separate the selected speaker's turns into `assistant`, others into `user`.
- [Contrastive Speaker-Aware Learning for Multi-party Dialogue Generation with LLMs (arXiv 2503.08842)](https://arxiv.org/pdf/2503.08842) — speaker-aware input encoding (prepend per-speaker token/label).
- [Who Speaks Next? Multi-party AI Discussion via Turn-taking in Murder Mystery Games (arXiv 2412.04937)](https://arxiv.org/pdf/2412.04937) — speaker-and-utterance prediction; a model "refrains from answering and only outputs utterances for characters it directly controls."
- [AutoGen ConversableAgent reference](https://microsoft.github.io/autogen/0.2/docs/reference/agentchat/conversable_agent/) and [GroupChat reference](https://microsoft.github.io/autogen/0.2/docs/reference/agentchat/groupchat/) and [Multi-agent Conversation Framework](https://microsoft.github.io/autogen/0.2/docs/Use-Cases/agent_chat/) — per-agent role mapping (own=assistant, received=user); one shared message list viewed per-agent; `{agentlist}`/@mention speaker selection.
- [CAMEL: Communicative Agents (arXiv 2303.17760)](https://arxiv.org/pdf/2303.17760) — inception/role prompting; named failure mode "role flipping."
- [OpenAI chat message `name` field — community discussions](https://community.openai.com/t/dealing-with-multiple-participants-using-the-responses-api-message-name/1154818) and [name field issues](https://community.openai.com/t/chat-completion-message-object-name-issues/486357) — `name` differentiates same-role participants but is constrained/inconsistently supported → prefer inline labels for a 16-provider gateway.

**Relevant file:** `E:\Cloud\AgentSpace\services\orchestrator\src\prompt.ts` (`buildPrompt`, lines 20-34; `selectPersona`, lines 66-80) — the function to generalize per the recipe in §7.
