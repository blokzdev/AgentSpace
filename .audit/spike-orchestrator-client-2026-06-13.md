# Spike — Orchestrator as a trusted SpacetimeDB client

**Date:** 2026-06-13 · **Milestone:** M0.4 · **Risk:** orchestrator↔STDB protocol
(BLUEPRINT §4, SPEC §6)

**Question:** Can a Node/TS service connect to SpacetimeDB as a stable identity,
subscribe to new messages, and write a reply via a reducer — the loop agent
replies will use?

**Verdict: yes — verified end-to-end on the AI side.** No device/human gate.

---

## What was built

- `packages/stdb-bindings` — AgentSpace module bindings (generated), consumed as
  source (see "Bindings packaging" below).
- `services/orchestrator/src/spacetime.ts` — `connectOrchestrator()`: vanilla
  `DbConnection.builder()…build()`, auth via a **persisted token** (cached in a
  tmp file on first `onConnect`) so the service keeps a **stable `Identity`**.
- `services/orchestrator/src/replyLoop.ts` — subscribes to the membership-scoped
  `my_thread_messages` View; on each new message not from itself and not already
  an echo, calls `send_message` with an `(orchestrator echo) …` reply.
- `services/orchestrator/scripts/integration.ts` — local end-to-end harness.

## Verified (local server, module `agentspace` published)

`pnpm --filter @agentspace/orchestrator integration` →

```
orchestrator identity: c2006f3f…e4ad
[orchestrator] subscribed to my_thread_messages
user identity:         c200f4f0…ccc9
✅ orchestrator echoed: "(orchestrator echo) hello orchestrator"
```

A **user identity** created a group, `add_member`'d the **orchestrator identity**,
and posted a message; the orchestrator (a separate connection) received it through
its own membership-scoped View and wrote a reply via a reducer, which the user
then observed. This exercises: stable service identity, membership-scoped
subscription, cross-identity reactivity, and reducer-authorized writes — the exact
shape of an agent reply (the literal echo stands in for the M1.4 LLM call).

The run needs a live SpacetimeDB server, so it is **local-only, not CI** (CI still
typechecks/builds/tests all the code). Root `pnpm run ci` is green (16/16) with
the orchestrator under the **full strict** tsconfig.

## API notes (for future work)

- `conn.db.<name>` uses the **raw snake_case** table/view name
  (`conn.db.my_thread_messages`); `conn.reducers.<name>` is **camelCase**
  (`conn.reducers.sendMessage`). Asymmetric — the compiler is the source of truth.
- `DbConnection.builder().withUri().withDatabaseName().withToken().onConnect((conn,
  identity, token) => …).onConnectError((ctx, err) => …).build()`.
- Subscriptions accept raw SQL: `.subscribe(['SELECT * FROM my_thread_messages'])`.
- `insert()` returns the row; `Identity.isEqual()` compares.

## Bindings packaging (tech debt → BACKLOG BL-009)

A clean built `.d.ts` boundary for the generated bindings is **not achievable**
under `node-linker=hoisted`: declaration emit hits **TS2742** ("inferred type …
cannot be named without a reference to …/node_modules/spacetimedb/…") because the
hoisted SDK path is non-portable. `--noCheck` (TS 5.6) does **not** suppress it
(it skips emitting `index.d.ts` and still exits 1); `tsup --dts` and
`preserveSymlinks` don't help (the latter degrades types to `any`). The only clean
fix is a type annotation, which we can't add to generated code.

**Resolution:** consume the bindings **as source**; the leniency
(`noUnusedLocals`/`verbatimModuleSyntax`/etc. off) is confined to the generated
`stdb-bindings` package and the thin `orchestrator` service. The strict packages
(`shared`, `gateway`, `modules/spacetime`) are unaffected. Revisit (BL-009) via an
isolated-linker + Metro-symlinks setup, a codegen post-process, or upstream
codegen annotations.
