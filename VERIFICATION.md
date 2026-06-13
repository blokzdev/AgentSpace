# VERIFICATION.md — Human / on-device checklist (founder-owned)

> Things automated CI can't check — on-device behavior, real-world flows, native
> quirks — are batched here. **The founder owns this file.** The AI appends items
> (with exact steps + pass/fail criteria), assumes green, and keeps building; it
> never self-ticks an item or blocks the loop on one. The founder runs them when
> convenient and raises any failure. (Governed by `CLAUDE.md` §4.)

**Status legend:** `[ ]` open · `[x]` verified (founder) · `[!]` failed (see notes).
**Per-item template:**

```
### V-N — <title>  ·  added <date> · <milestone>
Why: <what this proves / which risk (OT-xxx)>
Setup: <prereqs>
Steps: <numbered>
Pass when: <observable criteria>
Notes: <founder fills: device + OS + result>
```

---

### V-1 — RN ↔ SpacetimeDB on-device connectivity  ·  added 2026-06-13 · M0.2b
- **Why:** closes the runtime half of **OT-003** — the SpacetimeDB TS client must
  actually connect + subscribe + call a reducer from React Native on a device.
  (Static analysis + a clean Android Metro bundle already passed on the AI side;
  this is the live run.)
- **Setup (on your machine):**
  1. Start a local SpacetimeDB server: `spacetime start` (listens on `:3000`).
  2. Publish the example chat module under the probe's name:
     `spacetime publish agentspace-probe --project-path examples/chat-react-ts/spacetimedb --server local --yes`
  3. From `apps/mobile`, point the probe at your machine if needed (the default
     `ws://10.0.2.2:3000` is the Android emulator's alias for host localhost; for
     a physical device use your LAN IP):
     `EXPO_PUBLIC_SPACETIMEDB_HOST=ws://<host-ip>:3000`
- **Steps:**
  1. `pnpm install` at the repo root (uses `node-linker=hoisted`).
  2. `pnpm --filter @agentspace/mobile android` (Expo dev build / Expo Go on an
     Android emulator or device).
  3. Open the app — the **probe screen** shows Host, Database, Status, Identity,
     and live subscribed Users/Messages counts.
  4. Tap **"Send test message (reducer)"** a few times.
- **Pass when:**
  - **Status** flips to `connected` and an **Identity** hex appears.
  - **Users/Messages** counts populate from the subscription (≥ 0, and Messages
    increases after sends).
  - **Reducer calls sent** increments and Messages reflects the new rows in real
    time (no error toast / red screen).
- **If it fails:** capture the red-box / logcat error and tell me. Likely fixes
  (in order): a missing/extra polyfill, the `unstable_conditionNames` Metro
  setting, or (worst case) a thin WS bridge — see `.audit/spike-rn-stdb-2026-06-13.md`.
- **Notes (founder):** _device + OS + Expo SDK + result →_
