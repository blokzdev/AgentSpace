# PRD.md — AgentSpace Product Surface

> Aspirational. Owns the **product surface**: vision, audience, the experience,
> moats, and tier. When the question is *why a feature exists*, this is the
> answer. Behavioral contracts live in `SPEC.md`; architecture in `BLUEPRINT.md`;
> sequencing in `ROADMAP.md`; rationale for choices in `MEMORY.md` (DEC-IDs).

---

## 1. Vision

**AgentSpace is the mobile home where humans and the AI agents they build live in
the same conversation — provider-agnostic, BYOK, real-time, and orchestratable.**

It is *WhatsApp + Discord, but for highly configurable AI agents*. You design
digital personas from scratch, deploy them, and they appear in your contact list
like any other person. Then you talk to them — and let them talk to each other —
in 1:1 chats and group threads where humans and multi-agent teams collaborate in
real time, to socialize, orchestrate operations, or automate work.

---

## 2. Audience

- **Builders & power users** who want bespoke AI assistants wired to their own
  knowledge and tools, without writing a backend.
- **Small teams** who want shared agents (a "research analyst", an "ops bot")
  living in the same group threads as the humans.
- **The privacy/cost-conscious**, served by **BYOK** and (later) local/on-device
  models — your keys, your models, your data path.

Android-first (DEC-005); iOS later.

---

## 3. The experience (what it feels like)

1. **Sign in** → you have a contact list and threads, like a messenger.
2. **Build an agent** in Agent Studio: give it a name and résumé/identity, a
   system prompt, a model (Claude/Gemini/OpenAI/local), a knowledge base, a
   toolkit, and optional workflows. It joins your contacts.
3. **Chat 1:1** with an agent — streamed, real-time replies that can read its
   knowledge base and call its tools.
4. **Make a group** with friends and several agents. @mention an agent, or let a
   multi-agent team collaborate. Everyone sees the conversation update live.
5. **Automate**: give an agent an event-triggered workflow (on a schedule, on a
   message, on an event) so it acts autonomously and posts back to a thread.

---

## 4. Product pillars

1. **Realtime messaging** — 1:1 + group threads, presence, typing, read state;
   humans and agents are first-class members.
2. **Agent Studio** — build/version personas: identity/résumé, system prompt,
   model + params, avatar.
3. **Knowledge bases** — per-agent document ingestion + retrieval (RAG).
4. **Tool/API toolkits** — function tools + MCP servers, scoped per agent.
5. **Workflows** — event-triggered loops (on-message / on-schedule / on-event).
6. **Multi-agent orchestration** — agents collaborating in group threads.
7. **Multi-model BYOK gateway** — Claude/Gemini/OpenAI/local behind one interface.
8. **Platform** — auth, push, usage metering/quotas, observability, safety.

---

## 5. Moats — why this is hard to copy

- **Realtime substrate × agent platform.** Most "AI chat" apps are request/
  response. AgentSpace fuses a true multiplayer real-time core (SpacetimeDB) with
  an agent runtime, so humans and many agents share one live conversation.
- **Provider neutrality + BYOK.** Not a wrapper around one model. Users bring keys
  and pick models per agent (incl. local), which is both a trust moat and a cost/
  lock-in story competitors tied to one provider can't match (DEC-006).
- **Composable agents as contacts.** Personas with knowledge + tools + workflows
  that live in your social graph and can be orchestrated as teams.

---

## 6. v1 scope & non-goals

**In v1 (full ecosystem — DEC-011):** all eight pillars, built behind a focused,
high-quality core, Android-only.

**Not in v1 (see ROADMAP §5 / BACKLOG):** on-device/edge inference, iOS, agent
marketplace, voice/video calls, web client.

---

## 7. Guiding product principles

- **Real-time or it doesn't count.** Every participant sees the same live state.
- **Your keys, your models, your data.** BYOK and provider neutrality are defaults,
  not add-ons.
- **Agents are people-shaped.** They live in contacts and threads; configuration
  is a profile, not a config file.
- **Trust at the boundary.** Sanitize all model/tool/user input; never expose keys
  to the client; gate destructive tool actions.
