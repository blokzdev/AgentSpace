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

### V-1 — RN ↔ SpacetimeDB on-device connectivity  ·  added 2026-06-13 · M0.2b  ·  ~~SUPERSEDED by V-4~~
- **Status:** **superseded.** V-1 verified the retired M0.2b *connectivity probe*
  (the "probe screen" was replaced by the M1.1 chat MVP and no longer exists). The
  RN↔STDB runtime path (OT-003) is now covered live by **V-4** (the real chat connect
  + send/receive). Skip V-1; run **V-4** instead. *(Kept for history.)*

---

### V-2 — SpacetimeDB Views hide non-members' data  ·  added 2026-06-13 · M0.3  ·  ✅ DONE (AI, 2026-06-23)
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
- **🤖 AI evidence (2026-06-23 — AI-completed locally):** automated headlessly via a new reusable script
  `services/orchestrator/scripts/verify-views.ts` (`pnpm --filter @agentspace/orchestrator verify:views`)
  against a local `spacetime start` + the freshly-published `agentspace` module. **Two distinct anonymous
  identities** — A (`c2003b46…`) created a private group + posted a message and saw both (positive control);
  B (`c200fb36…`, a member of nothing) subscribed to the **same** `my_threads` / `my_thread_messages` views
  and saw **0 threads / 0 messages** — none of A's data. Proves the per-user Views scope by `ctx.sender` (the
  negative case CI couldn't cover).
- **Notes (founder):** ✅ **AI-COMPLETED 2026-06-23** (at the founder's "complete what you can locally"
  request) — non-member isolation verified headlessly with two identities; fully server-side, nothing
  on-device. Countersign if you wish.

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
- **AI evidence (2026-06-22, propose PASS — founder confirms):** Pixel_8 emulator (Android,
  dev build via `expo run:android`, JDK = Android Studio JBR 21), targeting Maincloud
  `agentspace-hpm58`. Sign-in via SpacetimeAuth's **Anonymous login** + Authorize reached the
  chat UI; JS logged `connected as c2000848e4d1…` (a stable per-user Identity). Required two
  fixes: the redirect scheme is now reverse-DNS `com.agentspace.probe://redirect` (DEC-029) and
  the founder re-registered exactly that on the SpacetimeAuth client (removing `agentspace://`).
  **Caveat:** *anonymous* login does not persist across a cold app restart (no usable refresh
  token) — the cross-restart "still signed in" check (a real email login) is still founder-owned.
- **Notes (founder):** ✅ **VERIFIED 2026-06-22** (founder-authorized on the captured evidence) —
  Pixel_8 emulator (Android dev build) vs Maincloud `agentspace-hpm58`; SpacetimeAuth login →
  stable per-user Identity → chat UI. *(Cross-restart persistence via a real email login is a
  nice-to-have; anonymous login doesn't persist — non-blocking.)*

---

### V-6 — Model Gateway live provider round-trip  ·  added 2026-06-13 · M1.4  ·  ✅ DONE (AI, 2026-06-23)
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
- **🤖 AI evidence (2026-06-23 — AI-completed locally, founder-authorized):** ran the gateway against a
  **live Anthropic** provider using the founder's key (sourced from gitignored `services/orchestrator/.env`,
  `ANTHROPIC_BASE_URL` cleared per the harness gotcha — never printed/committed). `claude-opus-4-8` (the smoke
  default) returned a transient **`Overloaded`** (529) on all three retries — a provider-side blip, not our
  code — so a one-off on the **same** `createModelGateway` path with **`claude-haiku-4-5-20251001`** completed
  it: streamed *"Hello! How can I help you today?"* with `usage {inputTokens:16, outputTokens:12}`. Proves the
  gateway streams text + reports token usage end-to-end with a real BYOK key (the model is incidental to what
  V-6 checks). The hardcoded-Opus `pnpm --filter @agentspace/gateway smoke` will pass cleanly once Opus isn't
  overloaded.
- **Notes (founder):** ✅ **AI-COMPLETED 2026-06-23** (at the founder's "complete + tick what you can"
  request) — live gateway round-trip verified end-to-end. Nothing on-device about this one; countersign if you wish.

---

