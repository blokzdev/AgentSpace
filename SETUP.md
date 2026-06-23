# SETUP.md — Founder Setup & Action Items (founder-owned)

> Things **only you** can do — register an app, create an account, configure a
> third-party dashboard, hand back a credential or ID. This is the setup-side twin
> of `VERIFICATION.md`: the AI **records** items here (exact steps + what to hand
> back) and builds around them with env placeholders; **you** do them and report
> the value; **only you** mark an item done. The AI never self-ticks and never
> blocks the build loop on an open item. (Governed by `CLAUDE.md` §4.)

**Status legend:** `[ ]` open · `[x]` done (founder) · `[~]` in progress.
**Per-item template:**

```
### S-N — <title>  ·  added <date> · <milestone>  ·  [ ]
Why: <what this unblocks>
Where: <dashboard URL / CLI — and whether it's web or terminal>
Steps: <numbered, click-by-click>
Give back to the AI: <the exact value/secret/confirmation the AI needs>
```

> **Secrets discipline.** Hand back public IDs (client_id, issuer, db name) here or
> in chat freely. **Never paste a client _secret_, API key, or private token into a
> committed file.** For the mobile app these go in a local untracked `.env` /
> `apps/mobile/.env.local` (Expo reads `EXPO_PUBLIC_*`); the AI will tell you the
> exact variable name to set.

