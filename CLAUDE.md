# CLAUDE.md — AgentSpace Operating Manual

> Descriptive. "What is true today." This file is the operating manual and
> the code-reality doc. It is updated in the **same commit** as any change it
> describes. When a fact about the code and this file disagree, **the code
> wins and this file is wrong** — fix it.

AgentSpace is built as a long-running collaboration between a human founder
and an AI cofounder (Claude). This manual encodes how we work so that context
and discipline survive across ephemeral sessions. Read it at the start of
every session, together with `MEMORY.md`.

---

## 0. Read-me-first (session bootstrap)

At the start of **every** session, before doing task work:

1. Read `MEMORY.md` — the durable memory ledger (snapshot, decisions, open
   threads). This is how continuity survives a fresh container.
2. Read this file (`CLAUDE.md`) — the operating manual and code reality.
3. Read `ROADMAP.md` if it exists — current milestone/phase and acceptance bars.
4. Skim `git log --oneline -15` to see what the last session actually shipped.

At the **end** of every session (or at any phase close), run the
**Memory Protocol** in §3 before you stop.

---

## 1. Documentation architecture — the doc graph

Strict separation of concerns; each doc owns exactly one topic. That doc is
the single source of truth for its topic and wins any conflict about it.

| Doc | Owns | Tense | Consult when… |
|-----|------|-------|---------------|
| `MEMORY.md` | Continuity ledger: snapshot, decision log, session journal, open threads, glossary | Append-only / living | Starting a session; recording a decision; closing a session |
| `CLAUDE.md` (this file) | Operating manual + code reality | Descriptive ("what is") | You need to know how we work, or what the code actually does today |
| `ROADMAP.md` | Sequencing: milestones, phases, tasks, acceptance bars, strategic skips | Forward-looking | Deciding what to build next; closing a phase/milestone |
| `PRD.md` | Product surface: vision, audience, moats | Aspirational | Questioning *why* a feature exists |
| `SPEC.md` | Behavioral contracts: state machines, grammars, protocols | Prescriptive | Implementing a contract between components |
| `BLUEPRINT.md` | Architecture & data model: module graph, schemas, dependency rules | Prescriptive | Adding a module; touching the data model |
| `BACKLOG.md` | Carryover queue: tactical deferrals with revisit triggers + launch gates | Forward-looking | Deferring work; checking launch readiness |

The full doc suite now exists (authored 2026-06-13 alongside the ratified plan).
A doc is still born only when it has something to own — do not add new doc types
speculatively.

**Conflict rule.** Each topic has exactly one owner doc; that doc wins for its
topic. The code-reality doc (`CLAUDE.md`) wins for facts about the code today.

**Update rule.** The code-reality doc is updated in the same commit as the
change. Vision docs change only when targets move (a roadmap-level event).

---

## 2. Ladder numbering — Milestone › Phase › Task

- **Milestone (Mn)** — a shippable destination with an acceptance bar a
  reviewer can hold you to.
- **Phase (Mn.k)** — a workstream inside a milestone; one owner end-to-end.
- **Task** — a checkbox inside a phase, ≤1 hour each where possible.

Single namespace, decimal indentation, no skipped numbers. Carryovers
renumber; the rationale lives in `BACKLOG.md` / `ROADMAP` strategic-skips.

---

## 3. Memory Protocol — how continuity survives ephemeral sessions

Every session runs in a fresh container; the **git repo is the only memory**.
`MEMORY.md` is the durable ledger. This protocol governs reading and writing it.

### 3.1 What lives in `MEMORY.md`

- **Snapshot** — one paragraph: where the project is *right now*. Overwritten
  every session (it is "current state", not history).
- **North Star** — the durable vision. Changes rarely and only deliberately.
- **Decision Log** — append-only, dated, IDed (`DEC-001`, `DEC-002`, …). Every
  non-obvious choice with its rationale. Never edit a past decision; supersede
  it with a new entry that references the old ID.
- **Session Journal** — append-only, one entry per working session: date, what
  shipped (with commit refs), what's next. The narrative spine.
- **Open Threads** — questions and unknowns awaiting an answer or a decision.
  Each has an ID (`OT-001`), a one-line description, and who/what unblocks it.
- **Glossary** — domain terms with one-line definitions, so vocabulary is
  stable across sessions.

