# Spike — SpacetimeDB module + membership access control (Views)

**Date:** 2026-06-13 · **Milestone:** M0.3 · **Module:** `modules/spacetime`

**Question:** Can we model AgentSpace's realtime core in a TypeScript SpacetimeDB
module such that a user only sees threads/messages they belong to — using private
tables + per-user `ViewContext` Views (DEC-007) rather than the experimental RLS?

**Verdict: yes.** The module builds, publishes, and generates client bindings;
reducers enforce membership on writes; and per-user Views expose only the caller's
data. One negative-case check (a *non-member* sees nothing) needs a second live
identity → `VERIFICATION.md` V-2.

---

## What was built

`modules/spacetime/src/index.ts` — realtime-core schema only (agent/run/knowledge
deferred to M1+):
- **Private tables:** `thread`, `thread_member` (authz spine; indexes `by_thread`,
  `by_member`, `by_thread_member`), `message`. **Public:** `user` (profiles).
- **Reducers** (membership-checked via `ctx.sender`): `set_display_name`,
  `create_dm`, `create_group`, `add_member`, `send_message`, `leave_thread`.
- **Per-user `ViewContext` Views** (the read surface; computed from indexed
  membership lookups, no full scans): `my_threads`, `my_thread_messages`,
  `my_thread_members`.

The Views are emitted by `spacetime generate` as **client-subscribable tables**
(`bindings/my_threads_table.ts`, …) — clients subscribe to those, never to the
private tables.

## Verified on the AI side (local server)

`spacetime publish agentspace -p . --server local` + `spacetime generate` both
succeed; `tsc --noEmit` and `eslint` are green in CI (16/16). Then via the CLI
(`-s local`):

| Check | Result |
|---|---|
| `create_group "Test Group"` → `SELECT * FROM thread` | ✅ thread row (id 1, kind group) |
| → `SELECT * FROM thread_member` | ✅ membership row for the caller |
| `send_message 1 "…"` (caller **is** a member) → `SELECT * FROM message` | ✅ message row, `streamState=complete` |
| `send_message 999 "…"` (caller **not** a member) | ✅ **rejected:** `Not a member of this thread` |
| `SELECT * FROM my_threads` (computed for caller) | ✅ returns only the caller's thread |

So **write gating** (reducers) and the **positive read path** (Views return the
caller's own rows) are proven headlessly.

## Residual → `VERIFICATION.md` V-2

A single CLI identity can't prove the *negative* read case. V-2 (founder, via two
clients / the probe): a second identity that is **not** a member subscribes to
`my_threads` / `my_thread_messages` and sees **none** of the first user's
threads/messages.

## Decisions / notes

- TypeScript module confirmed practical (DEC-007): `spacetime build` succeeds; the
  `verbatimModuleSyntax`-override warning is benign (the builder strips type
  imports its own way).
- Generated `bindings/` are committed for the app/orchestrator to consume; they're
  excluded from the module's `tsc`/`eslint` (generated code).
- `insert()` returns the inserted row (autoInc `id` populated) — used for
  thread→membership wiring. `Identity.isEqual` used for self-DM guard.
