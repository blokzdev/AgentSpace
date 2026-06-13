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

## 4. Plan / execute / review separation — the autonomous build loop

Work proceeds in **chunks** (a phase or a coherent slice of one). Each chunk runs
the same loop:

1. **Plan** — present a write-plan **in Plan Mode** for the chunk; the founder
   ratifies (or redlines) before any code.
2. **Execute** — on approval, build autonomously: code + tests + docs, narrated
   tersely. Surface only decisions that genuinely need founder input, and **mark a
   recommended option** when you do.
3. **Review** — open a PR. **Auto-merge + auto-delete-branch are enabled**, so the
   AI watches CI and **fixes failures until green**; the PR then merges itself
   (§6). On merge, return to step 1 (Plan Mode) for the next chunk.

The founder has granted autonomy: proceed through the loop without waiting for
per-step nods, pausing only for the Plan-Mode ratification and for surfaced
decisions. Test everything testable on the AI side at every checkpoint; **assume
things are fine and keep moving unless the founder reports a problem** (e.g. an
on-device issue from `VERIFICATION.md`).

**Plan-overhead threshold.** A full write-plan is expected per chunk under this
loop. Truly trivial fixes (typo, one-liner) may skip the ceremony and go straight
to a PR.

**Five-field write-plan template** (restate in this order):

1. **Acceptance bar** — paraphrased from ROADMAP, reviewer-holdable.
2. **Tasks** — ≤1-hour units where possible.
3. **Files touched** — every path created/edited/deleted.
4. **Verification checklist** — concrete machine checks (lint, typecheck,
   build, tests).
5. **Out of scope** — what we are NOT doing, even if tempting.

**Human / on-device verification → `VERIFICATION.md`.** Anything code can't check
(on-device behavior, real-world flows, native quirks) is **batched into the
founder-owned `VERIFICATION.md`** as a numbered item (`V-1`, `V-2`, …) with exact
run steps and pass/fail criteria. The AI **never self-ticks** these and **never
blocks the loop** on them — it records the item, assumes green, and continues.
The founder works through `VERIFICATION.md` independently and raises any failure;
only the founder marks an item done.

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
- **Branch hygiene:** one branch **per chunk**, cut off the latest `main`; never
  push to `main` directly.
- **Auto-merge + auto-delete-branch are enabled** on the repo. Open the PR as
  ready-for-review; CI is the gate. The AI watches CI and **fixes until green**;
  the PR then auto-merges and the branch is deleted. The AI does not poll for
  merges — it proceeds to plan the next chunk, and a CI-failure webhook will
  interrupt if a fix is needed.
- The active branch is recorded in `MEMORY.md`'s Snapshot.

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
├── CLAUDE.md · MEMORY.md · ROADMAP.md · PRD.md       # operating + vision docs
│   · BLUEPRINT.md · SPEC.md · BACKLOG.md · README.md
├── package.json · pnpm-workspace.yaml · turbo.json   # monorepo root tooling
│   · tsconfig.base.json · eslint.config.mjs · .nvmrc · .npmrc · VERIFICATION.md
├── .github/workflows/ci.yml   # CI: lint · typecheck · build · test
├── .audit/                    # committed spike / drift-sweep artifacts
├── apps/
│   └── mobile/                # Expo (RN) connectivity probe — M0.2b
│       · module_bindings/     # vendored from the example (temporary, M0.3 swap)
├── packages/
│   ├── shared/                # typed contracts (lowest layer) — built
│   └── gateway/               # Model Gateway interface + stub (M1.4 fills in)
├── services/
│   └── orchestrator/          # Agent Orchestrator skeleton
└── examples/
    └── chat-react-ts/         # SpacetimeDB chat reference app (not product code)
```

**Status (M0 in progress).** Monorepo + CI exist and are green (M0.1). `gateway`
is a stub, `orchestrator` wires the graph but does no real work yet. `apps/mobile`
(M0.2b) is the Expo **connectivity probe**: it typechecks, lints, and **bundles
for Android via Metro** (`npx expo export -p android` → ~1.9 MB Hermes bundle,
561 modules) — strong evidence the SpacetimeDB TS client works under RN; the
runtime connect is the on-device check `V-1` in `VERIFICATION.md`. **Not yet
created:** `modules/spacetime` (M0.3). See `BLUEPRINT.md` §2 for the module graph.

**pnpm uses `node-linker=hoisted`** (`.npmrc`) — required so Metro (Expo/RN) can
resolve transitive deps under the workspace; Metro also needs
`unstable_enablePackageExports` (set in `apps/mobile/metro.config.js`) to resolve
the SDK's `spacetimedb/react` subpath.

Workspace commands (from repo root): `pnpm install`, then `pnpm run ci`
(= lint · typecheck · build · test), or `pnpm run {lint,typecheck,build,test}`.
Mobile: `pnpm --filter @agentspace/mobile {start,android,export:android}`.

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