> **Your local environment (2026-06-14).** You run on **Windows 11** (Lenovo Legion 7i
> Slim, RTX 4070). The terminal commands below are written for **PowerShell** (the Win11
> default); where a step is shell-specific it says so, and the macOS/Linux form is noted
> in parentheses. Run from the repo root unless a step says otherwise. *(The RTX 4070
> isn't used by anything today — cloud BYOK does the inference; local GPU models via
> Ollama / the gateway's OpenAI-compatible path are post-v1, DEC-009 / OT-006.)*

---

### S-1 — Enable SpacetimeAuth on `agentspace-hpm58` + get the `client_id`  ·  added 2026-06-13 · M1.2  ·  [x] (founder 2026-06-14)
> **DONE.** `client_id = client_033XyhtPkMcEQ4adazN6Cx`; wired in as
> `EXPO_PUBLIC_SPACETIMEAUTH_CLIENT_ID` (`apps/mobile/.env.example` + `.env.local`).
> Client config **validated**: **Public client** (Private toggle OFF = public — correct
> for our PKCE/no-secret flow ✔), Web Application OFF (fine for a native app ✔), scopes
> `openid email profile offline_access` ✔ — the app now requests `offline_access` too
> (refresh-token persistence). No dashboard change needed.
- **Why:** unblocks the mobile login flow. The app does OIDC against the hosted
  SpacetimeAuth provider (issuer `https://auth.spacetimedb.com/oidc`); it needs a
  **client_id** to start the flow. Without it the "Sign in" button stays disabled.
- **Where:** **web dashboard** (not terminal) — Maincloud console for your module.
- **Steps:**
  1. Go to the SpacetimeDB **Maincloud** console and open your module
     **`agentspace-hpm58`**.
  2. In the module dashboard **sidebar**, click **SpacetimeAuth**.
  3. Click **Use SpacetimeAuth** to enable the provider for this database. (A
     project is created with a **default Client**.)
  4. Open the **Clients** tab and select the default client. Copy its
     **Client ID**. (Leave any **Client Secret** alone — the mobile app uses PKCE
     and does **not** need the secret. Do not share the secret.)
- **Give back to the AI:** the **Client ID** string. I'll wire it in as
  `EXPO_PUBLIC_SPACETIMEAUTH_CLIENT_ID` (you set it in `apps/mobile/.env.local`
  for the device test; nothing secret is committed).

---

### S-2 — Register the mobile redirect URI on that Client  ·  added 2026-06-13 · M1.2  ·  [x] (founder 2026-06-14)
> **DONE — but UPDATED 2026-06-22 (DEC-029).** The redirect URI is now the **reverse-DNS**
> `com.agentspace.probe://redirect` (matches `makeRedirectUri({ scheme: 'com.agentspace.probe',
> path: 'redirect' })` in `src/auth.ts` + app.json `scheme`). SpacetimeAuth (node-oidc-provider)
> **rejects** the old plain `agentspace://redirect` with `invalid_redirect_uri` — a native client's
> redirect set must be reverse-DNS, and the **whole set** is validated, so the old URI must be
> **removed** (founder did this live: only `com.agentspace.probe://redirect` remains).
- **Why:** OIDC only returns to a **pre-registered** redirect URI. The mobile app
  uses the custom scheme `agentspace://redirect`; it must be on the client's
  allow-list or the provider rejects the login.
- **Where:** same **Clients** tab as S-1 (web dashboard).
- **Steps:**
  1. In the default client's settings, find **Redirect URIs / Allowed Callback
     URLs**.
  2. Add exactly: **`agentspace://redirect`** and save.
  3. (If there's a separate **Allowed Logout / post-logout** field, you can leave
     it blank for now — M1.2 does a local sign-out.)
- **Note:** the custom scheme only resolves in a **real dev/standalone build**
  (`expo run:android` or an EAS dev build), **not in Expo Go**. V-5 covers this.
- **Give back to the AI:** just confirm it's saved (no value needed).

---

### S-3 — Publish the module to Maincloud `agentspace-hpm58`  ·  added 2026-06-13 · M1.2  ·  [x] (founder 2026-06-22)
> **DONE.** Published to Maincloud `agentspace-hpm58` (database identity
> `c200c0eea8579360068efe51acaffc85ee5e216ecea5226810a91de45387b15d`) — all **8 tables +
> 8 views** created per the migration plan. Founder CLI was **2.6.0** (newer than our 2.5.0
> build target; published cleanly). **Doc gap fixed (step 2):** the first attempt failed
> `Could not resolve 'spacetimedb/server'` / `tsc not found` because the repo's deps weren't
> installed — `pnpm install` from the repo root resolves it. The `tsc not found` /
> `verbatimModuleSyntax` lines are **cosmetic** (watch for `Build finished successfully`).
- **Why:** `DbConnection.withToken(idToken)` only succeeds against a server that
  **trusts the SpacetimeAuth issuer** — that's Maincloud, not a local
  `spacetime start`. So login + the agent reply loop must run against Maincloud.
- **AI attempted 2026-06-14 → blocked:** the module **builds clean**, but publishing
  to Maincloud returned **`401 Unauthorized: Invalid token: InvalidSignature`** — this
  container is logged in as a different identity, **not your `blokzdev` Maincloud
  account** (which owns `agentspace-hpm58`). So this step is **yours**: run it from a
  machine where `spacetime login` is your Maincloud/`blokzdev` account.
- **Where:** **any PowerShell terminal** with the repo checked out + the SpacetimeDB CLI —
  it does **not** need an IDE. (Needs the module source, so `cd` into `modules\spacetime`,
  or use `-p <path-to>\modules\spacetime` from anywhere.)
- **Steps (founder) — full sequence (PowerShell):**
  1. **Install the CLI** (once), if not already — in **PowerShell**:
     `iwr https://windows.spacetimedb.com -useb | iex` (the installer adds `spacetime` to
     your `PATH`; **open a new terminal** afterwards so it picks up). Check:
     `spacetime --version` (we build against **2.5.0**; a newer CLI like **2.6.0** also
     publishes fine). *(macOS/Linux equivalent: `curl -sSf https://install.spacetimedb.com | sh`.)*
  2. **Install the repo's dependencies — REQUIRED.** The publish *compiles* the TS module,
     which needs `typescript` + the `spacetimedb` package present; skipping this is what
     causes `Could not resolve 'spacetimedb/server'`. Needs **Node ≥ 22** + **pnpm**
     (`corepack enable`, or `npm i -g pnpm`). Then, **from the repo root**
     (`E:\Cloud\AgentSpace`): `pnpm install`. *(pnpm is workspace-aware — running it from a
     subfolder like `modules\spacetime` still installs the whole workspace into the
     repo-root `node_modules`, so the CWD doesn't matter and nothing per-folder is created
     under our hoisted linker.)*
  3. **Log into your Maincloud/`blokzdev` account** (this is the step the container
     couldn't do): `spacetime login` → opens a browser → authorize as `blokzdev`.
     Verify: `spacetime login show` (should print your account identity) and
     `spacetime server list` (should list `maincloud` → `maincloud.spacetimedb.com`).
  4. **Publish** from the repo's `modules\spacetime` (`cd modules\spacetime` first):
     `spacetime publish agentspace-hpm58 -p . --server maincloud --yes`. Two messages here
     are **cosmetic** and don't mean failure — `tsc not found in node_modules` (the CLI uses
     its own TS transform; look for `Build finished successfully` right after) and the
     `CONFIGURATION_FIELD_CONFLICT` / `verbatimModuleSyntax` warning.
  5. If it warns about a **breaking schema change with existing data**, add
     `--delete-data=on-conflict` (destroys current Maincloud data — only if you're OK
     with that; a fresh DB has nothing to lose).
  6. Confirm it's live: `spacetime logs agentspace-hpm58 --server maincloud`, or the
     Maincloud console shows the tables (`user`, `thread`, `agent`, `provider_key`, …).
- **Give back to the AI:** confirm it published. The app env is already set
  (`apps/mobile/.env.local`). Then **V-5** (login) is ready; **V-7/V-8** also need the
  orchestrator running against Maincloud — see **S-5**.

---

### S-5 — Run the orchestrator against Maincloud (for live agent replies)  ·  added 2026-06-14 · M1.7  ·  [ ] (only for V-7/V-8)
- **Why:** the orchestrator is the process that actually generates agent replies. The v1
  plan is a **central always-on host** (DEC-027 / BLUEPRINT §4.1), but it is **not hosted
  anywhere yet** (the specific host = OT-005), so for the on-device agent-reply tests
  (V-7/V-8) you run it **on your machine, pointed at Maincloud**, for the duration of the
  test. (V-5 — login only — does **not** need it.)
- **Where:** a terminal in the repo (Node ≥ 22; `pnpm install` **and** `pnpm run build`
  done — see step 1). No `.env` key needed — BYOK keys are entered **in the app**
  (🔑 Keys); the orchestrator no longer reads `.env`.
- **Steps:**
  1. **Build the workspace once — REQUIRED.** The orchestrator runs from source (`tsx`) but
     imports the **built** `@agentspace/gateway` + `@agentspace/shared` (their `package.json`
     `main` is `./dist/index.js`); `pnpm install` does **not** build them. From the **repo
     root**: `pnpm run build`. Skipping this fails with
     `Cannot find module …\@agentspace\gateway\dist\index.js`. (Faster alternative — build
     just the orchestrator's deps: `pnpm --filter "...@agentspace/orchestrator" build`.)
     Re-run only after you pull new code.
  2. Then run — in **PowerShell** (set the env vars on their own lines; the inline
     `VAR=val cmd` form is bash-only and **won't** work in PowerShell):
     ```powershell
     $env:AGENTSPACE_STDB_HOST = "wss://maincloud.spacetimedb.com"
     $env:AGENTSPACE_STDB_DB   = "agentspace-hpm58"
     pnpm --filter @agentspace/orchestrator start
     ```
     It connects (anonymous identity, persisted), prints `connected as …`, registers its
     BYOK public key, and logs `reply loop subscribed`. **Leave it running** while you test.
     *(macOS/Linux: prefix inline — `AGENTSPACE_STDB_HOST=… AGENTSPACE_STDB_DB=… pnpm …`.)*
  3. In the app: 🔑 **Keys** → add your provider key (it seals to the orchestrator's
     pubkey) → 🤖 **Agents** → create a persona → **Chat**.
- **Caveat (v1):** the orchestrator's box keypair is cached in a temp file; if you
  **restart** the orchestrator it may regenerate the keypair, after which previously
  saved keys can't be decrypted — just re-enter your key in 🔑 Keys. (Durable backing =
  BL-011.)
- **Give back to the AI:** nothing — this is operational. Tell me if it fails to connect
  or the agent replies "⚠️ add an API key…".

---

### S-6 — Re-publish the module to Maincloud for M2.1 (multi-agent group threads)  ·  added 2026-06-23 · M2.1  ·  [ ] (required before V-15…V-19)
> **Heads-up: this DESTROYS existing Maincloud data.** M2.1 adds new tables
> (`thread_agent`, `episode`, `agent_turn`, `reaper_schedule`) and appends columns to
> existing ones — a **non-additive** schema change, so the publish needs
> `--delete-data=on-conflict` (the prior `agentspace-hpm58` DB is wiped and recreated;
> a test DB has nothing to lose). The AI **verified M2.1 against a LOCAL server first**
> (CI 16/16 + all 6 headless integration scenarios A–F green); this step pushes the same
> module to Maincloud so the **on-device** checks can run.
- **Why:** the M2.1 reducers/views (multi-agent threads, the per-episode budget guard, the
  scheduled reaper) only exist on Maincloud after a re-publish. Without it the device still
  talks to the M1.9 schema and **V-15…V-19** can't run.
- **Where:** **any PowerShell terminal** with the repo checked out + the SpacetimeDB CLI,
  logged in as your `blokzdev`/Maincloud account (same prerequisites as **S-3**:
  `pnpm install` done so the module compiles).
- **Steps (PowerShell, from the repo root `E:\Cloud\AgentSpace`):**
  1. Make sure you're logged into Maincloud as `blokzdev` (`spacetime login show`) — see
     **S-3** steps 1–3 if not.
  2. **Re-publish with a data wipe** (the new tables make this a breaking change):
     ```powershell
     spacetime publish agentspace-hpm58 -p modules\spacetime --server maincloud --delete-data=on-conflict --yes
     ```
     The same two **cosmetic** messages from S-3 (`tsc not found` / `verbatimModuleSyntax`)
     are fine — watch for `Build finished successfully`.
  3. **Regenerate + sync the bindings to all 3 surfaces** (the new tables/cols change the
     generated client SDK). From the repo root:
     `pnpm --filter @agentspace/spacetime-module spacetime:generate`, then make sure the
     regenerated bindings are synced to the **3 consumers** —
     `apps/mobile/module_bindings`, `packages/stdb-bindings`, and the orchestrator's
     copy — and rebuild (`pnpm run build`). *(The AI can run the regenerate + sync during a
     local session and commit it; you only need to do the Maincloud re-publish above.)*
  4. Confirm it's live: `spacetime logs agentspace-hpm58 --server maincloud`, or the
     Maincloud console shows the new tables (`thread_agent`, `episode`, `agent_turn`, …).
- **Give back to the AI:** confirm it **re-published** (data-wipe accepted) **and** that the
  bindings were **regenerated**. Then **V-15…V-19** (coherence/no-bleed, loop+cost guard,
  `@everyone` bound, typing + crash self-heal, per-agent BYOK in a group) are ready to run.
  V-16/V-19 use a real Anthropic key — launch the orchestrator (**S-5**) with
  `ANTHROPIC_BASE_URL` cleared first (`Remove-Item Env:ANTHROPIC_BASE_URL`) or Anthropic 404s.

---

### S-7 — Rotate the shared Anthropic API key  ·  added 2026-06-23 · M2.5  ·  [ ]
> **Security hygiene (low urgency, but do it).** A real Anthropic key (`sk-ant-…`) was handed to
> the AI in an earlier session and currently lives in the **gitignored** `services/orchestrator/.env`
> (and the repo-root `.env` for the gateway smoke). It is **not** in any committed file — but because
> it appeared in a chat/session transcript it should be treated as potentially exposed and **rotated**.
> The founder authorized the AI to keep using the existing key in **local test loops** until then (it
> never touches a committed file or a log).
- **Why:** a key that has ever been pasted into a chat/transcript should be cycled, even though it was
  never committed. Rotating invalidates the old value everywhere.
- **Where:** **Anthropic Console** (web) — https://console.anthropic.com/settings/keys.
- **Steps:**
  1. Create a **new** API key; copy it.
  2. **Revoke / delete** the old `sk-ant-…` key.
  3. Update the local **untracked** `.env` files with the new value (never commit):
     `ANTHROPIC_API_KEY=sk-ant-…` in `services/orchestrator/.env` and/or the repo-root `.env` (S-4).
- **Give back to the AI:** nothing to paste — **keep the key secret**; just confirm it's rotated.
  Until then the AI continues using the existing key for local test loops only.

---

### S-4 — (Optional) provider API key for the gateway *smoke test*  ·  added 2026-06-13 · M1.4  ·  [ ] optional
- **Scope note:** **per-user BYOK shipped (M1.7)** — for the app, you add your key
  **in-app** (🔑 Keys), *not* `.env`, and the orchestrator no longer reads `.env`. This
  `.env` key is now **only** for the standalone **gateway smoke** (`V-6`,
  `pnpm --filter @agentspace/gateway smoke`). Skip it unless you want to run V-6.
- **Why:** the gateway streams from real providers (Anthropic/OpenAI) using a
  **BYOK** key. CI proves the wiring with a mock; a real round-trip (`V-6`) needs an
  actual key. The key is a secret — it goes in an untracked `.env`, never committed.
- **Where:** wherever you keep your provider key (e.g. the Anthropic Console for an
  `sk-ant-…` key, or the OpenAI dashboard).
- **Steps:**
  1. Get an API key from your chosen provider (Anthropic recommended — the default
     model is `claude-opus-4-8`).
  2. Create an untracked `.env` at the repo root with the matching variable:
     **`ANTHROPIC_API_KEY=sk-ant-…`** (or `OPENAI_API_KEY=…`) — same file on every OS. (Or
     set it for the PowerShell session instead: `$env:ANTHROPIC_API_KEY = "sk-ant-…"`.)
     The smoke harness reads `<PROVIDER>_API_KEY` for the default model's provider.
- **Give back to the AI:** nothing to paste — **keep the key secret**. Just confirm
  it's set, and I'll treat V-6 as ready for you to run.

---

## Env files (wired 2026-06-14)

- **`apps/mobile/.env.example`** (tracked) + **`apps/mobile/.env.local`** (gitignored)
  carry the three `EXPO_PUBLIC_*` values (client_id + Maincloud host/db). These are
  **non-secret** — `EXPO_PUBLIC_*` is inlined into the app bundle. On your own build
  machine (PowerShell), `Copy-Item apps/mobile/.env.example apps/mobile/.env.local` (the
  container's copy is ephemeral/gitignored).
- **`.env.example`** (repo root, tracked) documents the **secret** server-side vars for
  S-4 (`ANTHROPIC_API_KEY`, optional `AGENTSPACE_GATEWAY_KEK`) — copy to an untracked
  root `.env`.
- **No SpacetimeDB API key exists** — auth is **identity-based**, not key-based, so there's
  nothing SpacetimeDB-related to add to `.env` or GitHub Secrets (see **BLUEPRINT §8.1** /
  DEC-026). The only real secrets are per-user BYOK keys (entered in-app) + the optional
  dev `ANTHROPIC_API_KEY` above.

## On-device test path (after S-1 / S-2 / S-3 ✓)

1. **S-3 ✓** (module published to Maincloud) → **V-5** (login persists) is ready once you
   build a real dev build (`expo run:android`, not Expo Go).
2. **S-5** (run the orchestrator against Maincloud) + add your key in 🔑 **Keys** →
   unblocks **V-7/V-8** (your agent replies with your key — the real BYOK path).
3. **S-4** is **optional** — only for the standalone gateway smoke (**V-6**).
4. **M1.9 (delta-streaming) needs a Maincloud re-publish** — the `reply_delta` table is new, so
   `spacetime publish agentspace-hpm58 -p modules\spacetime --server maincloud --delete-data=on-conflict --yes`
   (fresh test DB; nothing lost). Unblocks **V-13** (long reply settles clean) + **V-14**
   (cancellation). *(The AI can run this re-publish during a local session; bindings are already
   regenerated + committed.)*
5. **M2.1 (multi-agent group threads) needs a Maincloud re-publish — `S-6`** — the new
   `thread_agent` / `episode` / `agent_turn` / `reaper_schedule` tables make this a breaking
   change, so the same `--delete-data=on-conflict` publish + binding regen applies. Required
   before **V-15…V-19** (verified locally first).

*Done: S-1, S-2, **S-3** (module published to Maincloud 2026-06-22). Remaining: **S-6**
(M2.1 Maincloud re-publish — required before V-15…V-19) + **S-5** (run the orchestrator,
for any live agent reply) + the on-device V-checklist. S-4 optional (gateway smoke / V-6 only).*
