// Shared contracts for AgentSpace — the lowest layer (imports nothing internal).
// Keep in sync with SPEC.md: changing a contract here is a coupled change across
// every producer/consumer that cites it.

// ── Message lifecycle (SPEC §1) ──────────────────────────────────────────────
export const MESSAGE_STREAM_STATES = ['streaming', 'complete', 'failed'] as const;
export type MessageStreamState = (typeof MESSAGE_STREAM_STATES)[number];

// ── Agent-run state machine (SPEC §2) ────────────────────────────────────────
export const RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

// ── Threads & membership (BLUEPRINT §3) ──────────────────────────────────────
export const THREAD_KINDS = ['dm', 'group'] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

export const MEMBER_ROLES = ['human', 'agent'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

// ── Model references + provider catalog (SPEC §4) ────────────────────────────
// `PROVIDER_CATALOG` is the single source of truth for the providers AgentSpace
// supports. The gateway registry (packages/gateway/src/providers.ts) and the
// mobile UI (AgentEditor / ApiKeys) both derive from it — coupled change.
export const MODEL_PROVIDERS = [
  'anthropic', 'openai', 'google', 'mistral', 'cohere', 'groq', 'xai',
  'deepseek', 'perplexity', 'togetherai', 'fireworks', 'deepinfra', 'cerebras',
  'openai-compatible', 'amazon-bedrock', 'azure', 'google-vertex',
] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export interface ModelRef {
  provider: ModelProvider;
  /** Provider-specific model id, e.g. "claude-opus-4-8". */
  model: string;
  params?: Record<string, unknown>;
}

/** Default model when an agent doesn't override one (CLAUDE.md model policy). */
export const DEFAULT_MODEL: ModelRef = { provider: 'anthropic', model: 'claude-opus-4-8' };

/** How a provider's BYOK credential is supplied. */
export type ProviderCredentialKind =
  | 'apiKey' // a single API key string
  | 'baseUrl' // a local/self-hosted endpoint, key optional — M1.8.2
  | 'multi'; // structured multi-field credentials (sealed as JSON) — M1.8.3

/** A field in a multi-credential provider's BYOK form (kind === 'multi'). */
export interface ProviderField {
  id: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
}

/** UI + wiring metadata for one provider. Model ids are **curated suggestions** —
 *  verify against the provider at runtime; the model field is always free-text. */
export interface ProviderInfo {
  id: ModelProvider;
  label: string;
  kind: ProviderCredentialKind;
  defaultModel: string;
  suggestedModels: readonly string[];
  /** Placeholder shown in the key field (e.g. "sk-ant-…"). */
  keyHint: string;
  /** Where the user obtains a key / credential. */
  getKeyUrl: string;
  /** Placeholder/default endpoint for kind === 'baseUrl' (e.g. a local Ollama URL). */
  defaultBaseUrl?: string;
  /** Multi-credential fields (kind === 'multi'). */
  fields?: readonly ProviderField[];
}

export const PROVIDER_CATALOG: readonly ProviderInfo[] = [
  { id: 'anthropic', label: 'Anthropic', kind: 'apiKey', defaultModel: 'claude-opus-4-8',
    suggestedModels: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    keyHint: 'sk-ant-…', getKeyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', label: 'OpenAI', kind: 'apiKey', defaultModel: 'gpt-4o',
    suggestedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o3-mini'],
    keyHint: 'sk-…', getKeyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'google', label: 'Google Gemini', kind: 'apiKey', defaultModel: 'gemini-2.0-flash',
    suggestedModels: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    keyHint: 'AIza…', getKeyUrl: 'https://aistudio.google.com/app/apikey' },
  { id: 'mistral', label: 'Mistral', kind: 'apiKey', defaultModel: 'mistral-large-latest',
    suggestedModels: ['mistral-large-latest', 'mistral-small-latest', 'open-mistral-nemo', 'codestral-latest'],
    keyHint: '…', getKeyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'cohere', label: 'Cohere', kind: 'apiKey', defaultModel: 'command-r-plus',
    suggestedModels: ['command-r-plus', 'command-r', 'command-a-03-2025'],
    keyHint: '…', getKeyUrl: 'https://dashboard.cohere.com/api-keys' },
  { id: 'groq', label: 'Groq', kind: 'apiKey', defaultModel: 'llama-3.3-70b-versatile',
    suggestedModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'],
    keyHint: 'gsk_…', getKeyUrl: 'https://console.groq.com/keys' },
  { id: 'xai', label: 'xAI (Grok)', kind: 'apiKey', defaultModel: 'grok-3',
    suggestedModels: ['grok-3', 'grok-3-mini', 'grok-2-1212'],
    keyHint: 'xai-…', getKeyUrl: 'https://console.x.ai' },
  { id: 'deepseek', label: 'DeepSeek', kind: 'apiKey', defaultModel: 'deepseek-chat',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    keyHint: 'sk-…', getKeyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'perplexity', label: 'Perplexity', kind: 'apiKey', defaultModel: 'sonar',
    suggestedModels: ['sonar', 'sonar-pro', 'sonar-reasoning'],
    keyHint: 'pplx-…', getKeyUrl: 'https://www.perplexity.ai/settings/api' },
  { id: 'togetherai', label: 'Together.ai', kind: 'apiKey', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    suggestedModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    keyHint: '…', getKeyUrl: 'https://api.together.ai/settings/api-keys' },
  { id: 'fireworks', label: 'Fireworks', kind: 'apiKey', defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    suggestedModels: ['accounts/fireworks/models/llama-v3p3-70b-instruct', 'accounts/fireworks/models/deepseek-v3'],
    keyHint: 'fw_…', getKeyUrl: 'https://fireworks.ai/account/api-keys' },
  { id: 'deepinfra', label: 'DeepInfra', kind: 'apiKey', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
    suggestedModels: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'],
    keyHint: '…', getKeyUrl: 'https://deepinfra.com/dash/api_keys' },
  { id: 'cerebras', label: 'Cerebras', kind: 'apiKey', defaultModel: 'llama-3.3-70b',
    suggestedModels: ['llama-3.3-70b', 'llama3.1-8b'],
    keyHint: '…', getKeyUrl: 'https://cloud.cerebras.ai/platform/' },
  // Local / self-hosted (Ollama / vLLM / LM Studio) — needs a baseURL; key optional (M1.8.2).
  { id: 'openai-compatible', label: 'Local (OpenAI-compatible)', kind: 'baseUrl',
    defaultModel: 'llama3.2', suggestedModels: ['llama3.2', 'qwen2.5', 'mistral', 'deepseek-r1'],
    keyHint: 'optional', getKeyUrl: 'https://ollama.com/download',
    defaultBaseUrl: 'http://localhost:11434/v1' },
  // Multi-credential cloud providers — sealed as a JSON blob of `fields` (M1.8.3).
  { id: 'amazon-bedrock', label: 'Amazon Bedrock', kind: 'multi',
    defaultModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    suggestedModels: ['anthropic.claude-3-5-sonnet-20241022-v2:0', 'amazon.nova-pro-v1:0', 'meta.llama3-3-70b-instruct-v1:0'],
    keyHint: 'AWS credentials', getKeyUrl: 'https://console.aws.amazon.com/iam/home#/security_credentials',
    fields: [
      { id: 'region', label: 'AWS Region', placeholder: 'us-east-1' },
      { id: 'accessKeyId', label: 'Access Key ID', secret: true, placeholder: 'AKIA…' },
      { id: 'secretAccessKey', label: 'Secret Access Key', secret: true, placeholder: '…' },
    ] },
  { id: 'azure', label: 'Azure OpenAI', kind: 'multi',
    defaultModel: 'gpt-4o', suggestedModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
    keyHint: 'resource + key', getKeyUrl: 'https://portal.azure.com/',
    fields: [
      { id: 'resourceName', label: 'Resource Name', placeholder: 'my-resource' },
      { id: 'apiKey', label: 'API Key', secret: true, placeholder: '…' },
    ] },
  { id: 'google-vertex', label: 'Google Vertex AI', kind: 'multi',
    defaultModel: 'gemini-2.0-flash', suggestedModels: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-1.5-pro'],
    keyHint: 'project + key', getKeyUrl: 'https://console.cloud.google.com/vertex-ai',
    fields: [
      { id: 'project', label: 'GCP Project ID', placeholder: 'my-project' },
      { id: 'location', label: 'Location', placeholder: 'us-central1' },
      { id: 'apiKey', label: 'API Key', secret: true, placeholder: '…' },
    ] },
];

/** Catalog lookup by provider id (undefined for an unknown/not-yet-enabled id). */
export function providerInfo(id: string): ProviderInfo | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === id);
}

