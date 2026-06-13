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
| `SETUP.md` | Founder-owned action items: external setup only the human can do (register apps, dashboards, accounts, credentials) | Living / `S-n` ledger | The build needs a founder-side external action or a credential/ID handed back |
| `VERIFICATION.md` | Founder-owned on-device / real-world checklist (`V-n`): what CI can't check | Living / `V-n` ledger | Batching a human/on-device verification the AI can't self-run |

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

**Founder-side external setup → `SETUP.md`.** Anything the AI needs the *human* to
do outside the codebase — register a third-party app, enable a dashboard, create
an account, hand back a credential/ID/secret — is **batched into the founder-owned
`SETUP.md`** as a numbered item (`S-1`, `S-2`, …) with exact click-by-click steps,
where it's done (web vs terminal), and a **"give back to the AI"** line naming the
value needed. The AI **builds around open items** (env placeholders, feature inert
until wired) and **never blocks the loop** on one; it **never marks an item done**.
The founder does the action, reports the value, and only the founder ticks it.
Secrets/keys go in a local untracked `.env`, never a committed file — the AI names
the variable. (This is the setup-side twin of `VERIFICATION.md`.)

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
- **`main` is branch-protected (CI required); auto-delete-branch is on.** The AI
  opens the PR ready-for-review, watches CI, and **fixes until green** — then
  **merges the PR itself via the GitHub API** (squash) and the branch is deleted
  (founder decision: repo-level "allow auto-merge" only *permits* it and isn't
  enabled per-PR, so the AI drives the merge). A CI-failure webhook interrupts if
  a fix is needed; otherwise the AI merges on green and proceeds to the next chunk.
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
│   · VERIFICATION.md · SETUP.md                       # founder-owned ledgers (V-n / S-n)
├── package.json · pnpm-workspace.yaml · turbo.json   # monorepo root tooling
│   · tsconfig.base.json · eslint.config.mjs · .nvmrc · .npmrc
├── .github/workflows/ci.yml   # CI: lint · typecheck · build · test
├── .audit/                    # committed spike / drift-sweep artifacts
├── apps/
│   └── mobile/                # Expo (RN) chat app — M1.1; SpacetimeAuth login M1.2
│       · App.tsx · src/auth.ts · src/screens/{Login,ThreadList,Thread}.tsx
│       · module_bindings/     # generated from modules/spacetime
├── packages/
│   ├── shared/                # typed contracts (lowest layer) — built
│   ├── gateway/               # Model Gateway — AI SDK adapters + BYOK (M1.4)
│   │   · src/{index,providers,credentials}.ts · scripts/smoke.ts
│   └── stdb-bindings/         # generated SDK bindings, consumed as source (BL-009)
├── services/
│   └── orchestrator/          # Agent Orchestrator — gateway→STDB reply loop (M1.6)
│       · src/{index,replyLoop,prompt,spacetime}.ts · scripts/integration.ts
├── modules/
│   └── spacetime/             # AgentSpace SpacetimeDB module (M0.3; +run/streaming M1.6)
│       · src/index.ts · bindings/ (generated, committed)
└── examples/
    └── chat-react-ts/         # SpacetimeDB chat reference app (not product code)