### 3.2 When to write

- **Session start:** read `MEMORY.md` (no write yet).
- **On any meaningful decision:** append a `DEC-` entry *immediately*, in the
  same commit as the work it justifies — don't batch it to end-of-session.
- **On a new unknown:** append an `OT-` entry to Open Threads.
- **On resolving an unknown:** mark the `OT-` resolved and (if it was a choice)
  add the matching `DEC-` entry.
- **Phase/milestone close:** refresh the Snapshot to new ground truth.
- **Session end:** append a Session Journal entry and refresh the Snapshot.
  This is mandatory — a session is not "done" until the journal is written.

### 3.3 Discipline

- One source of truth: a decision lives in the Decision Log, not scattered in
  prose. Other docs reference `DEC-` IDs rather than re-stating rationale.
- Append-only sections (Decision Log, Session Journal) are never rewritten —
  history is the value. Only Snapshot and Open Threads are mutated in place.
- Keep entries terse. The ledger is a working memory, not a diary.

---

## 4. Plan / execute / review separation

Three distinct turns; never collapse them:

1. **Plan** — a write-plan, ratified by the founder before code starts.
2. **Execute** — code edits + commits, narrated tersely.
3. **Review** — PR opened, CI green, merge.

**Plan-overhead threshold.** A write-plan is required when a phase has **>3
tasks OR >1 working day** of effort. Below that, execute inline against the
ROADMAP/MEMORY checklist — no ceremony.

**Five-field write-plan template** (restate in this order):

1. **Acceptance bar** — paraphrased from ROADMAP, reviewer-holdable.
2. **Tasks** — ≤1-hour units where possible.
3. **Files touched** — every path created/edited/deleted.
4. **Verification checklist** — concrete machine checks (lint, typecheck,
   build, tests).
5. **Out of scope** — what we are NOT doing, even if tempting.

Plus a separate **Human Verification** list (§ below) for anything code can't
check — tagged `[gate]` (blocks merge), `[smoke]` (this phase), `[spot-check]`
(when convenient). The AI never self-ticks a human-verification item; only an
explicit "verified" line from the founder closes one.

---

## 5. Phase- and milestone-close rituals

**Phase close:** (1) all tasks checked; (2) verification checklist passed and
open `[gate]` items acknowledged; (3) ROADMAP phase box ticked with a one-line
outcome (date + commit ref); (4) deferrals → BACKLOG with a trigger; (5)
code-reality changes → this file updated in the same commit; (6) **Memory
Protocol §3.2** run.

**Milestone close:** all phases closed; re-snapshot ground truth in ROADMAP
*and* `MEMORY.md`; walk BACKLOG and promote in-scope items; run the drift sweep
(§7) and route `[critical]`/`[important]` findings before tagging; tag
`[shipped <date>]`; capture a short retro in the Session Journal.

---

## 6. Commit, branch & PR cadence

- **Conventional commits with scope:** `docs:`, `feat:`, `fix:`, `refactor:`,
  `chore:` plus a scope, e.g. `feat(memory):`, `docs(roadmap):`.
- Reference the phase ID in the commit body (`Closes M1.4.`) once roadmaps exist.
- One commit per phase when work is small/coherent (≤3 files); multiple commits
  at natural checkpoints otherwise.
- **Branch hygiene:** feature branch per session; never push to `main` from an
  agent session; open a PR and let CI gate the merge.
- This repo's active development branch is recorded in `MEMORY.md`'s Snapshot.

---

## 7. Drift sweep — doc ↔ code reconciliation

Prevention (the §1 conflict rule + same-commit updates) stops most drift;
a periodic sweep catches what slipped. Run at milestone-close (mandatory) and
on-demand. The AI **catalogs** findings; the founder **routes** them — the AI
does not auto-fix without ratification.

Finding taxonomy: `[drift]` (code says X, a doc says Y), `[contradiction]`
(two docs both claim a topic), `[stale-promise]` (ROADMAP committed, never
delivered/deferred), `[orphan]` (broken ref / dead path), `[gap]` (code with
no doc, or a doc claim with no code). Severity: `[critical]`/`[important]`/
`[nice]` — and if everything is critical, nothing is. Sweep artifacts are
committed to `.audit/sweep-<date>.md` so the drift profile is queryable.

---

## 8. Code conventions