// ── Tool / toolkit schema (SPEC §5) ──────────────────────────────────────────
export const TOOL_SOURCES = ['function', 'mcp'] as const;
export type ToolSource = (typeof TOOL_SOURCES)[number];

export const TOOL_SIDE_EFFECTS = ['none', 'external', 'destructive'] as const;
export type ToolSideEffect = (typeof TOOL_SIDE_EFFECTS)[number];

export const TOOL_APPROVALS = ['auto', 'ask'] as const;
export type ToolApproval = (typeof TOOL_APPROVALS)[number];

export interface ToolSpec {
  /** Unique within an agent's toolkit. */
  name: string;
  /** Prescriptive: when to call it (the model reads this). */
  description: string;
  /** JSON Schema (object; additionalProperties:false). */
  inputSchema: Record<string, unknown>;
  source: ToolSource;
  sideEffects: ToolSideEffect;
  approval: ToolApproval;
}

// ── Multi-agent addressing & episode budget (SPEC §3; DEC-031) ────────────────
// Structured mentions ride on a human message; the orchestrator resolves them to
// the agents that should reply. MVP addresses agents + the synthetic @everyone;
// @human is deferred (humans don't auto-respond), so the composer never emits it.
export const MENTION_KINDS = ['agent', 'human', 'all'] as const;
export type MentionKind = (typeof MENTION_KINDS)[number];

