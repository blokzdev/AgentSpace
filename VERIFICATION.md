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

---

### V-2 — SpacetimeDB Views hide non-members' data  ·  added 2026-06-13 · M0.3
- **Why:** completes the access-control spike. AI-side checks proved write-gating
  (reducers reject non-members) and the *positive* read path (a member's
  `my_threads` returns their thread). This is the *negative* case, which needs a
  second live identity (`.audit/spike-stdb-access-control-2026-06-13.md`).
- **Setup:** `spacetime start`; from `modules/spacetime`:
  `spacetime publish agentspace -p . --server local --yes`. Have **two** distinct
  identities (e.g. two devices/emulators, or `spacetime logout` + reconnect for a
  fresh anonymous identity).
- **Steps:**
  1. As **identity A**: `spacetime call -s local agentspace create_group '"A's room"'`
     and `send_message` into it.
  2. As **identity B** (not a member): subscribe to the Views, e.g.
     `spacetime subscribe -s local agentspace "SELECT * FROM my_threads" "SELECT * FROM my_thread_messages" --num-updates 1`.
- **Pass when:** identity B's subscription to `my_threads` / `my_thread_messages`
  returns **none** of A's threads/messages (B sees only rooms B belongs to). A
  member of the room *does* see them.
- **If it fails (B sees A's rows):** the Views aren't scoping by `ctx.sender` as
  expected — revisit the view definitions / consider RLS. Tell me.
- **Notes (founder):** _result →_

---

### V-4 — Mobile realtime chat (human↔human)  ·  added 2026-06-13 · M1.1
- **Why:** the mobile chat MVP renders + behaves correctly on a device (the UI is
  the only part CI can't check; it typechecks, lints, and **bundles clean for
  Android**). Exercises threads, messages, presence on our `agentspace` module.
- **Setup:** `spacetime start`; from `modules/spacetime`:
  `spacetime publish agentspace -p . --server local --yes`. Build/run the app on
  **two** Android emulators/devices (`pnpm --filter @agentspace/mobile android`),
  each pointed at the server: `EXPO_PUBLIC_SPACETIMEDB_HOST=ws://<host-ip>:3000`
  (emulator default `ws://10.0.2.2:3000`).
- **Steps:**
  1. On both: app shows "Connecting…" then the thread list; each shows **its own
     identity hex** at the top. Set a display name on each.
  2. On **A**: create a group; open it; copy **B**'s identity hex into "Add member
     by identity hex" → Add.
  3. Both open the thread; send messages back and forth.
- **Pass when:** the thread appears on **B** after being added; messages from each
  appear on the other **in real time** with sender names + times; a sender's
  display-name change and online/offline presence reflect across devices.
- **If it fails:** capture the red-box / logcat and tell me. The data layer
  (reducers + Views) is already proven headlessly (M0.3/M0.4), so failures are
  most likely UI/subscription wiring.
- **Notes (founder):** _devices + OS + result →_

---

### V-5 — SpacetimeAuth (OIDC) login on-device  ·  added 2026-06-13 · M1.2
- **Why:** the login redirect round-trip is the only part of M1.2 CI can't check
  (the hook typechecks, lints, and **bundles clean for Android**). Proves real
  per-user identity: sign in → id token → `withToken` → stable `Identity` that
  **survives a restart** (refresh-token path) and a real account, not the anonymous
  token. Depends on **`SETUP.md` S-1…S-3**.
- **Setup:**
  1. Complete `SETUP.md` **S-1** (client_id), **S-2** (redirect `agentspace://redirect`),
     **S-3** (publish `agentspace` to Maincloud).
  2. Create `apps/mobile/.env.local` with:
     `EXPO_PUBLIC_SPACETIMEAUTH_CLIENT_ID=<from S-1>`,
     `EXPO_PUBLIC_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com`,
     `EXPO_PUBLIC_SPACETIMEDB_DB_NAME=agentspace-hpm58`.
  3. Build a **real dev build** — `pnpm --filter @agentspace/mobile android`
     (`expo run:android`) or an EAS dev build. **Expo Go won't work**: the custom
     `agentspace://` scheme only resolves in a standalone/dev-client build.
- **Steps:**
  1. Launch the app → it shows the **Login** screen ("Sign in with SpacetimeAuth").
  2. Tap **Sign in** → a browser/web-view opens the SpacetimeAuth flow → sign in /
     authorize → you're redirected **back into the app**.
  3. Land on the thread list; note the **identity hex** at the top.
  4. **Fully close and reopen** the app (kill it, don't just background).
  5. Tap **Sign out** → confirm you return to the Login screen.
- **Pass when:**
  - After sign-in you reach the chat UI authenticated; chat works against Maincloud.
  - After the restart you're **still signed in** with the **same identity hex** (no
    re-login prompt) — the refresh-token restore worked.
  - Sign out returns to Login; signing in again works.
- **If it fails:** capture the error. Common causes: redirect URI mismatch (S-2
  must be exactly `agentspace://redirect`), wrong/empty client_id (button disabled =
  env not set), or pointing at a local server instead of Maincloud (token rejected —
  the issuer is only trusted on Maincloud). Tell me which.
- **Notes (founder):** _device + OS + result →_

---

### V-6 — Model Gateway live provider round-trip  ·  added 2026-06-13 · M1.4
- **Why:** CI proves the gateway's wiring and BYOK crypto **headlessly** (mock
  model, 16 tests), but a real provider stream can only run with an actual API key.
  This confirms `createModelGateway` streams text + reports token usage end-to-end
  against a live provider. Depends on **`SETUP.md` S-4**.