- **TypeScript strict.** Prefer `as const` and discriminated unions over `any`.
- **One-way dependency rules** between layers (defined in `BLUEPRINT.md` §2).
  Lower layers must not import higher ones.
- **File naming by layer:** PascalCase for components, lowercase for lib modules.
- **Comment policy:** none by default. Write a one-liner only when the *why* is
  non-obvious; never narrate the *what*.
- **Source-of-truth principle:** one file per concern, edited in place. Use git
  history to diff alternatives — never parallel `*.draft` / `*.new` copies.
- **Defensive boundaries:** sanitize at every point untrusted input enters
  (LLM output, network payloads, user input), even when the producer is
  "supposed to" emit clean data.
- **Coupled features are one feature in two files.** When changing one side
  (parser + emitter, message type + producer + consumer), change the other and
  cite both sides in both files.

---

## 9. Code reality — what exists today

> Updated 2026-06-13. Keep this section honest; it is the whole point of a
> code-reality doc.

### Repository layout (today)

```
AgentSpace/
├── CLAUDE.md                  # this operating manual + code reality
├── MEMORY.md                  # durable memory ledger (read first each session)
├── ROADMAP.md                 # milestones/phases/acceptance bars (M0…M6)
├── PRD.md                     # product surface: vision, audience, moats
├── BLUEPRINT.md               # architecture + data model + dependency rules
├── SPEC.md                    # contracts: message/run state machines, gateway
├── BACKLOG.md                 # deferrals + launch gates
├── .gitignore                 # root ignores (node_modules, dist, env, target…)
└── examples/
    └── chat-react-ts/         # SpacetimeDB chat reference app (scaffolded)
        ├── src/               # React + TypeScript client
        ├── spacetimedb/       # SpacetimeDB server module (TypeScript)
        ├── src/module_bindings/  # generated client bindings
        └── spacetime.json     # project / deploy config
```

**No product code exists yet.** The doc suite is authored and the plan is
ratified, but the application (the monorepo below) is not built — we are at the
start of M0. The planned structure (introduced in M0) is `apps/mobile`,
`services/orchestrator`, `packages/gateway`, `packages/shared`,
`modules/spacetime` — see `BLUEPRINT.md` §2 for the module graph and one-way
dependency rules.

### Toolchain (verified present in the dev container)

- **SpacetimeDB CLI** `2.5.0` (installed to `~/.local/bin/spacetime`; add
  `~/.local/bin` to `PATH`).
- **Node** v22, **npm** 10.9, **cargo** available, **curl** available.

### `examples/chat-react-ts` — SpacetimeDB reference app

Scaffolded via `spacetime init --template chat-react-ts`. It is a reference /
learning surface for the SpacetimeDB stack AgentSpace will build on, not yet
product code. Status: **client builds clean** (`npm run build`), dependencies
installed for both the client and the `spacetimedb/` server module.

Common commands (run from `examples/chat-react-ts/`):

| Command | What it does |
|---------|--------------|
| `spacetime start` | Start a local SpacetimeDB instance |
| `spacetime dev --template chat-react-ts` | Dev mode: auto build + publish + regenerate bindings on change |
| `npm run dev` | Vite client dev server |
| `npm run build` | Typecheck + production build of the client |
| `npm test` | Vitest (includes `App.integration.test.tsx`) |
| `npm run spacetime:publish:local` | Publish the module to a local server |
| `npm run spacetime:generate` | Regenerate TypeScript client bindings from the module |

The example ships its own scoped `CLAUDE.md` / `AGENTS.md` inside
`examples/chat-react-ts/` — those describe the template, not AgentSpace, and
are subordinate to this root manual.

---

## 10. What NOT to do — durable guardrails

- **Don't create empty vision docs** "to be organized." A doc is born when it
  has something to own (§1).
- **Don't skip the Memory Protocol** at session end. The next session starts
  blind otherwise (§3).
- **Don't edit past Decision Log / Session Journal entries.** Supersede, never
  rewrite — history is the value (§3.3).
- **Don't push to `main`** from an agent session (§6).
- **Don't auto-fix drift findings** without the founder routing them (§7).
- **Don't keep parallel `*.draft` copies** of source-of-truth files (§8).
- **Don't treat the example app as product code.** It is a reference surface
  until the roadmap says otherwise.