export interface Mention {
  kind: MentionKind;
  /** kind 'agent' → agent.id; 'all' (@everyone) → 0n; 'human' (deferred) → member ref. */
  ref: bigint;
  /** UTF-16 offset of the @token in `message.text`. */
  start: number;
  /** Length of the @token (so the client can re-style it). */
  len: number;
}

// Episode-budget dials (DEC-031 — starting defaults, tune after V-16). This is the
// CLIENT/orchestrator copy; the SpacetimeDB reducer re-declares the same values
// inline (`modules/spacetime/src/index.ts`) because the WASM module cannot import
// this package — the two MUST stay in sync (coupled feature, CLAUDE.md §8).
/** Hard ceiling on agent turns per human-rooted episode (loop bound). */
export const MAX_TURNS_HARD = 8;
/** Max concurrently-`running` agent runs per thread (reducer-side backstop). */
export const MAX_CONCURRENT = 2;
/** Per-run output-token cap handed to the gateway (bounds one runaway run). */
export const MAX_OUTPUT_TOKENS_PER_RUN = 2000;
/** Episode-wide token budget, summed across runs (u64). */
export const EPISODE_TOKEN_CEILING = 50_000n;
/** Per-(agent,thread) cooldown — reserved; enforcement deferred (M2.x). */
export const AGENT_COOLDOWN_MS = 3000;
/** Reaper: a `streaming` message / `running` run older than this is failed out. */
export const STREAM_TTL_MS = 120_000;

/** The episode fields the begin-decision reads (kept binding-free for tests). */
export interface EpisodeView {
  status: 'open' | 'closed';
  turnsRemaining: number; // u8
  tokenBudgetRemaining: bigint; // u64
}

export type BeginRejectReason =
  | 'episode_closed'
  | 'turns_exhausted'
  | 'budget_exhausted'
  | 'already_replied'
  | 'concurrency_cap';

export type BeginDecision = { ok: true } | { ok: false; reason: BeginRejectReason };

/**
 * The pre-execution budget gate for an agent reply (DEC-031). The SpacetimeDB
 * reducer `agent_reply_begin` inlines this exact ordered logic against `ctx.db`;
 * this pure mirror is what the orchestrator pre-flights with and what CI unit-tests.
 * Order is deliberate: a closed/exhausted episode short-circuits before the
 * per-agent and concurrency checks so the rejection reason is the most specific.
 */
export function evaluateBegin(args: {
  episode: EpisodeView | undefined;
  /** Runs already `running` in this thread (for the concurrency cap). */
  runningInThread: number;
  /** True if this agent already took its turn in this episode (once-per-episode). */
  agentAlreadyReplied: boolean;
  maxConcurrent?: number;
}): BeginDecision {
  const maxConcurrent = args.maxConcurrent ?? MAX_CONCURRENT;
  if (!args.episode || args.episode.status !== 'open') return { ok: false, reason: 'episode_closed' };
  if (args.episode.turnsRemaining <= 0) return { ok: false, reason: 'turns_exhausted' };
  if (args.episode.tokenBudgetRemaining <= 0n) return { ok: false, reason: 'budget_exhausted' };
  if (args.agentAlreadyReplied) return { ok: false, reason: 'already_replied' };
  if (args.runningInThread >= maxConcurrent) return { ok: false, reason: 'concurrency_cap' };
  return { ok: true };
}

// ── Connection reconnect (BL-022 / M2.5) ─────────────────────────────────────
// Shared by BOTH runtimes: the mobile ConnectionGate (apps/mobile/src/reconnect.ts)
// and the orchestrator supervisor (services/orchestrator/src/supervise.ts). The
// SpacetimeDB SDK has no built-in auto-reconnect (it caches a connection by
// (uri, moduleName) and on disconnect only flips isActive=false), so each side must
// rebuild a fresh connection after a drop, pacing retries with this backoff.

/** Exponential-backoff reconnect defaults (ms). */
export const RECONNECT = {
  /** Ceiling for the first retry's jittered delay. */
  baseMs: 1000,
  /** Growth multiplier per attempt. */
  factor: 2,
  /** Hard upper bound on any single delay. */
  capMs: 30_000,
} as const;