### V-7 — Live agent reply streams into a chat on-device  ·  added 2026-06-13 · M1.6 · M1.7
> **Now the real BYOK path:** enter your provider key in the app (**🔑 Keys**, M1.7) —
> the orchestrator decrypts *your* key to reply. No `.env` needed (that's smoke-only).
> Setup step: tap **🔑 Keys** → paste your `ANTHROPIC` key → Save (the orchestrator must
> be running so its public key is published).
- **Why:** the reply loop is proven headlessly with a **mock** gateway (local STDB
  integration); this exercises it with a **real LLM** end-to-end — a human message
  produces a token-by-token agent reply rendered live in the mobile thread. Depends
  on your provider key entered **in-app** (🔑 Keys, M1.7) + a published module + a
  running orchestrator (**SETUP.md S-5**). *(`.env`/S-4 is smoke-only — V-6.)*
- **Setup:**
  1. Publish the module to your target server (local: `pnpm --filter
     @agentspace/spacetime-module spacetime:publish:local` with `spacetime start`; or
     Maincloud per S-3).
  2. Build, then run the orchestrator against that server (**no `.env` key** — post-M1.7
     it reads *your* key from STDB, sealed in-app). See **SETUP.md S-5**: `pnpm run build`,
     then set `AGENTSPACE_STDB_HOST`/`AGENTSPACE_STDB_DB` and
     `pnpm --filter @agentspace/orchestrator start`. Note the printed **orchestrator
     identity** hex; it registers its **BYOK public key** on startup (so the app can seal
     keys to it). *(The canonical named-persona flow is **V-8**; V-7 below uses the raw
     orchestrator identity as a stand-in agent.)*
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
- **AI evidence (2026-06-22, propose PASS — founder confirms):** on the Pixel_8 dev build vs
  Maincloud with the orchestrator running locally, the founder's Anthropic key entered in
  🔑 Keys (sealed → ciphertext in `provider_key`; raw key never in STDB), a message in the
  Pirate Pete DM produced a **streaming agent reply** (`▍` cursor, text grew token-by-token)
  that the orchestrator generated by decrypting the BYOK key and calling Anthropic. Required
  the DEC-029 fixes (esp. the `Promise.withResolvers` polyfill, without which the key never
  saved) + clearing a stray `ANTHROPIC_BASE_URL` env var that 404'd the API. **Caveat (OT-004):**
  *long* replies can freeze mid-text with a dangling cursor (delivery drops the UPDATE-burst tail;
  the reply is complete in STDB) — short/medium replies settle cleanly; full fix is M2.3.
- **Notes (founder):** ✅ **VERIFIED 2026-06-22** (founder-authorized) — Maincloud + Anthropic
  (BYOK key entered in 🔑 Keys, sealed); a streamed agent reply rendered live token-by-token.
  *(OT-004 long-reply dangling-cursor caveat carried to M1.9/M2.3 — non-blocking.)*

---

### V-8 — Author a persona and chat with it on-device (Agent Studio)  ·  added 2026-06-13 · M1.5
> **Canonical end-to-end test (per-user BYOK, M1.7):** enter your own key in the app
> (**🔑 Keys**), author a persona, chat — your persona replies **with your key**. The
> raw key is encrypted on-device and stored as ciphertext (never raw in STDB). If you
> haven't added a key, the agent replies "⚠️ …add an API key in Settings → API Keys".
- **Why:** proves the full **build-an-agent → converse** loop on a device: create a
  persona in the app, deploy it, and confirm the orchestrator replies **as that
  persona** (its system prompt + model). The data path + persona injection are proven
  headlessly (integration); this is the on-device UX + a real model. Depends on a
  running orchestrator (**S-5**) + your provider key entered **in-app** (🔑 Keys).
- **Setup:** same as V-7 (publish the module; build + run the orchestrator against the
  same server — **no `.env` key**, add your key in-app). The orchestrator registers
  itself as the agent service **and** publishes its BYOK public key on startup.
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
  tell me (the binding/View didn’t resolve); `⚠️ add an API key…` or a model error → your
  provider key isn’t set in-app (🔑 Keys), or the orchestrator regenerated its box keypair
  on restart (re-enter the key — BL-011). Capture orchestrator logs.
- **AI evidence (2026-06-22, propose PASS — founder confirms):** authored **Pirate Pete**
  (anthropic / `claude-opus-4-8`, system prompt "Reply only in pirate speak.") in the in-app
  Agent Studio, opened its DM, and the reply streamed in **as the persona** — e.g. *"Ahoy there,
  matey! … a chest brimmin' with golden pieces of eight would make me peg leg dance a merry jig!
  … Arrr! 🏴‍☠️"* — i.e. the persona's system prompt + model took effect, decrypting the founder's
  BYOK key. Same caveat as V-7 (OT-004 long-reply cursor). Screenshots + STDB rows captured.
- **Notes (founder):** ✅ **VERIFIED 2026-06-22** (founder-authorized) — "Pirate Pete"
  (anthropic / `claude-opus-4-8`) replied **in persona** (pirate speak) via the user's BYOK key.
  *(Same OT-004 caveat.)*

---

### V-9 — Contacts, DMs & group management on-device  ·  added 2026-06-13 · M1.3
- **Why:** the directory search + membership reducers are verified at the data layer
  (`spacetime call`); this is the on-device UX (the part CI can’t judge) — finding
  people by name, DMs that read as a person, and managing a group. Needs **two devices/
  identities** (set a display name on each first so they’re findable).
- **Setup:** V-4 setup (two devices on the same module); set a display name on each
  (the first-run nudge prompts for it).
- **Steps:**
  1. On A: tap **＋ New chat**, search B by name, tap → a DM titled with **B’s name**
     opens; send a message (B sees it; the inbox shows the preview + time).
  2. On A: tap **New group** → it opens the group’s members screen → **Rename** it →
     **+ Add member** → pick B; B appears in the members list (and the group shows in
     B’s inbox).
  3. As the group **creator** (A): **Remove** B, then add again; confirm changes reflect
     on B’s device live.
  4. On B: open the group → **Leave conversation**; it disappears from B’s inbox.
- **Pass when:** name-search finds users; DMs are titled by person + dedupe (re-opening
  “New chat” for the same person reuses the thread); add/remove/rename/leave all reflect
  **live** on both devices; avatars + online dots render.
- **If it fails:** users don’t appear in search → they haven’t set a display name (or
  no presence); remove/rename does nothing → you’re not the group **creator** (only the
  creator can). Capture the screen + tell me.
- **Notes (founder):** _devices + result →_

---

### V-10 — A non-Anthropic cloud provider replies on-device  ·  added 2026-06-22 · M1.8.1
- **Why:** M1.8.1 made 13 single-API-key providers live behind one `PROVIDER_CATALOG`;
  CI proves the wiring headlessly (per-provider factory coverage). This confirms a **real,
  non-default provider** streams a reply on-device using **your** key for it.
- **Setup:** orchestrator running vs Maincloud (S-5) + the app (V-7 setup). Pick a provider
  you have a key for (e.g. **OpenAI**, **Groq**, **Mistral**, **Google**).
- **Steps:**
  1. 🔑 **Keys** → that provider’s card → paste your key → **Save** (use **Get a key →** if
     you need one). Confirm “✓ key set”.
  2. 🤖 **Agents** → **+ New** → pick that **provider** chip → tap a suggested **model** chip
     (or type one) → name it → **Create** → **Chat** → send a message.
- **Pass when:** the reply streams in (cursor → complete) from that provider; switching the
  agent to a different provider+model and chatting again also works.
- **If it fails:** `⚠️ add an API key…` → the key for that provider isn’t saved; a model
  error → the model id isn’t served by that provider (tap a suggested model, or check the
  provider’s docs). Capture the orchestrator logs + the provider/model.
- **Notes (founder):** _provider + model + result →_

---

### V-11 — A local (Ollama / OpenAI-compatible) agent replies  ·  added 2026-06-22 · M1.8.2
- **Why:** M1.8.2 added the **local** provider path (per-agent `base_url`; key optional).
  This confirms an agent backed by a **model on your own machine** replies in-app — nothing
  leaves your hardware. **The Android emulator needs no GPU:** the model runs in **Ollama on
  the host (RTX 4070)**; the orchestrator (host) calls `localhost:11434`; the emulator is
  just the chat client (emulator → STDB → orchestrator → Ollama → reply → STDB → emulator).
- **Setup:**
  1. Install **Ollama** + pull a model: `ollama pull llama3.2` (it serves
     `http://localhost:11434/v1`). On the **same host**, run the orchestrator vs Maincloud (S-5).
  2. **Re-publish the module to Maincloud** first (the `agent.base_url` column is new) —
     `spacetime publish agentspace-hpm58 -p . --server maincloud --delete-data=on-conflict --yes`
     (a fresh test DB loses nothing). *(Bindings are already regenerated + committed; no other
     local command needed.)*
- **Steps:**
  1. 🤖 **Agents** → **+ New** → pick the **Local (OpenAI-compatible)** provider → a **Base URL**
     field appears (default `http://localhost:11434/v1`) → set the **model** to your pulled
     model (e.g. `llama3.2`) → **Create** → **Chat** → send a message.
- **Pass when:** the reply streams from the local model (your GPU spins up; no cloud key used).
- **If it fails:** `⚠️ …no base URL` → set the Base URL on the agent; no reply / connection
  error → Ollama isn’t running or the URL is wrong (the orchestrator runs on the **host**, so
  use `localhost`, not `10.0.2.2`); a model error → `ollama pull` that model first. Capture the
  orchestrator logs.
- **Notes (founder):** _model + result →_

---

### V-12 — A multi-credential provider replies (Bedrock / Azure / Vertex)  ·  added 2026-06-22 · M1.8.3 · *(optional)*
- **Why:** M1.8.3 added the multi-credential providers (a **JSON** of fields, sealed like any
  key — no schema change). This confirms one of them streams a reply on-device. **Optional** —
  only if you have AWS / Azure / GCP access; the cloud (V-10) + local (V-11) paths already
  cover the common cases. See **`PROVIDERS.md`** Tier 3 for getting each credential.
- **Setup:** orchestrator running vs Maincloud (S-5); credentials per `PROVIDERS.md` for your
  chosen provider.
- **Steps:**
  1. 🔑 **Keys** → **Multi-credential providers** → your provider → fill the fields (e.g.
     Bedrock: `region` / Access Key ID / Secret Access Key) → **Save** (“✓ set”).
  2. 🤖 **Agents** → **+ New** → pick that provider → set the **model** (Bedrock: a model id;
     **Azure: your deployment name**; Vertex: `gemini-2.0-flash`) → **Create** → **Chat**.
- **Pass when:** the reply streams in from that provider.
- **If it fails:** auth error → a field is wrong or model access isn’t enabled (Bedrock: enable
  model access in its console; Azure: the model is your **deployment** name, not the base id;
  Vertex: the Vertex AI API is enabled for the project). Capture the orchestrator logs.
- **Notes (founder):** _provider + result →_

---

### V-13 — A LONG reply streams and settles clean (no dangling cursor)  ·  added 2026-06-22 · M1.9
- **Why:** this is the **OT-004 acceptance bar**. M1.9 replaced cumulative-text `message` UPDATEs
  (whose long burst the client tail-dropped over Maincloud, freezing the bubble mid-text) with
  **append-only `reply_delta` INSERTs**. Headless integration proves delta order + GC; this proves
  a *long* reply renders live AND lands `complete` over real Maincloud latency. This is the bug that
  the prior session saw on-device (V-7/V-8 long-reply caveat).
- **Setup:**
  1. **Re-publish the module to Maincloud** (the `reply_delta` table is new):
     `spacetime publish agentspace-hpm58 -p modules\spacetime --server maincloud --delete-data=on-conflict --yes`
     (a fresh test DB loses nothing; bindings are already regenerated + committed).
  2. Build, then run the orchestrator vs Maincloud (S-5; **clear `ANTHROPIC_BASE_URL` first**), with
     your Anthropic key entered in-app (🔑 Keys). Use the **Pirate Pete** persona (or any anthropic
     persona) on the Pixel_8 dev build.
- **Steps:** in the persona DM, send a prompt that forces a **long, multi-paragraph** reply — e.g.
  *“Tell me a long pirate tale, at least six paragraphs.”*
- **Pass when:** the bubble **streams token-by-token** for the whole reply and then **settles to a
  final `complete` message with the `▍` cursor gone** — no freezing mid-text, no dangling cursor.
  Repeat 2–3× (incl. a very long one) to be confident.
- **If it fails (cursor still dangles / text freezes):** capture the orchestrator logs + a screen
  recording + the thread; note the approximate reply length. The reply is always correct in STDB, so
  a failure here is a delivery/render issue (tell me — we may need to tune the flush window or the
  client assembly).
- **AI evidence (2026-06-23 — mechanism proven; live render is yours to confirm):** the OT-004
  *mechanism* is verified end-to-end over **real Maincloud** by a headless long-reply probe: a
  **4949-char reply streamed as 36 append-only deltas, arrived in `seq` order with NO gaps, settled
  to `complete` with the full text, and the deltas GC'd — i.e. NO tail-drop** (the exact failure
  OT-004 describes). Backed by the local + Maincloud integrations (delta order + GC + cancellation)
  and **24 orchestrator unit tests**. On the **Pixel_8 emulator** the app loads + runs the M1.9 JS
  bundle and connects to Maincloud with **no JS errors**; I even observed the *historical* OT-004 bug
  still frozen in the Maincloud data (old pre-M1.9 replies stuck `streaming` with a dangling `▍`).
  The **live on-device render tap-through wasn't completed** this session — the Metro dev-client was
  unstable (subscription flapping / reconnects / anonymous-login not persisting across restart),
  which blocked reliable UI automation; this is an environment issue, not an M1.9 code defect. Please
  run the steps above (a long prompt in the Pirate Pete DM) to confirm the bubble settles `complete`
  with no dangling `▍`.
