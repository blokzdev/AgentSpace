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

### S-1 — Enable SpacetimeAuth on `agentspace-hpm58` + get the `client_id`  ·  added 2026-06-13 · M1.2  ·  [ ]
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

### S-2 — Register the mobile redirect URI on that Client  ·  added 2026-06-13 · M1.2  ·  [ ]
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

### S-3 — Confirm the `agentspace` module is published to Maincloud  ·  added 2026-06-13 · M1.2  ·  [ ]
- **Why:** `DbConnection.withToken(idToken)` only succeeds against a server that
  **trusts the SpacetimeAuth issuer** — that's Maincloud, not a local
  `spacetime start`. So the device test must point at your Maincloud DB.
- **Where:** **terminal** (SpacetimeDB CLI), one-time publish.
- **Steps:**
  1. From `modules/spacetime`, publish to Maincloud (logged in as `blokzdev`):
     `spacetime publish agentspace-hpm58 -p . --server maincloud --yes`
     (use whatever server alias your CLI has for Maincloud; `spacetime server
     list` shows it).
  2. Confirm it's live: `spacetime logs agentspace-hpm58 --server maincloud` or
     the Maincloud console shows the tables.
- **Give back to the AI:** confirm the module name to target. For the device test
  I'll have you set `EXPO_PUBLIC_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com`
  and `EXPO_PUBLIC_SPACETIMEDB_DB_NAME=agentspace-hpm58` in `apps/mobile/.env.local`.

---

### S-4 — Provide a provider API key for the Model Gateway smoke test  ·  added 2026-06-13 · M1.4  ·  [ ]
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

*(When S-1…S-3 are done and you've set the three `EXPO_PUBLIC_*` values, the
on-device login check is `VERIFICATION.md` V-5. When S-4 is set, the gateway smoke
is `VERIFICATION.md` V-6.)*
