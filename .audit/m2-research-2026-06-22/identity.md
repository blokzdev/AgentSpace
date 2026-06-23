# M2 research — Research — per-agent identity & presence (SpacetimeDB)

> Generated 2026-06-22 by the m2-multiagent-plan-research workflow (8 agents). See DEC-031.

The architecture is definitive enough: a connection presents one token at build time (`.withToken(...)`), and `ctx.sender` is derived from that token's identity — so N identities require N connections (one token each). This is the established model in the codebase (`connectOrchestrator` builds one connection with one token). I have everything needed to write the recommendation.

Here is my research synthesis.

---

# Research: Per-Agent Identity & Presence in SpacetimeDB (M2)

## 1. What SpacetimeDB actually gives us (authoritative facts)

Confirmed against the official SpacetimeDB docs and the repo's reference example / code reality:

- **Identity is deterministic from a JWT.** An `Identity` is `BLAKE3(issuer, subject)` — derived from the `iss` and `sub` claims of an OIDC ID token. It is "long-lived, public, globally valid, and always refers to the same end user across connections." `ConnectionId` is per-connection and ephemeral. ([Key Architecture](https://spacetimedb.com/docs/intro/key-architecture/), [Authorization](https://spacetimedb.com/docs/http/authorization/), [Using Auth Claims](https://spacetimedb.com/docs/1.12.0/core-concepts/authentication/usage/))
- **One issuer → many identities.** "A backend service can generate different identities by varying the subject claim while maintaining the same issuer." This is the linchpin for per-agent identities: **one trusted issuer, `sub = agentId`, yields one stable `Identity` per agent.** ([Using Auth Claims](https://spacetimedb.com/docs/1.12.0/core-concepts/authentication/usage/))
- **Bring-your-own OIDC issuer is supported.** SpacetimeDB trusts any OIDC-compliant issuer that publishes a JWKS — the docs cite running OpenAuth or Keycloak as a self-hosted issuer that exposes `/authorize`/`/token` and publishes JWKS. So the orchestrator can run/host its own issuer and **sign its own id_tokens** for arbitrary subjects. ([Authentication](https://spacetimedb.com/docs/core-concepts/authentication/), search corroboration). Caveat: the JWKS must be standards-compliant and network-reachable by the STDB host, or the public-key fetch fails ([issue #2600](https://github.com/clockworklabs/SpacetimeDB/issues/2600)).
- **Connection ↔ identity is 1:1 per token.** A connection is built with exactly one token (`DbConnection.builder().withToken(t)`), and `ctx.sender` is that token's identity. A single user/identity may hold *many* connections, but **a single connection cannot speak as multiple identities.** To act as N identities, a process opens **N connections, one token each.** (Confirmed by the repo's `connectOrchestrator` and the connection model; [Key Architecture](https://spacetimedb.com/docs/intro/key-architecture/).)
- **Anonymous host-minted tokens exist too.** Connecting without a token makes STDB "create a new identity and return a server-issued token." This is exactly what today's orchestrator does (persisted anonymous token → stable identity). It mints an identity but gives you no control over the subject and isn't a real service account — that's the open `OT-007`.
- **Presence is application-modeled, not built-in.** There is no native presence. The pattern (used verbatim in both `examples/chat-react-ts` and our `modules/spacetime`) is: a public `user` table with `online: bool`, flipped by the `clientConnected` / `clientDisconnected` lifecycle hooks keyed on `ctx.sender`. Typing/last-seen are just additional columns updated by reducers. **Presence is a property of an identity that has a live connection.**

The consequence that drives the whole decision: **in SpacetimeDB, "real presence" is inseparable from "holds a live connection under its own identity."** You cannot get a genuine green online-dot for an actor that isn't connected. Anything else is synthetic.

## 2. The two identity models, compared

### Option A — Per-agent SpacetimeDB identity

Each deployed agent gets its own `Identity`. The orchestrator runs (or points at) a custom OIDC issuer and mints a token with `sub = "agent:<agentId>"` (or `sub = "<owner>:<agentId>"`), then opens **one connection per active agent**. Each agent becomes a real `thread_member` with `role='agent'`, its own `user` row, and `ctx.sender` = that agent.

- **Presence/typing:** *Real and free.* The agent's connection drives `clientConnected/Disconnected` → `user.online`. A "typing/thinking" state is a reducer call on its own identity. Avatars/names come from its own `user` row. Indistinguishable from a human participant — exactly the "agents-as-contacts" vision (`DEC-022`).
- **Add-agent-to-group:** `add_member(threadId, agentIdentity, 'agent')` — the *same* reducer humans already use. No agent-specific membership path. The existing `thread_member` spine and all Views work unchanged.
- **Views / read-gating:** **Zero new Views.** `my_thread_messages`, `my_thread_members`, `my_reply_deltas`, `my_active_personas`, `my_persona_keys` are all already keyed on `ctx.sender` + `role='agent'` membership. Each agent connection sees exactly its own threads. The per-(owner,provider) BYOK resolver still works because the persona owner is reachable via `thread.agentId → agent.owner` regardless of which identity is the member.
- **BYOK interplay:** Unchanged. Keys are still sealed to the *orchestrator's* box pubkey (one keypair, in `service`), not to per-agent identities — the orchestrator process still does all decryption. `credentialRef = "<ownerHex>:<provider>"` is unaffected by which identity posts.
- **Cost:** N live WebSocket connections + N subscription sets (fan-out scales with agents × threads). A token-minting/refresh path. This is finally paying down **OT-007** (a real service-account/issuer instead of a persisted anonymous token).
- **Reducer changes:** The reply reducers (`agent_reply_begin/delta/finish/cancel`) already gate on "`ctx.sender` is an `agent` member of this thread" — they keep working verbatim when `ctx.sender` is a per-agent identity instead of the single service identity. **This is the key reason A is additive, not a rewrite.**
- **Reversibility:** Medium. Schema is unchanged (identities are just values in `thread_member.member` / `message.sender`); the change is *operational* (how the orchestrator authenticates and how many connections it holds). You can fall back to one connection without a migration, but message rows authored under agent identities would then look "orphaned" from the single service identity.

### Option B — Single service identity + persona tag

Keep today's model. One service identity posts every agent's messages, tagging each `message`/`run` with an `agentId`. "Membership" of an agent becomes a `thread ↔ agent` join table (generalizing today's single `thread.agentId` to many). Presence/avatars are synthetic rows the orchestrator maintains.

- **Presence/typing:** *Synthetic.* No connection backs an agent, so `online` can't come from a lifecycle hook — the orchestrator must write/maintain a fake `agent_presence` row and a `typing` flag via reducers, and is solely responsible for never leaving a stale "online"/"typing" after a crash (no `clientDisconnected` safety net). Avatars are derived from the `agent` config row, not a `user` row.
- **Add-agent-to-group:** A new `thread_agent` join table + a new `add_agent_to_thread` reducer (can't reuse `add_member`, since there's no identity to add). New addressing/arbitration code must read this table instead of `thread_member`.
- **Views / read-gating:** **New Views and schema.** Today's membership Views key on `ctx.sender` — but the single service identity is the member of *every* agent thread, so it already sees everything; that's fine for the orchestrator but means the *human-facing* presence/typing/agent-roster must be exposed through *new* synthetic Views, and per-agent context isolation (M2.3) has to be enforced in orchestrator code rather than falling out of membership.
- **BYOK interplay:** Same as today (already keyed on persona owner, not member identity). No change — this is B's one genuine win.
- **Cost:** One connection, one subscription set. Cheap. No token minting; `OT-007` stays open.
- **Reversibility:** High at the schema layer (it's all additive columns/tables), but it **accrues synthetic-presence machinery** (fake online/typing rows, crash-recovery sweeps, a parallel membership table) that you'd have to *delete* later if you migrate to A — so it's reversible but in the wrong direction (it's tech debt against the eventual A).

### Decision matrix

| Dimension | A — per-agent identity | B — service identity + tag |
|---|---|---|
| Real presence/typing/avatars | ✅ native (lifecycle hooks) | ⚠️ synthetic, crash-fragile |
| Add-to-group | ✅ reuse `add_member` | ❌ new join table + reducer |
| New Views / read-gating | ✅ none (existing spine) | ❌ new synthetic Views |
| Per-agent context isolation (M2.3) | ✅ falls out of `ctx.sender` | ⚠️ enforced in app code |
| BYOK | ✅ unchanged | ✅ unchanged |
| Reply reducers (M1.9) | ✅ unchanged (already role-gated) | ✅ unchanged |
| Infra cost | N connections + token minting | 1 connection |
| Pays down OT-007 | ✅ yes | ❌ no |
| Matches DEC-022 vision | ✅ exactly | ❌ explicitly the deferred-from state |

## 3. Recommendation: **adopt Option A (per-agent identity)** — phased, with B-style tagging as the bridge

**Why A:** The M2 acceptance bar demands *agent presence/typing* and *per-agent context isolation*, and SpacetimeDB makes both **free** under A and **hand-rolled + fragile** under B. A reuses the existing `thread_member` authorization spine and all five membership Views unchanged, reuses `add_member`, and — critically — the M1.9 reply reducers already gate on `role='agent'` membership of `ctx.sender`, so they keep working when `ctx.sender` becomes a per-agent identity. A is the additive step `DEC-022` already named ("agents-as-contacts with real presence … deferred to BL-014/M2"), and it's the natural moment to close **OT-007** with a real issuer. B looks cheaper but spends that savings building synthetic-presence machinery you'd later throw away — debt pointed away from the vision.

**The one real cost of A** is auth: N connections + a token-minting path. That is genuinely new work, but it's bounded and well-trodden — run a small self-hosted OIDC issuer (OpenAuth/Keycloak, per the docs) or a self-signed-JWT + JWKS endpoint, with `iss` = our issuer and `sub` = `agentId`. STDB validates against the published JWKS exactly as it does for any provider.

### Suggested phasing (keeps the M2 roadmap intact, each step shippable & reversible)

- **M2.0 (identity foundation — slot ahead of M2.1):** Stand up the orchestrator's OIDC issuer + JWKS (closes OT-007's "real service account"). Add a `mint identity(agentId)` helper and a per-agent **connection-pool manager** (open/refresh/close a connection per active agent; cap concurrency). Prove headlessly that two agent identities can each `agent_reply_*` in one thread. **No mobile or schema change yet** — the single-agent thread still works because the service identity remains a valid agent identity (special case of A). Reversible: if it stalls, fall back to the single connection.
- **M2.1 (addressing + arbitration):** Generalize `create_agent_dm`'s "add the agent as a member" to **add the agent's *own* identity** as the `role='agent'` member (one `thread_member` per agent). Build addressing (@mention → resolve to agent identities) and the turn-arbitration/loop-guard *on top of real membership rows* (the arbiter iterates `thread_member` where `role='agent'`). Hard loop/cost guards live in the orchestrator (it already owns the in-flight Map and run lifecycle).
- **M2.2 (presence & typing):** Effectively *free* — each agent connection already flips `user.online` via the lifecycle hooks. Add a `typing`/`thinking` column (or a tiny `presence` event) set on `agent_reply_begin` and cleared on finish/cancel. Mobile renders agent avatars/presence using the *existing* `user`-table presence path (the same `Avatar` + presence-ring component humans use).
- **M2.3 (context isolation):** Falls out of `ctx.sender` — each agent's prompt is built from the thread it's a member of, name-tagging other participants (humans by `user.displayName`, agents by their `user`/persona name), with its own `systemPrompt` as the system role. No new read-gating needed.

**Bridge note:** keep `message.runId`/`run.agent` (already `ctx.sender`) as the per-agent tag *in addition to* the per-agent identity — that's not B, it's just provenance, and it lets a multi-agent thread attribute each row to a run/agent without a join. The `agentId`-tag idea from B survives as metadata; what we reject is using it *instead of* a real identity/membership.

**Watch-outs to carry into the plan:** (1) connection fan-out — N agents × M threads subscriptions; cap active-agent connections and lazily connect/disconnect agents by thread activity. (2) JWKS must be reachable by the STDB host and spec-compliant (issue #2600). (3) crash recovery is *better* under A (STDB's `clientDisconnected` clears `online` automatically) but in-flight runs still need the existing idle-timeout/cancel paths. (4) BYOK keypair stays a single orchestrator-process keypair in `service` — do **not** mint per-agent box keys.

## Key files reviewed (all absolute)
- `E:\Cloud\AgentSpace\modules\spacetime\src\index.ts` — the `thread_member` (role human|agent) authorization spine, the five membership Views, `create_agent_dm`/`add_member`, the M1.9 reply reducers (all gate on `ctx.sender` being a `role='agent'` member — the reason Option A is additive), and the `user.online` presence pattern via `clientConnected/Disconnected`.
- `E:\Cloud\AgentSpace\services\orchestrator\src\spacetime.ts` — `connectOrchestrator`: one connection, one persisted token, one stable identity (`.withToken(...)`), `onConnect` returns `(conn, identity, token)`. This is the single-connection model Option A would fan out to N.
- `E:\Cloud\AgentSpace\services\orchestrator\src\replyLoop.ts` — `self`-as-agent-member gating, the per-thread in-flight `Map`, run lifecycle / cancellation-on-supersede (the loop-guard hooks M2.1 arbitration extends).
- `E:\Cloud\AgentSpace\services\orchestrator\src\index.ts` / `byok.ts` — single orchestrator box keypair in `service`; `credentialRef = "<ownerHex>:<provider>"` keyed on persona owner (unaffected by which identity posts).
- `E:\Cloud\AgentSpace\examples\chat-react-ts\spacetimedb\src\index.ts` + `examples/chat-react-ts/CLAUDE.md` — reference presence pattern (public `user` + `online` + lifecycle hooks) and the confirmed STDB rules (reducers gate on `ctx.sender`; Identity is long-lived, ConnectionId per-connection; SpacetimeDB works with many OIDC providers incl. self-hosted).

## Sources
- [Key Architecture | SpacetimeDB docs](https://spacetimedb.com/docs/intro/key-architecture/) — Identity vs ConnectionId; one identity, many connections.
- [Authorization | SpacetimeDB docs](https://spacetimedb.com/docs/http/authorization/) — identity derived from `sub`+`iss` of any OIDC-compliant JWT; `POST /v1/identity` host-minted token; tokens non-portable across clusters.
- [Using Auth Claims | SpacetimeDB docs](https://spacetimedb.com/docs/1.12.0/core-concepts/authentication/usage/) — `iss`+`sub` compute Identity; **one issuer can produce many identities by varying `sub`**; validate `aud`.
- [Authentication | SpacetimeDB docs](https://spacetimedb.com/docs/core-concepts/authentication/) — compatible with most OIDC providers / implement your own; service-to-service via client-credentials or service accounts; anonymous host-issued tokens.
- [SpacetimeDB Auth with OpenAuth (Medium)](https://medium.com/@SeloSlav/quick-spacetimedb-auth-setup-with-openauth-hono-and-react-context-ef2ededba9fb) — concrete self-hosted issuer (OpenAuth) publishing JWKS and signing id_tokens STDB accepts.
- [OIDC ID Token for SpacetimeDB w/ Auth0 (DEV)](https://dev.to/insiderto/how-to-obtain-an-oidc-id-token-for-spacetimedb-using-nextjs-and-auth0-1ci) — STDB requires the ID Token specifically; verify full OIDC compliance.
- [SpacetimeDB issue #2600](https://github.com/clockworklabs/SpacetimeDB/issues/2600) — JWKS public-key fetch must be reachable/standards-compliant (custom-issuer caveat).