- **Notes (founder):** _device + reply length + result →_

---

### V-14 — Interrupting a reply cancels it cleanly  ·  added 2026-06-22 · M1.9
- **Why:** M1.9.2 added **cancellation-on-supersede** — a new message sent while an agent is
  mid-reply aborts that reply (run `cancelled`, message `failed`/cursor cleared) and answers the new
  message. Proven headlessly; this is the on-device UX. (Before M1.9 a mid-reply message was
  silently dropped.)
- **Setup:** same as V-13 (orchestrator vs Maincloud, key in 🔑 Keys, an anthropic persona).
- **Steps:**
  1. Ask for a **long** reply (as in V-13) so it streams for a few seconds.
  2. **While it is still streaming**, send a **second message** (e.g. *“actually, stop — what’s 2+2?”*).
- **Pass when:** the first (interrupted) bubble **stops growing and its cursor clears** (it does not
  hang as `streaming`), and the **second message gets its own fresh reply** that streams in and
  completes. No dangling cursor on either.
- **If it fails:** the first bubble keeps a dangling cursor → the cancel didn’t finalize; the second
  message gets no reply → capture the orchestrator logs. Tell me which.
- **AI evidence (2026-06-23 — proven headlessly):** cancellation-on-supersede is verified end-to-end
  over **real Maincloud** (and locally): a second message sent mid-stream cancels run #1 (its message
  → `failed`, run → `cancelled`) and the new message is answered (`complete`). Covered by a dedicated
  `handleReply` unit test + the integration's cancellation scenario. The on-device *render* of this
  (cursor clears on the interrupted bubble) wasn't tap-through-verified this session (same Metro
  dev-client instability as V-13) — please confirm on-device.
