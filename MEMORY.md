# MEMORY.md — AgentSpace Durable Memory Ledger

> The continuity ledger. The dev container is ephemeral; this committed file is
> how context survives across sessions. **Read this first every session.**
> Governed by the Memory Protocol in `CLAUDE.md` §3.
>
> - **Snapshot** & **Open Threads** are mutated in place (current state).
> - **Decision Log** & **Session Journal** are append-only (history is the value).

---

## Snapshot — where we are right now

*Last refreshed: 2026-06-13.*

Project bootstrap. The operating harness is in place (`CLAUDE.md`, this ledger)
and the SpacetimeDB toolchain + a reference chat app are installed and building.
**Awaiting the founder's project brief** before defining the North Star and
creating `ROADMAP.md`. No product code written yet.

- **Active branch:** `claude/agentspace-initial-setup-w8rx3n`
- **Built & verified:** `examples/chat-react-ts` client builds clean.
- **Next:** receive project details → draft North Star + PRD direction →
  create `ROADMAP.md` with M0.

---

## North Star — the durable vision

*Placeholder.* The founder will share the AgentSpace project brief next. Until
then the vision is intentionally undefined. Fill this in deliberately (and log
a `DEC-` entry) once the brief lands — do not guess it.

What we know so far: **AgentSpace** is a long-horizon product built as a
human + AI-cofounder collaboration, with the SpacetimeDB realtime stack chosen
as a foundation to evaluate.

---

## Decision Log (append-only)

> Never edit a past entry. Supersede with a new entry that cites the old ID.

### DEC-001 — Adopt the seven-doc harness, adapted, with a Memory layer
*2026-06-13.* Adopted the documentation architecture from the Vibecoding
harness reference (PRD / SPEC / BLUEPRINT / ROADMAP / BACKLOG / CLAUDE) and
added `MEMORY.md` as a first-class continuity doc. Rationale: sessions run in
ephemeral containers, so durable memory must be an explicit, committed artifact
— not implicit in chat history. Vision docs are created lazily, when they have
something to own, starting with ROADMAP after the founder's brief.

### DEC-002 — Memory lives in two files with a read/write protocol
*2026-06-13.* `CLAUDE.md` holds the operating manual + code reality and defines
the **Memory Protocol**; `MEMORY.md` is the storage (snapshot, decisions,
journal, open threads, glossary). Decision Log and Session Journal are
append-only; Snapshot and Open Threads mutate in place. Rationale: separates
the *rules* of memory (manual) from the *contents* of memory (ledger), keeping
one source of truth per concept.

### DEC-003 — SpacetimeDB stack installed; chat template as reference surface
*2026-06-13.* Installed SpacetimeDB CLI `2.5.0` and scaffolded the
`chat-react-ts` template into `examples/chat-react-ts/` (per the founder's
screenshot). Treated as a learning/reference surface, not product code. Used
`spacetime init --template` (one-shot scaffold) rather than `spacetime dev`
(long-running dev server) so the setup is committable without holding a process
open. Rationale: get the founder a working, buildable reference of the chosen
realtime stack before product direction is set.

---

## Session Journal (append-only)

### 2026-06-13 — Project bootstrap
- Initialized repo on branch `claude/agentspace-initial-setup-w8rx3n` (was empty).
- Installed SpacetimeDB CLI `2.5.0` (`~/.local/bin/spacetime`).
- Scaffolded `examples/chat-react-ts` from the `chat-react-ts` template;
  installed client + server-module deps; `npm run build` passes.
- Authored the operating harness: root `CLAUDE.md` (manual + Memory Protocol),
  this `MEMORY.md` ledger, and a root `.gitignore`.
- **Next:** founder shares the AgentSpace brief → set North Star → create
  `ROADMAP.md` (M0) and, as needed, PRD/SPEC/BLUEPRINT.

---

## Open Threads

> Unknowns awaiting an answer or decision. Resolve by linking a `DEC-` entry.

- **OT-001** — *AgentSpace project brief.* The North Star, audience, and scope
  are undefined pending the founder's details. Unblocks: founder. Blocks:
  ROADMAP creation, PRD.
- **OT-002** — *SpacetimeDB module language.* The template ships a TypeScript
  server module; confirm whether product modules stay TypeScript or move to
  Rust/C# once architecture is set. Unblocks: BLUEPRINT decision after the brief.

---

## Glossary

- **AgentSpace** — the product we are building (scope TBD; see OT-001).
- **Cofounder model** — the working mode: human founder + AI (Claude) as
  cofounder/lead engineer, coordinating through this doc harness.
- **SpacetimeDB** — realtime database + server-module runtime chosen as a
  candidate foundation; clients subscribe to SQL and react to live updates.
- **Module** — a SpacetimeDB server-side program (reducers + tables) that the
  database runs; the client's `module_bindings/` are generated from it.
- **Doc graph** — the set of single-owner docs in `CLAUDE.md` §1.
- **Drift sweep** — periodic doc↔code reconciliation (`CLAUDE.md` §7).
