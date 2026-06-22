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