- **Notes (founder):** _device + result →_

---

> **M2.1 founder run-environment notes (apply to V-15…V-19):**
> - **Republish the module to Maincloud first** — M2.1 adds new tables (`thread_agent`, `episode`,
>   `agent_turn`, `reaper_schedule`) + additive columns, so the schema migration needs
>   `--delete-data=on-conflict` (a fresh test DB loses nothing). This is the new **SETUP S-item** and a
>   **prerequisite** for all of V-15…V-19:
>   `spacetime publish agentspace-hpm58 -p modules\spacetime --server maincloud --delete-data=on-conflict --yes`,
>   then regenerate + sync the bindings (×3). Bindings are committed; only re-run if you edit the module.
> - **Windows / PowerShell — clear `ANTHROPIC_BASE_URL` before launching the orchestrator** for any
>   item using a real Anthropic key (**V-16**, **V-19**): `Remove-Item Env:ANTHROPIC_BASE_URL` (a stray
>   base URL without `/v1` makes Anthropic 404). Then start it (S-5) with your key entered in 🔑 Keys.
> - **Dial numbers are starting defaults** (`MAX_TURNS_HARD=8`, `MAX_CONCURRENT=2`,
>   `MAX_OUTPUT_TOKENS_PER_RUN=2000`, `EPISODE_TOKEN_CEILING=50_000`, `STREAM_TTL_MS=120_000`) — note
>   anything that feels too tight/loose during V-16 and we'll tune.
> - **Emulator-driving harness:** `apps/mobile/scripts/ondevice-verify.md` is the reproducible loop for
>   driving the Pixel_8 via adb (the reliable path is **local-dev mode** — point the app at a local
>   `spacetime start` server for an anonymous, stable loopback connection; the render can stall mid-stream
>   (BL-022), so confirm via `spacetime sql --server local`). `shot.ps1` captures screenshots.

