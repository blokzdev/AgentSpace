# On-device verification runbook (Android emulator)

> The reproducible loop for driving the AgentSpace app on the **Pixel_8** emulator via
> `adb`, to verify on-device behavior CI can't reach. Read this first — it encodes
> hard-won setup + gotchas so a fresh session doesn't rediscover them. Pairs with the
> founder-owned `VERIFICATION.md` (V-items) and the personal memory
> `android-emulator-automation-gotchas`.

## TL;DR — the unlock (local-dev mode)

The dev-client over **Maincloud** is flaky (the WS drops → stuck "Connecting…", BL-022).
The reliable path is **local-dev mode**: point the app at a local `spacetime start`
server. `App.tsx` treats a **local host** (`10.0.2.2` / `127.0.0.1` / `localhost`) as
**anonymous connect — no OIDC** (a local server doesn't run SpacetimeAuth), over a stable
loopback. Maincloud keeps the full SpacetimeAuth login (whose hosted page also has an
**"Anonymous login"** button → "Authorize → Allow" — no account credentials needed, if you
must test vs Maincloud). The anon token is persisted (`LocalDevTokenSync`) so the identity
survives reloads.

## Tools (Windows; adb/emulator are NOT on the Bash PATH)

- adb: `C:\Users\<you>\AppData\Local\Android\Sdk\platform-tools\adb.exe`
- emulator: `…\Android\Sdk\emulator\emulator.exe`; AVDs: `Pixel_8`, `Pixel_3a_API_34…`
- JDK 21 (`JAVA_HOME`), Android Studio JBR also present.

## Bring up the environment

1. **Emulator:** `Start-Process "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -ArgumentList '-avd','Pixel_8'`
   then wait for `adb shell getprop sys.boot_completed` == `1`. App pkg: `com.agentspace.probe`.
2. **Local server + module:** `spacetime start` (background). Publish the module to local
   (new tables ⇒ `--delete-data`): `spacetime publish agentspace -p modules/spacetime --server local --delete-data=on-conflict --yes`.
3. **Orchestrator vs local:** `Remove-Item Env:ANTHROPIC_BASE_URL` (else Anthropic 404s), then
   `pnpm --filter @agentspace/orchestrator start` (defaults to `ws://127.0.0.1:3000` / db `agentspace`).
   It connects anonymously + serves replies. NOTE: it currently **exits on an idle/dropped socket**
   (OT-007 / BL-022) — restart it right before triggering a reply.
4. **Mobile (Metro with the local env):** in `apps/mobile/.env.local`, comment the Maincloud
   `EXPO_PUBLIC_SPACETIMEDB_HOST/DB_NAME` and uncomment the `ws://10.0.2.2:3000` / `agentspace`
   lines (Metro reads `.env.local` **at startup** — restart Metro after editing). Then
   `pnpm --filter @agentspace/mobile start`. **Restore `.env.local` to Maincloud when done.**
5. **Link + launch:** `adb reverse tcp:8081 tcp:8081`, then
   `adb shell monkey -p com.agentspace.probe -c android.intent.category.LAUNCHER 1`. First bundle ~30–60s.
   A pure-JS change just needs a Metro reload (force-stop + relaunch) — no native rebuild.

## Drive the UI (adb recipe)

- **Screenshot:** `powershell -NoProfile -File apps/mobile/scripts/shot.ps1` → writes a downscaled,
  viewable PNG to `.tmp/s1.png` (binary-safe capture via a `cmd` redirect — PowerShell `>` corrupts
  binary; downscaled <2000px for the image viewer). View it.
- **Coords:** the shot is 486px wide; the Pixel_8 is 1080×2400, so multiply shot-pixel (x,y) by **~2.222**
  for `adb shell input tap X Y`.
- **Type:** `adb shell input text "with%sspaces"` — **`%s` for every space**. Avoid apostrophes/quotes.
- **Hide keyboard:** `adb shell input keyevent 111`. **Don't hardware-BACK on a top screen** (exits the app).

## The M2.1 multi-agent flow

anonymous connect → **🔑 Keys** (enter a real provider key → ✓ key set) → **🤖 Agents** (+ New ×2 distinct
personas, e.g. a factual one + a rhyming one; pick the **Haiku** model chip for cost/speed) → **New group**
(jumps to members) → **+ Add agent 🤖** ×2 → open the group thread → composer **@** triggers the mention
typeahead (everyone / each agent) → send `@A @B …`.

## Verify via the DB (RELIABLE — the live render can stall, BL-022)

The dev-client subscription may **freeze mid-stream** (render shows only the 1st agent + a stuck cursor) —
that's BL-022, not an M2.1 bug. **Confirm behavior against the DB**, not just the render:

```
spacetime sql --server local agentspace "SELECT id, stream_state, agent_id, episode_id FROM message"
spacetime sql --server local agentspace "SELECT status, agent_id, episode_id, output_tokens FROM run"
spacetime sql --server local agentspace "SELECT id, status, turns_remaining, token_budget_remaining FROM episode"
```

The CLI default server may be Maincloud — pass `--server local`. The local DB **accumulates across runs**;
filter by the newest `episode_id` / `agent_id`. Expect: each addressed agent has a `complete` message
tagged with its `agent_id`, its run `succeeded`, the episode's `turns_remaining` decremented by the reply
count, and an agent↔agent volley capped at ≤ #agents (the `agent_turn` bound). A reload (token persisted)
re-subscribes and re-renders from the DB if the live view stalled.

## Known blockers / notes

- **BL-022** (connection resilience): the app's WS drop → stuck "Connecting…", + the live-subscription
  stall, + the orchestrator exiting on drop. The real fix; until then, local-dev + DB-verify is the loop.
- **Release APK** (no Metro, more stable): `expo run:android --variant release` needs
  `apps/mobile/android/local.properties` → `sdk.dir=…/Android/Sdk` (gitignored), but currently **fails JS
  bundling** (`createBundleReleaseJsAndAssets` → `export:embed` can't resolve `../../index.ts` under
  pnpm-hoisted + package-exports, BL-009-adjacent). Fix that before relying on a release-APK harness.
