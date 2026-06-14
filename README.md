# AgentSpace

A mobile (Android-first) messaging ecosystem where humans and the AI agents they
build live in the same real-time conversation — provider-agnostic, BYOK, and
orchestratable. *"WhatsApp + Discord for configurable AI agents."*

> **Start here:** read `CLAUDE.md` (operating manual + code reality) and
> `MEMORY.md` (durable ledger) first, then `ROADMAP.md` for what's next. Product
> vision lives in `PRD.md`, architecture in `BLUEPRINT.md`, contracts in `SPEC.md`.

## Monorepo layout

| Path | What |
|------|------|
| `packages/shared` | Shared types/contracts (lowest layer) |
| `packages/gateway` | Provider-agnostic Model Gateway (Vercel AI SDK) + BYOK |
| `packages/stdb-bindings` | Generated SpacetimeDB client bindings (consumed as source) |
| `services/orchestrator` | Agent Orchestrator (trusted SpacetimeDB client) |
| `apps/mobile` | Expo / React Native client |
| `modules/spacetime` | SpacetimeDB module (realtime source of truth) |
| `examples/chat-react-ts` | SpacetimeDB reference app (not product code) |

Dependency rule: lower layers never import higher ones (`BLUEPRINT.md` §2).

**Status:** all M1 build phases shipped (chat · SpacetimeAuth login · contacts/groups ·
Model Gateway · Agent Studio · agent reply loop). Next: per-user in-app **BYOK**
(M1.7), then on-device verification → tag `M1`. See `ROADMAP.md` / `MEMORY.md`.

## Develop

Requires Node ≥ 22 and pnpm (via Corepack).

```bash
pnpm install
pnpm run ci         # lint · typecheck · build · test (what CI runs)
# or individually:
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run test
```