- **Setup:** set a real key in env/`.env` — `ANTHROPIC_API_KEY=sk-ant-…` (default
  model is `claude-opus-4-8`; or `OPENAI_API_KEY=…` and adjust the model). Run from
  the repo root.
- **Steps:**
  1. `pnpm install` (if not already).
  2. `pnpm --filter @agentspace/gateway smoke`.
- **Pass when:** the command streams a one-sentence reply to stdout and prints a
  `usage:` line with non-zero `inputTokens`/`outputTokens` — no error.
- **If it fails:** `No API key in env (...)` → the var isn't set/exported;
  `401/authentication` → bad key; a model-id error → the key's provider doesn't
  serve `claude-opus-4-8` (use that provider's model, or set `ANTHROPIC_API_KEY`).
  Tell me which.
- **Notes (founder):** _provider + result →_

---

### V-7 — Live agent reply streams into a chat on-device  ·  added 2026-06-13 · M1.6
- **Why:** the reply loop is proven headlessly with a **mock** gateway (local STDB
  integration); this exercises it with a **real LLM** end-to-end — a human message
  produces a token-by-token agent reply rendered live in the mobile thread. Depends
  on **`SETUP.md` S-4** (a provider key) and a published module + a running orchestrator.
- **Setup:**
  1. Publish the module to your target server (local: `pnpm --filter
     @agentspace/spacetime-module spacetime:publish:local` with `spacetime start`; or
     Maincloud per S-3).
  2. Run the orchestrator against that server with a key:
     `ANTHROPIC_API_KEY=sk-ant-… AGENTSPACE_STDB_HOST=ws://<host>:3000
     AGENTSPACE_STDB_DB=<db> pnpm --filter @agentspace/orchestrator start`. Note the
     printed **orchestrator identity** hex.
  3. In the mobile app (V-4 setup), create a thread, paste the orchestrator’s
     identity hex into the add-member field, **toggle the role chip to `🤖 Agent`**,
     and tap **Add**. *(Authoring named agents is M1.5; for V-7 the orchestrator
     identity is the stand-in agent.)*
- **Steps:** send a message in that thread.
- **Pass when:** an agent reply appears as a **streaming** bubble (cursor `▍`) whose
  text **grows token-by-token**, then settles to a final (`complete`) reply — no
  dangling streaming bubble, no error.
- **If it fails:** no reply at all → the orchestrator isn’t an `agent` member of the
  thread, or its key/host is wrong (check its logs); a reply that never completes →
  a gateway/provider error (the loop marks it `failed`). Capture the orchestrator
  logs and tell me.
- **Notes (founder):** _host (local/Maincloud) + provider + result →_

---

### V-8 — Author a persona and chat with it on-device (Agent Studio)  ·  added 2026-06-13 · M1.5
- **Why:** proves the full **build-an-agent → converse** loop on a device: create a
  persona in the app, deploy it, and confirm the orchestrator replies **as that
  persona** (its system prompt + model). The data path + persona injection are proven
  headlessly (integration); this is the on-device UX + a real model. Depends on a
  running orchestrator (as V-7) + a provider key (`SETUP.md` S-4).
- **Setup:** same as V-7 (publish the module; run the orchestrator with a key against
  the same server). The orchestrator registers itself as the agent service on startup.
- **Steps:**
  1. In the app, tap **🤖 Agents** (thread list header) → **+ New**.
  2. Create an agent with a distinctive persona — e.g. name "Pirate Pete", system
     prompt "You are Pirate Pete. Reply only in pirate speak.", provider **anthropic**,
     model `claude-opus-4-8`. Save.
  3. On the agent's card, tap **Chat** (opens a DM titled `🤖 Pirate Pete`).
  4. Send a message.
- **Pass when:** the reply **streams in live** (cursor) and reflects the persona (e.g.
  pirate speak) — i.e. the system prompt took effect, not the generic default. Editing
  the agent (**Edit**) and chatting again reflects the change.
- **If it fails:** no reply → orchestrator not running / not registered as the service
  (it must start *before* you deploy, or re-deploy after); reply ignores the persona →
  tell me (the binding/View didn’t resolve); a model error → the persona’s provider
  key isn’t set (S-4). Capture orchestrator logs.
- **Notes (founder):** _persona + provider + result →_
