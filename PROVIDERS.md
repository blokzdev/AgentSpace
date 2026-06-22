# PROVIDERS.md — Provider & credential setup guide

> How to obtain and enter a credential for every model provider AgentSpace supports
> (M1.8 / DEC-028). The supported set is the single **`PROVIDER_CATALOG`** in
> `@agentspace/shared`; this doc expands each entry into get-a-key steps. Owns:
> **provider credential acquisition + entry**. (Roadmap/sequencing lives in `ROADMAP.md`;
> the security model lives in `BLUEPRINT.md` §4/§8.1.)

---

## How BYOK works here (read first)

- **You enter keys in the app: 🔑 Keys** (thread-list header). The raw key is **sealed
  on-device** (NaCl box → the orchestrator's public key) and stored as **ciphertext only**
  in SpacetimeDB — the raw key **never** touches the DB, CI, or any committed file (DEC-025).
- An **agent** picks a **provider + model** (🤖 Agents → New). It uses **your** key for that
  provider. No key set → the agent replies "⚠️ add an API key…".
- Three credential shapes (catalog `kind`):
  - **`apiKey`** — one secret string (the 13 cloud providers below).
  - **`baseUrl`** — a local endpoint, key optional (Ollama / vLLM / LM Studio).
  - **`multi`** — several fields, sealed together as JSON (Bedrock / Azure / Vertex).
- **The orchestrator must be running** when you save a key (it publishes the public key you
  seal to). If 🔑 Keys says "agent service isn't running yet", start it (SETUP S-5).

**Providing keys to the AI (local session).** For autonomous on-device tests, enter the key
**in the app** (🔑 Keys) — sealed, never seen in plaintext by anyone. For a headless gateway
smoke only, a key may go in an **untracked root `.env`** (`<PROVIDER>_API_KEY=…`). **Never
commit a key**; `.env*` is gitignored. The AI will name the exact variable and never writes a
key into a tracked file.

---

## Tier 1 — Single-API-key cloud providers (🔑 Keys → one secret)

Enter in the app under 🔑 **Keys** (each card has a **Get a key →** link). Free-tier notes
are *as of 2026-06 — verify on the provider's site.*

| Provider | Get a key | Key format | Notes |
|----------|-----------|-----------|-------|
| **Anthropic** | console.anthropic.com → Settings → API Keys | `sk-ant-…` | Default model `claude-opus-4-8`. Paid; small trial credit. |
| **OpenAI** | platform.openai.com/api-keys | `sk-…` | Paid (prepaid credits). Models `gpt-4o`, `o3-mini`, … |
| **Google Gemini** | aistudio.google.com/app/apikey | `AIza…` | **Generous free tier** (AI Studio). Models `gemini-2.0-flash`, … |
| **Mistral** | console.mistral.ai/api-keys | (opaque) | Free tier available. `mistral-large-latest`, `codestral-latest`. |
| **Cohere** | dashboard.cohere.com/api-keys | (opaque) | Free trial keys. `command-r-plus`. |
| **Groq** | console.groq.com/keys | `gsk_…` | **Free tier**, very fast. `llama-3.3-70b-versatile`. |
| **xAI (Grok)** | console.x.ai | `xai-…` | Paid; trial credit. `grok-3`, `grok-3-mini`. |
| **DeepSeek** | platform.deepseek.com/api_keys | `sk-…` | Cheap. `deepseek-chat`, `deepseek-reasoner`. |
| **Perplexity** | perplexity.ai/settings/api | `pplx-…` | Paid; web-grounded `sonar` models. |
| **Together.ai** | api.together.ai/settings/api-keys | (opaque) | Free trial credit; many OSS models. |
| **Fireworks** | fireworks.ai/account/api-keys | `fw_…` | Free trial credit; OSS models. |
| **DeepInfra** | deepinfra.com/dash/api_keys | (opaque) | Cheap OSS hosting. |
| **Cerebras** | cloud.cerebras.ai/platform | (opaque) | **Free tier**, extremely fast. `llama-3.3-70b`. |

**Cheapest path to test something non-Anthropic (V-10):** **Groq**, **Gemini**, or
**Cerebras** all have a usable free tier — grab one key, save it in 🔑 Keys, make an agent on
that provider, chat.

**Steps (each):** 🔑 Keys → the provider's card → **Get a key →** (opens its console) → create
a key → paste into the card → **Save** (look for "✓ key set").

---

## Tier 2 — Local / OpenAI-compatible (your own machine; no cloud key)

Runs a model on **your host** (e.g. the RTX 4070) via **Ollama** (or vLLM / LM Studio), which
serves an OpenAI-compatible endpoint. **The Android emulator needs no GPU** — Ollama + the
orchestrator run on the host; the emulator is just the chat client.

1. **Install Ollama:** https://ollama.com/download (Windows installer).
2. **Pull a model:** `ollama pull llama3.2` (or `qwen2.5`, `mistral`, `deepseek-r1`). Ollama
   serves `http://localhost:11434/v1`.
3. **Run the orchestrator on the same host** (SETUP S-5).
4. In the app: 🤖 **Agents** → **+ New** → provider **Local (OpenAI-compatible)** → a **Base
   URL** field appears (default `http://localhost:11434/v1`) → set **model** to your pulled
   model (e.g. `llama3.2`) → **Create** → **Chat**. *(No key needed.)*

> Note: a per-agent `agent.base_url` column was added (M1.8.2), so after pulling this you must
> **re-publish the module to Maincloud once** — `spacetime publish agentspace-hpm58 -p .
> --server maincloud --delete-data=on-conflict --yes`. (Verification: **V-11**.)

---

## Tier 3 — Multi-credential providers (🔑 Keys → a form, sealed as JSON)

These need **several fields** (not a single key). In 🔑 Keys, scroll to **Multi-credential
providers**, fill the fields, **Save** (sealed together as one JSON blob). For the agent's
**model**, see each provider's note. (Verification: **V-12**.)

### Amazon Bedrock — fields: `region`, `accessKeyId`, `secretAccessKey`
1. AWS console → **IAM** → your user → **Security credentials** → **Create access key**
   (https://console.aws.amazon.com/iam/home#/security_credentials). You get an **Access Key
   ID** + **Secret Access Key**.
2. **Enable model access**: Bedrock console → **Model access** → request/enable the models you
   want (e.g. Anthropic Claude, Amazon Nova) in your **region**.
3. In 🔑 Keys → Amazon Bedrock: enter `region` (e.g. `us-east-1`), the access key id, the
   secret. **Model** = a Bedrock model id, e.g. `anthropic.claude-3-5-sonnet-20241022-v2:0`.

### Azure OpenAI — fields: `resourceName`, `apiKey`
1. Azure portal (https://portal.azure.com/) → create an **Azure OpenAI** resource → note its
   **resource name** (the `<name>` in `https://<name>.openai.azure.com`).
2. **Keys and Endpoint** → copy **Key 1** (the `apiKey`).
3. **Deploy a model**: Azure AI Studio → Deployments → create a deployment (give it a name).
4. In 🔑 Keys → Azure OpenAI: enter `resourceName` + `apiKey`. **Model** = your **deployment
   name** (not the base model id).

### Google Vertex AI — fields: `project`, `location`, `apiKey`
1. Google Cloud console → enable the **Vertex AI API** for a **project**
   (https://console.cloud.google.com/vertex-ai); note the **project id** + a **location**
   (e.g. `us-central1`).
2. Create a **Vertex AI API key** (Vertex "Express mode" / API keys) — or use a service
   account if you run the orchestrator in a GCP-authed environment (ADC).
3. In 🔑 Keys → Google Vertex AI: enter `project`, `location`, `apiKey`. **Model** =
   `gemini-2.0-flash`, etc.

> Bedrock/Azure/Vertex add **no** SpacetimeDB schema change — the multi-field credential is
> sealed as JSON into the same `provider_key` row, so nothing to re-publish for these.

---

## Security recap

- Keys/credentials are entered **in-app**, **sealed on-device**, stored as **ciphertext** in
  STDB, decrypted **only in-memory** by the orchestrator at call time — never logged, never on
  the device unsealed, never in CI (BLUEPRINT §4 / DEC-025).
- The **only** non-app key path is an untracked root `.env` for the standalone gateway smoke
  (V-6). Nothing provider-related ever goes in a committed file or GitHub Secrets (§8.1).