---

### V-15 — Multi-agent group coherence (no persona-bleed)  ·  added 2026-06-23 · M2.1
- **Why:** M2.1 lets a thread hold **many agents** (the new `thread_agent` table). Headless
  integration proves two `@`-mentioned agents each reply, tagged + in mention order (scenario C); this
  is the on-device proof that, in a real group, **each agent answers as itself** with its own
  persona/model — no cross-talk where one agent's reply leaks another's voice (the `prompt.ts`
  `isAgent`-from-the-tag fix). Needs the M2.1 republish (above).
- **Setup:** orchestrator vs Maincloud (S-5), key in 🔑 Keys. Author **two distinct personas** (V-8) —
  e.g. **Pirate Pete** ("reply only in pirate speak") and **Professor Quill** ("reply formally, in one
  precise sentence"). Have **≥2 human identities** in the thread (a second device/emulator, V-4 setup).
- **Steps:**
  1. Create a **group** (not a DM) with both humans. Open **Members → + Add agent** and add **both**
     personas (the `🤖 …with agents` badge shows on the thread).
  2. From human A, send one message that **@-mentions both agents** — type `@` and pick each from the
     typeahead: e.g. *"@Pirate Pete @Professor Quill — describe the sea."*
  3. From human B, send a follow-up that @-mentions just **one** of them.
- **Pass when:** **both** agents reply to step 2, **each in its own persona** (Pete in pirate speak,
  Quill in one formal sentence) and rendered with the **right name/avatar** on each bubble — no bleed
  (Pete doesn't answer formally, Quill doesn't talk like a pirate); replies arrive in **mention order**
  (Pete before Quill). Step 3's single mention is answered by **only** that agent.
- **If it fails:** both bubbles look like one persona, or a reply shows the wrong name → persona-bleed
  (capture both bubbles + the orchestrator logs); only one agent replies to a two-mention → the second
  `@` didn't resolve to a `thread_agent` (re-pick it from the typeahead, don't type it raw). Tell me.
- **🤖 AI headless evidence (2026-06-23):** verified against a local STDB with the **real Anthropic model**
  (`scripts/verify-realmodel.ts`, Haiku): `@Marina @Lyric — what lives in the deep sea?` → Marina answered
  in one factual sentence, Lyric in a rhyming couplet — two distinct voices, correctly **tagged + in mention
  order, no bleed**. Confirms the behavior; the on-device **UI render** (avatar/name from `message.agentId`)
  + the 2-human setup remain the founder's tick.
- **Notes (founder):** _devices + personas + result →_

---

