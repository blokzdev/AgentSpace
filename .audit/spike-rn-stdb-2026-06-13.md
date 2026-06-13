# Spike — React Native ↔ SpacetimeDB TypeScript client compatibility

**Date:** 2026-06-13 · **Milestone:** M0.2 · **Risk:** OT-003 `[critical]`
**Question:** Can the `spacetimedb` TypeScript client SDK (v2.5.0) run in a React
Native / Expo (Hermes) app, given it officially documents only browser + Node?

**Verdict: GO — compatible with two standard polyfills.** No architectural
fallback (WS/REST bridge) is needed. One verification remains that requires
hardware: an actual on-device connect + subscribe + reducer call (a human
`[gate]`, since this container has no Android device/emulator).

---

## What was checked

Static analysis of the installed package
`examples/chat-react-ts/node_modules/spacetimedb@2.5.0` (`dist/` + `src/`), the
runtime surface that would load under Hermes/Metro.

| Concern | Finding | RN status |
|---|---|---|
| Node builtins (`node:*`, `ws`, `crypto`, `stream`, `fs`, `net`, `tls`, `buffer`) | **none imported** | ✅ no Node dependency to shim |
| WebSocket | uses global `WebSocket` (46 call sites; "global WebSocket" refs) | ✅ RN core provides global `WebSocket` (incl. `binaryType:'arraybuffer'`) |
| HTTP | global `fetch` (20 sites) | ✅ RN provides `fetch` |
| `Buffer` | **not used** (relies on `base64-js`) | ✅ no Buffer polyfill needed |
| Randomness | `pure-rand` (pure JS) + 2× `crypto.getRandomValues` | ⚠️ needs `react-native-get-random-values` |
| `TextEncoder` / `TextDecoder` | heavily used (73 / 59 sites) | ⚠️ polyfill defensively (Hermes/Expo coverage varies by version) |
| `URL` / `Headers` | SDK bundles `url-polyfill` / `headers-polyfill` | ✅ self-contained |
| `process.env` / `process.*` | **not used** | ✅ no `process` shim needed |

Package deps confirm the picture: `base64-js`, `headers-polyfill`,
`url-polyfill`, `pure-rand`, `safe-stable-stringify`, `statuses`,
`object-inspect`, `prettier` — all pure-JS / web-polyfill, **zero Node-only**.

---

## Required polyfills (import order matters)

Load these **before** any `spacetimedb` import, at the app entry (`index.ts`):

1. `import 'react-native-get-random-values';` — provides `crypto.getRandomValues`
   (used by identity/connection token handling). Mandatory.
2. `TextEncoder`/`TextDecoder` — include defensively (e.g. `text-encoding` or
   `@bacons/text-decoder`) and drop it later if the target Expo SDK's Hermes
   already provides both. Verify on-device.

No Metro `resolver.extraNodeModules` shims for Node builtins are expected (none
are imported). Standard Expo-monorepo Metro config (watchFolders +
`nodeModulesPaths`) is still required because of pnpm's symlinked store.

---

## Residual risk → on-device `[gate]`

Static analysis clears the *resolution/bundling* risk; it cannot prove the
*runtime* path. The founder (or a device/emulator) must confirm:

- `[gate]` On a real Android device/emulator: the probe screen connects
  (`isActive` true), receives a subscription snapshot, and a reducer call
  round-trips — i.e. RN's binary WebSocket frames interoperate with the STDB v3
  protocol. *(Record device + OS + Expo SDK in the note.)*

If a runtime gap appears, the fallbacks (in priority order) are: (a) add/adjust a
polyfill; (b) a thin orchestrator-hosted WebSocket/REST bridge the app talks to;
(c) escalate to a native client transport. (a) is by far the most likely.

---

## Routing

- **DEC-012** (MEMORY) records the GO decision; **OT-003** stays open but
  downgraded to "runtime gate pending" until the on-device check passes.
- Next (M0.2b): scaffold `apps/mobile` (Expo) with the two polyfills + a
  connectivity-probe screen, wired to a published module, for the founder to run
  the `[gate]`.
