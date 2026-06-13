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

// ── Model references (SPEC §4) ───────────────────────────────────────────────
export const MODEL_PROVIDERS = ['anthropic', 'google', 'openai', 'openai-compatible'] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export interface ModelRef {
  provider: ModelProvider;
  /** Provider-specific model id, e.g. "claude-opus-4-8". */
  model: string;
  params?: Record<string, unknown>;
}

/** Default model when an agent doesn't override one (CLAUDE.md model policy). */
export const DEFAULT_MODEL: ModelRef = { provider: 'anthropic', model: 'claude-opus-4-8' };

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
