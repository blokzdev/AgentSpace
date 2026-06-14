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
> **DONE.** Redirect URI `agentspace://redirect` registered (matches
> `makeRedirectUri({ scheme: 'agentspace', path: 'redirect' })` in `src/auth.ts` ✔).
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

### S-3 — Publish the module to Maincloud `agentspace-hpm58`  ·  added 2026-06-13 · M1.2  ·  [ ] (FOUNDER — AI is blocked)
- **Why:** `DbConnection.withToken(idToken)` only succeeds against a server that
  **trusts the SpacetimeAuth issuer** — that's Maincloud, not a local
  `spacetime start`. So login + the agent reply loop must run against Maincloud.
- **AI attempted 2026-06-14 → blocked:** the module **builds clean**, but publishing
  to Maincloud returned **`401 Unauthorized: Invalid token: InvalidSignature`** — this
  container is logged in as a different identity, **not your `blokzdev` Maincloud
  account** (which owns `agentspace-hpm58`). So this step is **yours**: run it from a
  machine where `spacetime login` is your Maincloud/`blokzdev` account.
- **Steps (founder):**
  1. From `modules/spacetime/` (logged in as `blokzdev`):
     `spacetime publish agentspace-hpm58 -p . --server maincloud --yes`
  2. If it warns about a **breaking schema change with existing data**, decide whether
     to wipe: add `--delete-data=on-conflict` (destroys current data — only if you're OK
     with that). For a fresh DB there's nothing to lose.
  3. Confirm it's live: `spacetime logs agentspace-hpm58 --server maincloud`, or the
     Maincloud console shows the tables (`user`, `thread`, `agent`, …).
- **Give back to the AI:** confirm it published. The env values are already set
  (`apps/mobile/.env.local`: host `wss://maincloud.spacetimedb.com`, db
  `agentspace-hpm58`). Then V-5/V-7/V-8 are ready.

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
  2. Create an untracked `.env` at the repo root (or export in your shell) with the
     matching variable: **`ANTHROPIC_API_KEY=sk-ant-…`** (or `OPENAI_API_KEY=…`).
     The smoke harness reads `<PROVIDER>_API_KEY` for the default model's provider.
- **Give back to the AI:** nothing to paste — **keep the key secret**. Just confirm
  it's set, and I'll treat V-6 as ready for you to run.

---

## Env files (wired 2026-06-14)

- **`apps/mobile/.env.example`** (tracked) + **`apps/mobile/.env.local`** (gitignored)
  carry the three `EXPO_PUBLIC_*` values (client_id + Maincloud host/db). These are
  **non-secret** — `EXPO_PUBLIC_*` is inlined into the app bundle. On your own build
  machine, `cp apps/mobile/.env.example apps/mobile/.env.local` (the container's copy is
  ephemeral/gitignored).
- **`.env.example`** (repo root, tracked) documents the **secret** server-side vars for
  S-4 (`ANTHROPIC_API_KEY`, optional `AGENTSPACE_GATEWAY_KEK`) — copy to an untracked
  root `.env`.

*Remaining: S-3 (founder Maincloud publish) and S-4 (provider key). After S-1…S-3 +
the env values, the on-device login check is `VERIFICATION.md` V-5; after S-4, the
gateway smoke is V-6; V-7/V-8 (live agent reply) need S-3 + S-4.*
