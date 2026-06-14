// Pure helpers for the agent reply loop (SPEC §6) — no SpacetimeDB/network deps,
// so the loop's logic is unit-testable in CI.
import type { GatewayMessage } from '@agentspace/gateway';
import { DEFAULT_MODEL, MODEL_PROVIDERS, type ModelProvider, type ModelRef } from '@agentspace/shared';

/** Minimal view of a thread message for prompt assembly. */
export interface PromptRow {
  /** True if this row was written by the agent itself. */
  isAgent: boolean;
  text: string;
  /** `message.sent.microsSinceUnixEpoch` — used only for ordering. */
  sentMicros: bigint;
}

export const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful AI assistant living inside AgentSpace, a real-time chat app. ' +
  'Reply concisely and conversationally to the most recent message.';

/** Assemble the gateway prompt from a thread's messages (oldest→newest). */
export function buildPrompt(rows: PromptRow[], system: string = DEFAULT_SYSTEM_PROMPT): GatewayMessage[] {
  const ordered = [...rows].sort((a, b) => (a.sentMicros < b.sentMicros ? -1 : a.sentMicros > b.sentMicros ? 1 : 0));
  const turns: GatewayMessage[] = [];
  for (const r of ordered) {
    if (r.text.length === 0) continue; // skip empty in-flight streaming rows
    turns.push({ role: r.isAgent ? 'assistant' : 'user', content: r.text });
  }
  return [{ role: 'system', content: system }, ...turns];
}

/** The persona the orchestrator replies as (M1.5). */
export interface Persona {
  systemPrompt: string;
  model: ModelRef;
}

/** Minimal views of the rows `selectPersona` reads (kept binding-free for tests). */
export interface ThreadRef {
  id: bigint;
  agentId: bigint;
}
export interface AgentRef {
  id: bigint;
  systemPrompt: string;
  provider: string;
  model: string;
}

const isProvider = (p: string): p is ModelProvider => (MODEL_PROVIDERS as readonly string[]).includes(p);

/**
 * Resolve the persona bound to a thread (via `thread.agentId` → the agent config),
 * falling back to the seeded default when no valid persona is bound.
 */
export function selectPersona(threads: ThreadRef[], agents: AgentRef[], threadId: bigint): Persona {
  const agentId = threads.find((t) => t.id === threadId)?.agentId ?? 0n;
  if (agentId !== 0n) {
    const a = agents.find((x) => x.id === agentId);
    if (a && isProvider(a.provider)) {
      return {
        systemPrompt: a.systemPrompt.length > 0 ? a.systemPrompt : DEFAULT_SYSTEM_PROMPT,
        model: { provider: a.provider, model: a.model },
      };
    }
  }
  return { systemPrompt: DEFAULT_SYSTEM_PROMPT, model: DEFAULT_MODEL };
}

let runCounter = 0;
/** Client-owned reply correlation key (so the orchestrator never needs the row id). */
export function newRunId(selfHex: string): string {
  runCounter += 1;
  return `${selfHex.slice(0, 12)}-${Date.now().toString(36)}-${runCounter}`;
}

export interface Batcher {
  /** Record the latest cumulative text; schedules a flush. */
  push(text: string): void;
  /** Flush the pending text now (if any). */
  flush(): void;
  /** Flush and stop the timer. */
  stop(): void;
}

/**
 * Coalescing batcher: flushes the *latest* cumulative text at most once per
 * `intervalMs` (BLUEPRINT §5 — ~50ms windows), collapsing bursts of token deltas
 * into a single STDB UPDATE.
 */
export function createBatcher(opts: { onFlush: (text: string) => void; intervalMs: number }): Batcher {
  let pending: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = (): void => {
    if (pending !== null) {
      const text = pending;
      pending = null;
      opts.onFlush(text);
    }
  };

  return {
    push(text: string): void {
      pending = text;
      timer ??= setInterval(tick, opts.intervalMs);
    },
    flush(): void {
      tick();
    },
    stop(): void {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      tick();
    },
  };
}