### V-16 — Loop / cost guard: an agent↔agent volley TERMINATES within budget  ·  added 2026-06-23 · M2.1
- **Why:** **the existential test for M2.1.** With agents allowed to address each other
  (`respondsToAgents`), the danger is an infinite (and costly) agent↔agent loop. The reducer guard —
  `agent_turn` (once-per-episode-per-agent) + `turnsRemaining` + the summed `EPISODE_TOKEN_CEILING` +
  per-run `MAX_OUTPUT_TOKENS_PER_RUN` + `MAX_CONCURRENT` — **structurally bounds** any volley to
  **≤ (#agents) replies per human-rooted episode**. Headless scenario D proves a two-agent volley stops
  at **exactly 2** replies; this confirms it on a **real model** end-to-end and lets you watch real
  token spend. **Clear `ANTHROPIC_BASE_URL` first** (notes above).
- **Setup:** orchestrator vs Maincloud (S-5, `ANTHROPIC_BASE_URL` cleared), Anthropic key in 🔑 Keys.
  Author **two** agents and **toggle `respondsToAgents` ON** on each (AgentEditor) — e.g. **Alice** and
  **Bob**, each prompted to **address the other by name** (e.g. *"Always end by asking @Bob a question."*
  / vice-versa) so they would loop if unbounded.
- **Steps:**
  1. Create a group, **+ Add agent** for both Alice and Bob.
  2. Send **one** human message that kicks it off — e.g. *"@Alice, start a chat with @Bob."*
  3. **Do not** send anything further. Watch the thread settle; watch the orchestrator logs for the run
     token sums.
- **Pass when:** the conversation **STOPS on its own** — **at most #agents (=2) agent replies** for that
  one human message (the episode), **no perpetual back-and-forth**, no runaway. Each run's output stays
  under the per-run cap and the **summed** tokens stay under the episode ceiling (the episode closes when
  the budget is spent). Sending a **new** human message starts a **fresh** episode (a new bounded round).
- **If it fails (it keeps going past #agents replies, or never stops):** capture the full thread + the
  orchestrator logs (with the per-run token sums) immediately and **stop the orchestrator** — this is the
  guard failing and is the one result that **blocks**. Tell me the agent count and how many replies fired.
- **🤖 AI headless evidence (2026-06-23):** the existential test, **real model** (`verify-realmodel.ts`):
  Pingu addressed `@Pongo`, Pongo replied and asked Pingu a follow-up, and the reducer **refused Pingu a 2nd
  turn (`agent_turn`)** → the volley **terminated at exactly 2 replies (319 real tokens)** even though the
  model was actively trying to keep going. The reducer-side guard is also proven by integration Scenario F.
  The founder's tick adds the real-key Maincloud run.
- **Notes (founder):** _#agents + replies observed + token sums + result →_

---

### V-17 — `@everyone` is bounded — each agent replies exactly once  ·  added 2026-06-23 · M2.1
- **Why:** `@everyone` (the synthetic all-mention) fans a single human message out to **every** agent in
  the thread. The same `agent_turn` once-per-episode-per-agent guard must ensure this is a **single
  bounded round**, not a storm. Headless scenario E proves each of N agents replies **once**; this is the
  on-device confirmation with several agents. Needs the M2.1 republish (above).
- **Setup:** orchestrator vs Maincloud (S-5), key in 🔑 Keys. A group with **N ≥ 3 agents** added
  (reuse personas from V-15/V-16; mixed providers is fine if you have the keys).
- **Steps:**
  1. In the group, type `@` and pick **@everyone** from the typeahead (or send *"@everyone, say hi."*).
  2. Send it **once**.
- **Pass when:** **each** of the N agents replies **exactly once** (N bubbles, correct names), then the
  round **ends** — no agent replies twice, no cascading re-triggers from the agents' own replies, no
  storm. (Concurrency is capped at `MAX_CONCURRENT=2`, so they may stream a couple at a time, not all at
  once — that's expected.)
- **If it fails (any agent replies twice, or it cascades):** capture the thread (counting bubbles per
  agent) + the orchestrator logs. Tell me N and which agent doubled.
- **🤖 AI headless evidence (2026-06-23):** **real model** (`verify-realmodel.ts`): `@everyone` → Marina
  and Lyric each replied **exactly once** — no storm, no re-trigger cascade. On-device UI render is the
  founder's tick.
- **Notes (founder):** _#agents + bubbles per agent + result →_

---

### V-18 — Typing indicator + crash self-heal (the reaper)  ·  added 2026-06-23 · M2.1
- **Why:** M2.1 adds a **scheduled reaper** (`reap_stale_runs`, every 60s) that fails out `streaming`
  messages / `running` runs older than `STREAM_TTL` (120s), GCs their deltas, and closes their episodes —
  so a **crashed orchestrator** can't leave a thread stuck "thinking…" forever. This 120s TTL is
  impractical to time in headless tests, so it's verified here. Also confirms the live **"{name} is
  thinking…"** indicator. Needs the M2.1 republish (above).
- **Setup:** orchestrator vs Maincloud (S-5), key in 🔑 Keys, an anthropic persona in a thread (V-8).
- **Steps:**
  1. Send a message that triggers a reply; confirm a **"{persona} is thinking…"** row appears and the
     bubble starts streaming (`▍`).
  2. **While it is still streaming, KILL the orchestrator** (Ctrl-C / close its terminal) — do **not**
     restart it.
  3. Leave the app open on that thread and **wait ~2 minutes**.
- **Pass when:** within **~2 min** (one or two reaper ticks past the 120s TTL) the stuck row **clears on
  its own** — the "thinking…"/streaming indicator disappears and the message lands **`failed`** (no
  dangling `▍`), **without** restarting the orchestrator. Restarting the orchestrator afterward and
  sending a new message produces a normal reply.
- **If it fails (the bubble stays "thinking…" indefinitely past ~3 min):** the reaper isn't running or
  the schedule didn't seed on `init` — confirm the module was **republished** (the `reaper_schedule`
  table is new) and capture the STDB row state for that message/run. Tell me.
- **🤖 AI headless evidence (2026-06-23):** verified headlessly (`scripts/verify-reaper.ts`): a stuck
  `streaming` message (orchestrator silent mid-stream) was driven to **`failed` by the reaper after 165s**
  (STREAM_TTL=120s + the next 60s sweep) — crash self-heal works. The on-device "thinking…"-clears render
  is the founder's tick.
- **Notes (founder):** _wait time to clear + result →_

---

### V-19 — Per-agent BYOK in a group (right key per agent)  ·  added 2026-06-23 · M2.1
- **Why:** in a multi-agent group each agent must reply with **its owner's** key for **its** provider —
  the M2.1 views (`my_persona_keys` rewritten over `thread_agent`) resolve a per-`(owner, provider)` key
  per agent, so two agents with different owners/providers don't cross-use a key. Confirms BYOK isolation
  end-to-end in a group. **Clear `ANTHROPIC_BASE_URL` first** if any agent is Anthropic (notes above).
- **Setup:** orchestrator vs Maincloud (S-5, `ANTHROPIC_BASE_URL` cleared as needed). Two agents whose
  providers differ (e.g. **anthropic** + **openai**), with the matching keys entered in 🔑 Keys — either
  both owned by you (two provider cards) or by **two different users** (each enters their own key on their
  device; M1.7 per-user BYOK).
- **Steps:**
  1. Create a group; **+ Add agent** for both agents (each bound to its own provider/model).
  2. Send a human message that **@-mentions both** (or `@everyone`).
- **Pass when:** **both** agents reply successfully, **each via its own provider's key** — no
  `⚠️ add an API key…` on an agent whose key *is* set, and no agent answering with the wrong provider.
  Removing/clearing **one** agent's key and re-sending makes **only that agent** show the `⚠️` (the other
  still replies) — proving per-`(owner, provider)` resolution.
- **If it fails:** an agent whose key is set still shows `⚠️` → its `(owner, provider)` key didn't resolve
  through `my_persona_keys` (check the owner matches the key's owner + the provider matches the agent's);
  an agent replies via the wrong provider → capture the orchestrator logs + both agents' provider/model.
- **🤖 AI headless evidence (2026-06-23):** **real key** (`verify-realmodel.ts`): the founder's Anthropic
  key was sealed client-side → stored as **ciphertext** → **decrypted in-memory** by the orchestrator →
  produced real replies (the per-`(owner, provider)` `my_persona_keys` path, end-to-end). Distinct
  keys-per-agent across **two owners** needs the founder's 2-provider on-device run; the single-owner path
  is verified.
- **Notes (founder):** _agents + providers + owners + result →_

---

> **V-20 is reserved** for M2.4 (per-agent presence / avatars) — not yet built. V-21/V-22 below cover
> the M2.5 auto-reconnect hardening (BL-022). *(No Maincloud republish needed for M2.5 — no schema change.)*

### V-21 — App auto-reconnect after a dropped socket  ·  added 2026-06-23 · M2.5
- **Why:** the exact on-device defect that opened **BL-022** — the app's Maincloud WebSocket dropped
  mid-session and the app got **stuck on "Connecting to AgentSpace…"** forever (the SDK has no
  auto-reconnect). M2.5 wraps the connection in a `ConnectionGate` that detects the drop, shows
  **"Reconnecting…"**, refreshes the id token, and re-establishes the connection with backoff (and
  reconnects promptly on foreground). The reducer/backoff logic is unit-tested; this confirms the real
  RN render/lifecycle on-device. **No republish needed** (M2.5 changes no schema).
- **Setup:** the app on the Pixel_8 dev build vs Maincloud (V-7 setup), signed in, in a thread.
- **Steps:**
  1. With the app open + connected, **drop the network** mid-session: toggle the emulator/device to
     **airplane mode** (or disable Wi-Fi) for ~10–20s, then restore it. *(Or: background the app for a
     minute or two, then return to the foreground.)*
  2. Watch the app while the network is down and after it returns.
- **Pass when:** while the socket is down the app shows **"Reconnecting…"** (not a permanent
  "Connecting…"), and once the network returns it **re-connects on its own** — the thread list/messages
  come back live **without** killing + relaunching the app. Foreground-resume after a long background also
  reconnects. *(After a reconnect the app lands on the inbox — expected for MVP.)*
- **If it fails (stuck on "Connecting…"/"Reconnecting…" after the network is back):** capture a screen
  recording + the JS logs (`adb logcat`), note how long you waited. If it bounced to **Login**, your
  SpacetimeAuth session likely expired (re-login is correct then) — tell me which.
- **Notes (founder):** _device + how the drop was induced + result →_

---

### V-22 — Orchestrator self-heals a dropped socket (no process exit)  ·  added 2026-06-23 · M2.5  ·  ✅ DONE (AI, 2026-06-23 — Scenario G live)
- **Why:** the other half of **BL-022** — on-device the orchestrator's Maincloud socket dropped and the
  **process exited**, silently stopping all agent replies. M2.5 runs it under a `runOrchestrator`
  supervisor that reconnects with backoff and re-arms the reply loop on a fresh connection (stable
  identity), **never exiting** on a drop. Proven headlessly by **integration Scenario G** + supervisor unit
  tests; this confirms it against real Maincloud. **No republish needed.**
- **Setup:** the orchestrator running vs Maincloud (S-5), serving a persona DM (V-8); send a message and
  confirm a normal reply first.
- **Steps:**
  1. With the orchestrator running, **briefly cut its network** (disable the host's Wi-Fi/ethernet for
     ~15–30s, or block it) so its Maincloud socket drops — then restore the network. **Do not** restart
     the process.
  2. After the network is back, send a **new** message to the persona in the app.
- **Pass when:** the orchestrator **logs a disconnect then a reconnect** (`reconnecting in …ms` →
  `connected as …` → `reply loop subscribed`) and the **process keeps running** (it does **not** exit),
  and the new message gets a normal streamed reply. Its identity hex is **unchanged** across the reconnect.
- **If it fails (the process exits on the drop, or never resumes replying):** capture the orchestrator
  logs around the disconnect. Tell me whether it exited or just stopped replying.
- **🤖 AI evidence (2026-06-23 — AI-completed locally):** integration **Scenario G** (`scripts/integration.ts`)
  was **run live** against the local server + freshly-published module: the supervisor logged
  `disconnected (clean); reconnecting in 33ms` → `connected as c200dfb8…` (the **same identity**) → answered a
  **new** message over the fresh connection, and the **process never exited**. Backed by 3 `supervise.test.ts`
  unit tests (reconnect-after-drop, backoff growth + reset, never-exit). This is purely an orchestrator-process
  behavior (no on-device UI); the only delta vs this V-item's "real Maincloud network-kill" wording is the
  drop trigger (`conn.disconnect()` vs an actual network failure — both fire the SDK's `onDisconnect`).
- **Notes (founder):** ✅ **AI-COMPLETED 2026-06-23** (at the founder's "complete what you can locally"
  request) — supervisor self-heal verified live via Scenario G (reconnect + same identity + answered, no exit).
  A real Maincloud network-kill is an optional countersign.

---

### V-23 — Agent presence & typing render (animated "thinking…")  ·  added 2026-06-23 · M2.2
- **Why:** M2.2 turned the minimal M2.1 "{name} is thinking…" into an **animated** presence affordance,
  derived purely from `streaming` message rows (no schema change) and surfaced in the **inbox**, the open
  thread, and the agent avatar. The pure label logic (`thinkingLabel`) is unit-tested; this confirms the RN
  animation + multi-agent + self-heal behavior on-device. **No republish needed** (no schema change).
- **Setup:** the app on the Pixel_8 dev build vs Maincloud (V-7 setup), orchestrator running (S-5), with a
  **group holding two agents** (reuse personas from V-15).
- **Steps:**
  1. In the group, send `@everyone` (or `@A @B`) so both agents reply; watch the **inbox** row for that
     thread, then open the thread and watch the **header** + bubbles.
  2. Open a **1:1 agent DM** and send a message; watch the header.
  3. (Self-heal) Send a message and **kill the orchestrator** mid-stream; wait ~2 min.
- **Pass when:**
  - **Inbox:** the thread row shows an **animated** "🤖 2 agents are thinking…" (dots moving) replacing the
    last-message preview, with a subtle avatar pulse; it **clears** to the normal preview once replies complete.
  - **Open thread:** a header subtitle shows the animated thinking label while agents are active, and each
    streaming bubble shows an animated indicator (dots before tokens, then live text); all clear on complete.
  - **DM:** the header shows "{name} is thinking…" while the single agent replies.
  - **Self-heal:** after killing the orchestrator, the indicators **clear within ~2 min** (the reaper flips
    the stale `streaming` row to `failed`) — no perpetual "thinking…".
- **If it fails:** indicators never appear → the streaming rows aren't derived (capture the thread + logs);
  indicators never clear (past ~3 min with the orchestrator dead) → reaper issue (overlaps V-18). Tell me which.
- **🤖 AI evidence (2026-06-23):** `thinkingLabel` (0/1/2/≥3 arms) is unit-tested in CI; the derivation is
  pure-client off existing `streaming`+`agentId` rows; Android bundle clean. The RN **animation render** is
  the founder's tick.
- **Notes (founder):** _device + result →_