export interface BackoffOpts {
  baseMs?: number;
  factor?: number;
  capMs?: number;
  /** Injectable RNG in [0,1) for deterministic tests (defaults Math.random). */
  rand?: () => number;
}

/**
 * Full-jitter exponential backoff: returns a whole-millisecond delay uniformly in
 * [0, ceiling], where ceiling = min(capMs, baseMs · factor^attempt). `attempt` is
 * 0-based (0 = the first retry). Full jitter (vs none) de-synchronizes many clients
 * reconnecting to one server after a shared outage. A large `attempt` is safe — the
 * exponential overflows to Infinity and the cap clamps it, so the caller need not
 * bound the attempt counter.
 */
export function nextBackoff(attempt: number, opts: BackoffOpts = {}): number {
  const baseMs = opts.baseMs ?? RECONNECT.baseMs;
  const factor = opts.factor ?? RECONNECT.factor;
  const capMs = opts.capMs ?? RECONNECT.capMs;
  const rand = opts.rand ?? Math.random;
  const ceiling = Math.min(capMs, baseMs * Math.pow(factor, Math.max(0, attempt)));
  return Math.floor(rand() * ceiling);
}

// A tiny phase machine the mobile ConnectionGate drives off the SDK's connection
// state. Pure so CI can prove the transitions without a React/RN runtime; the gate
// only owns the side effects (timers, token refresh, provider remount).
export type ReconnectPhase = 'connecting' | 'up' | 'reconnecting' | 'authLost';

export interface ReconnectState {
  phase: ReconnectPhase;
  /** 0-based retry counter; feeds nextBackoff. Reset to 0 on a successful connect. */
  attempt: number;
  /** Bumped to force the provider to remount with a fresh connection builder. */
  nonce: number;
}

export type ReconnectEvent =
  | 'connected' // provider reached isActive
  | 'dropped' // active→inactive transition, or a connect error
  | 'backoffElapsed' // the reconnecting timer fired + token refresh OK → remount
  | 'refreshFailed' // token refresh failed → auth is invalid, fall back to Login
  | 'appForegrounded'; // app returned to foreground → retry immediately

export const INITIAL_RECONNECT: ReconnectState = { phase: 'connecting', attempt: 0, nonce: 0 };

/**
 * Drives the gate's phase. The component schedules a `nextBackoff(state.attempt)`
 * timer whenever it enters `reconnecting`; when the timer fires it refreshes the id
 * token and dispatches `backoffElapsed` (success) or `refreshFailed`. `attempt` grows
 * across failed remounts (longer gaps) and resets to 0 once a connection sticks.
 */
export function reconnectReducer(state: ReconnectState, event: ReconnectEvent): ReconnectState {
  switch (event) {
    case 'connected':
      return { ...state, phase: 'up', attempt: 0 };
    case 'dropped':
      // Begin a reconnect from a live/connecting state; ignore a duplicate drop while
      // already reconnecting or after auth was lost.
      return state.phase === 'up' || state.phase === 'connecting'
        ? { ...state, phase: 'reconnecting' }
        : state;
    case 'backoffElapsed':
      // Remount with a fresh builder; grow attempt so the next gap is longer if this
      // remount also fails to stick.
      return state.phase === 'reconnecting'
        ? { phase: 'connecting', attempt: state.attempt + 1, nonce: state.nonce + 1 }
        : state;
    case 'refreshFailed':
      return { ...state, phase: 'authLost' };
    case 'appForegrounded':
      // Network is likely back — retry now with a reset backoff.
      return state.phase === 'reconnecting'
        ? { phase: 'connecting', attempt: 0, nonce: state.nonce + 1 }
        : state;
    default:
      return state;
  }
}

// ── Agent presence / typing (M2.2) ───────────────────────────────────────────
// A human-readable "who is currently replying" label, derived client-side from the
// streaming agent message rows (no presence table — agents have no `user.online`;
// per-agent identity/presence is M2.4). Pure so CI covers the pluralization.

/**
 * Format the set of agent names currently streaming a reply into a status label.
 * 0 → null (show nothing); 1 → "Aria is thinking…"; 2 → "Aria & Banjo are thinking…";
 * ≥3 → "3 agents are thinking…". Names are used as-is — the caller maps an unresolved
 * / cross-owner agent to "Agent" (BL-021).
 */
export function thinkingLabel(names: readonly string[]): string | null {
  switch (names.length) {
    case 0:
      return null;
    case 1:
      return `${names[0]} is thinking…`;
    case 2:
      return `${names[0]} & ${names[1]} are thinking…`;
    default:
      return `${names.length} agents are thinking…`;
  }
}