```

**Status (M0 closed; in M1).** Monorepo + CI green (16/16). `modules/spacetime`
(M0.3) is the realtime-core module — reducers gate writes, per-user **Views** gate
reads (`.audit/spike-stdb-access-control-…`; negative case `V-2`).
`services/orchestrator` (M0.4) connects as a stable identity, subscribes to
`my_thread_messages`, and replies via a reducer — proven end-to-end (echo) by
`pnpm --filter @agentspace/orchestrator integration`. **M1.1:** `apps/mobile` is
a **realtime chat MVP** on the `agentspace` module (thread list + thread view
+ composer + presence; `ThreadList`/`Thread` screens). **M1.2:** it now does real
**SpacetimeAuth (OIDC) login** — `src/auth.ts` runs authorization-code + PKCE via
`expo-auth-session` against issuer `https://auth.spacetimedb.com/oidc`, persists the
refresh token in SecureStore, and passes the resulting id token to
`DbConnection.withToken()`; `App.tsx` gates the `SpacetimeDBProvider` behind a
`Login` screen, replacing the anonymous token with a stable per-user `Identity`.
Typechecks, lints, and **bundles clean for Android** (Metro, 606 modules, 2.0 MB
Hermes). The flow is inert until the founder supplies `EXPO_PUBLIC_SPACETIMEAUTH_CLIENT_ID`
(`SETUP.md` S-1) and must target Maincloud `agentspace-hpm58` (which trusts the
issuer); the on-device round-trip is `V-5`. **app.json carries `scheme: "agentspace"`
and no `plugins` array** — listing `expo-web-browser`/`expo-secure-store` as config
plugins makes `expo export` `require` `expo-modules-core`'s TS source and crashes on
Node ≥22.18 type-stripping; both modules autolink without a plugin entry. The
orchestrator keeps its persisted-token identity (a real service account is `OT-007`).
**M1.4:** the **Model Gateway** is real — `packages/gateway` implements
`createModelGateway({ resolveCredential, providers? })` with **streaming +
tool-calling** on the **Vercel AI SDK v6** over a provider registry (`anthropic` +
`openai` live; `google`/`openai-compatible` registered-but-inert), normalizing
`streamText().fullStream` to a `GatewayDelta` union. **BYOK:** `src/credentials.ts`
seals provider keys with **AES-256-GCM** under an env KEK (`AGENTSPACE_GATEWAY_KEK`)
and resolves a request's `credentialRef` via an injected `CredentialResolver`
(in-memory store v1; Postgres/KMS deferred — OT-005). `embed` is deferred to M3.1.
16 gateway tests cover the BYOK crypto + stream normalization (AI SDK
`MockLanguageModelV3`); a real provider round-trip is the founder smoke (`V-6`, key
via `SETUP.md` S-4). **M1.6:** the orchestrator now **streams real agent replies
into STDB**. `modules/spacetime` gained a private **`run`** table + `message.runId`
+ three reducers — `agent_reply_begin`/`agent_reply_append`/`agent_reply_finish`
(write a `streaming` message row that flips to `complete`/`failed`, keyed by a
client-owned `runId`; each re-checks the sender is the `agent` member). The
orchestrator's `replyLoop.ts` reacts to a human's `complete` message in a thread it's
an `agent` member of, builds the prompt (`prompt.ts`: `buildPrompt`/`newRunId`/a
~50ms coalescing `createBatcher`), calls `gateway.stream`, and flushes batched
`agent_reply_append` UPDATEs, then `agent_reply_finish` with token usage. Mobile
renders a streaming cursor (`▍`) on `streaming` rows — partial text already arrives
live via `useTable`. Proven **headlessly end-to-end** by the rewritten
`scripts/integration.ts` (a **mock gateway** streams a reply through a real local
STDB; asserts `streaming`→`complete` + live UPDATEs) — no key needed; a real LLM
reply on-device is `V-7`. The publish script uses `spacetime publish agentspace -p .`
(`--project-path` was wrong for CLI 2.5.0). See `BLUEPRINT.md` §2 for the module graph.

**pnpm uses `node-linker=hoisted`** (`.npmrc`) — required so Metro (Expo/RN) can
resolve transitive deps under the workspace; Metro also needs
`unstable_enablePackageExports` (set in `apps/mobile/metro.config.js`) to resolve
the SDK's `spacetimedb/react` subpath. Side-effect: generated SpacetimeDB bindings
can't emit a clean `.d.ts` (TS2742), so `packages/stdb-bindings` is consumed as
source and it + `services/orchestrator` relax a few strict flags (BL-009); the
other packages stay fully strict.

Workspace commands (from repo root): `pnpm install`, then `pnpm run ci`
(= lint · typecheck · build · test), or `pnpm run {lint,typecheck,build,test}`.
Mobile: `pnpm --filter @agentspace/mobile {start,android,export:android}`.
Module (needs local `spacetime` CLI; not in CI): `pnpm --filter
@agentspace/spacetime-module {spacetime:build,spacetime:publish:local,spacetime:generate}`.
Orchestrator (needs a running local server + published module): `pnpm --filter
@agentspace/orchestrator {start,integration}` (run via `tsx`). Gateway smoke (needs
a real provider key in env, e.g. `ANTHROPIC_API_KEY`; not in CI): `pnpm --filter
@agentspace/gateway smoke`.

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
