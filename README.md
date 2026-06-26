# AgentSpace

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

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

**Status:** `M1` shipped (build your own agents + chat with them on-device, with your own
provider key) · `M1.9` reliable delta-streaming · `M2.1` multi-agent group threads (the MVP:
`@mention` addressing + a reducer-enforced episode/turn/cost budget) · `M2.5` on-device
connection resilience (auto-reconnect) · `M2.2` agent presence/typing · `M2.3` NL "Hey {name},"
addressing · `M2.4` (lean) public agent cards · `M2.9` down-payment (branded login + guest path).
Next: `M2.9.2` native Google sign-in + module aud guard (gated on `SETUP.md` S-9). See
`ROADMAP.md` / `MEMORY.md`.

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

## License

[Apache License 2.0](LICENSE) © 2026 blokzdev — see [`NOTICE`](NOTICE) for
attribution. You may use, modify, and distribute this software under the terms of
the Apache-2.0 license (a permissive license with an explicit patent grant). The
`examples/chat-react-ts` reference app is derived from the SpacetimeDB starter
template and carries its own upstream license. *(Repo-visibility / commercial
posture is revisited at launch — `BACKLOG.md` BL-023 / `MEMORY.md` DEC-033.)*
