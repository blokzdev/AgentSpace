// Pure helpers for the agent reply loop (SPEC §6) — no SpacetimeDB/network deps,
// so the loop's logic is unit-testable in CI.
import type { GatewayMessage } from '@agentspace/gateway';
import { DEFAULT_MODEL, MODEL_PROVIDERS, type ModelProvider, type ModelRef } from '@agentspace/shared';

/**
 * Minimal view of a thread message for prompt assembly. Under one shared
 * orchestrator identity, "is this the agent's own turn?" CANNOT be derived from
 * the sender — every agent shares `self` (persona-bleed, DEC-031). It is derived
 * here from the `agentId` TAG instead: a row is the target agent's own turn iff
 * `agentId === targetAgentId`. Humans carry `agentId === 0n`.
 */
export interface PromptRow {
  /** `message.id` — stable tiebreak when two rows share `sentMicros`. */
  id: bigint;
  /** Authoring agent's id (0n for a human message) — drives role-assignment by TAG. */
  agentId: bigint;
  /** Sender display name (persona name or human display name) for inline name-tags. */
  senderName: string;
  text: string;
  /** `message.sent.microsSinceUnixEpoch` — primary ordering key. */
  sentMicros: bigint;
}

export const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful AI assistant living inside AgentSpace, a real-time chat app. ' +
  'Reply concisely and conversationally to the most recent message.';

/** Options for assembling a per-agent prompt (one agent's view of the thread). */
export interface BuildPromptOpts {
  /** The agent we are generating a reply FOR — its rows become `assistant`, all else `user`. */
  targetAgentId: bigint;
  /** Base persona system prompt (a roster footer is appended in group mode). */
  system?: string;
  /** The target agent's own display name (for the roster footer). */
  selfName?: string;
  /** Other participants' display names. Non-empty ⇒ GROUP mode (name-tags + footer). */
  roster?: string[];
}

const byTimeThenId = (a: PromptRow, b: PromptRow): number =>
  a.sentMicros !== b.sentMicros
    ? a.sentMicros < b.sentMicros
      ? -1
      : 1
    : a.id < b.id
      ? -1
      : a.id > b.id
        ? 1
        : 0;

function composeSystem(opts: BuildPromptOpts, groupMode: boolean): string {
  const base = opts.system && opts.system.length > 0 ? opts.system : DEFAULT_SYSTEM_PROMPT;
  if (!groupMode) return base;
  const lines = [base, ''];
  if (opts.selfName && opts.selfName.length > 0) lines.push(`You are "${opts.selfName}" in a group chat.`);
  lines.push(`Other participants: ${(opts.roster ?? []).join(', ')}.`);
  lines.push(
    'Messages from others are prefixed with their name (e.g. "Alice: ..."). ' +
      'Reply as yourself only — do not prefix your reply with your own name, and never speak for anyone else.',
  );
  return lines.join('\n');
}

/**
 * Assemble one agent's gateway prompt from a thread's messages (oldest→newest).
 * In DM mode (empty roster) this reduces to the pre-M2 behavior — plain content,
 * no name-tags, no footer. In GROUP mode it name-tags non-self turns ("Name: …"),
 * merges consecutive same-role turns (provider alternation), and appends a roster
 * footer. The conversation is trimmed to start and end on a `user` turn.
 */
export function buildPrompt(rows: PromptRow[], opts: BuildPromptOpts): GatewayMessage[] {
  const groupMode = (opts.roster?.length ?? 0) > 0;
  const ordered = [...rows].sort(byTimeThenId);
  const merged: GatewayMessage[] = [];
  for (const r of ordered) {
    if (r.text.length === 0) continue; // skip empty in-flight streaming rows
    const isSelf = r.agentId !== 0n && r.agentId === opts.targetAgentId;
    const role: GatewayMessage['role'] = isSelf ? 'assistant' : 'user';
    const name = r.senderName.length > 0 ? r.senderName : r.agentId !== 0n ? 'Agent' : 'User';
    const content = !isSelf && groupMode ? `${name}: ${r.text}` : r.text;
    const last = merged[merged.length - 1];
    // Merge consecutive same-role turns so the convo strictly alternates.
    if (last && last.role === role) last.content = `${last.content}\n\n${content}`;
    else merged.push({ role, content });
  }
  // Most providers reject a prompt that doesn't alternate user→assistant; trim any
  // assistant turns at the head (no preceding user) or tail (assistant-prefill end).
  while (merged.length > 0 && merged[merged.length - 1].role === 'assistant') merged.pop();
  while (merged.length > 0 && merged[0].role === 'assistant') merged.shift();
  return [{ role: 'system', content: composeSystem(opts, groupMode) }, ...merged];
}

/**
 * Stop sequences that keep a model from ventriloquizing the OTHER participants —
 * if it starts a new "Name:" line we cut the stream there. Providers cap the count
 * (Anthropic ≤ a handful), so the caller should slice to a small number.
 */
export function mentionStops(otherNames: string[]): string[] {
  return otherNames.filter((n) => n.length > 0).map((n) => `\n${n}:`);
}

/** Strip a leading "{selfName}:" the model sometimes echoes despite the system note. */
export function stripLeadingName(text: string, selfName: string): string {
  if (selfName.length === 0) return text;
  const head = text.trimStart();
  const prefix = `${selfName}:`;
  return head.startsWith(prefix) ? head.slice(prefix.length).trimStart() : text;
}

/** The persona the orchestrator replies as (M1.5). */
export interface Persona {
  /** Agent's display name ('' for the seeded default) — used for roster + name-strip. */
  name: string;
  systemPrompt: string;
  model: ModelRef;
  /** Hex of the agent owner — keys the BYOK credential (M1.7); '' for the default. */
  ownerHex: string;
  /** Endpoint for a local/openai-compatible persona (M1.8.2); '' otherwise. */
  baseUrl: string;
}

/** Minimal views of the rows `selectPersona` reads (kept binding-free for tests). */
export interface ThreadRef {
  id: bigint;
  agentId: bigint;
}
export interface AgentRef {
  id: bigint;
  name: string;
  systemPrompt: string;
  provider: string;
  model: string;
  owner: string; // hex
  baseUrl: string; // '' except for provider 'openai-compatible'
}

const isProvider = (p: string): p is ModelProvider => (MODEL_PROVIDERS as readonly string[]).includes(p);

const DEFAULT_PERSONA: Persona = {
  name: '',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  model: DEFAULT_MODEL,
  ownerHex: '',
  baseUrl: '',
};

/**
 * Resolve a persona by agent id (M2.1 — a thread now has many agents via
 * `thread_agent`). Falls back to the seeded default for 0n / unknown / a persona
 * with an unsupported provider.
 */
export function selectPersonaById(agents: AgentRef[], agentId: bigint): Persona {
  if (agentId === 0n) return DEFAULT_PERSONA;
  const a = agents.find((x) => x.id === agentId);
  if (a && isProvider(a.provider)) {
    return {
      name: a.name,
      systemPrompt: a.systemPrompt.length > 0 ? a.systemPrompt : DEFAULT_SYSTEM_PROMPT,
      model: { provider: a.provider, model: a.model },
      ownerHex: a.owner,
      baseUrl: a.baseUrl,
    };
  }
  return DEFAULT_PERSONA;
}

/** Resolve the persona bound to a thread via the singular `thread.agentId` (DM path). */
export function selectPersona(threads: ThreadRef[], agents: AgentRef[], threadId: bigint): Persona {
  return selectPersonaById(agents, threads.find((t) => t.id === threadId)?.agentId ?? 0n);
}

// ── Arbitration: who replies to a message (M2.1; SPEC §3) ────────────────────

/** One agent active in a thread, as the resolver sees it. */
export interface ThreadAgentInfo {
  agentId: bigint;
  name: string;
  /** Opt-in to being addressed by ANOTHER agent (DEC-031; default off). */
  respondsToAgents: boolean;
  /** Answers a human message that addresses no agent. */
  isDefaultResponder: boolean;
}

/** A trigger message, reduced to what arbitration needs. `agentId === 0n` ⇒ human. */
export interface TriggerView {
  agentId: bigint;
  text: string;
  mentions: { kind: string; ref: bigint }[];
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Parse "@Name" tokens of known thread agents out of free text — how an
 * agent-authored message addresses other agents (its `mentions` array is empty;
 * structured mentions are a human-composer convenience). Case-insensitive, on a
 * word boundary. Returns agent ids in roster order (deduped by construction).
 */
export function parseTextMentions(text: string, agents: ThreadAgentInfo[]): bigint[] {
  const out: bigint[] = [];
  for (const a of agents) {
    if (a.name.length === 0) continue;
    if (new RegExp(`@${escapeRe(a.name)}\\b`, 'i').test(text)) out.push(a.agentId);
  }
  return out;
}

/**
 * Detect a leading natural-language vocative ("Hey Aria," / "Aria:") naming exactly
 * ONE thread agent, so a human can address an agent without an `@token` (M2.3). It
 * fires only for a name at the very START of the message (optionally after a
 * salutation) terminated by a comma or colon; whole-name, case-insensitive; returns
 * `undefined` on no match OR ambiguity (≥2 names) so the caller falls through to the
 * default responder. Human→agent only; never `@everyone`; never persisted.
 *
 * Precision over recall (DEC-036): deliberately STRICTER than the audited
 * `addressing.md` rule (whole-name + a MANDATORY `,`/`:` terminator; no bare substring,
 * no `@` alternative) — wrongly routing to an agent is worse than falling back to the
 * default responder, and an explicit `@mention` stays the exact path.
 */
export function parseNLVocative(text: string, agents: ThreadAgentInfo[]): bigint | undefined {
  const head = text.trimStart();
  let match: bigint | undefined;
  for (const a of agents) {
    if (a.name.length === 0) continue;
    const re = new RegExp(`^(?:(?:hey|hi|hello|ok|okay|yo)[ ,]+)?${escapeRe(a.name)}[,:]`, 'i');
    if (!re.test(head)) continue;
    if (match !== undefined) return undefined; // ≥2 names match → ambiguous, refuse to guess
    match = a.agentId;
  }
  return match;
}

/**
 * Resolve which agents should reply to a trigger, in order (DEC-031). A HUMAN
 * message uses its structured mentions (@agent in order; @everyone expands over the
 * roster); with no @mention, a leading NL vocative naming one agent (parseNLVocative,
 * M2.3) routes to it; otherwise it falls back to the thread's default responder.
 * An AGENT message parses @Name from its text and admits ONLY agents that opted in
 * (`respondsToAgents`) — and there is no default-responder fallback, so unaddressed
 * agent chatter stops. The trigger's own author is never re-addressed.
 */
export function resolveAddressees(
  trigger: TriggerView,
  agents: ThreadAgentInfo[],
  opts: { defaultResponderId?: bigint } = {},
): bigint[] {
  const byId = new Map(agents.map((a) => [a.agentId, a]));
  const ordered: bigint[] = [];
  const add = (id: bigint): void => {
    if (byId.has(id) && id !== trigger.agentId && !ordered.includes(id)) ordered.push(id);
  };

  if (trigger.agentId === 0n) {
    for (const m of trigger.mentions) {
      if (m.kind === 'agent') add(m.ref);
      else if (m.kind === 'all') for (const a of agents) add(a.agentId);
    }
    // NL soft-vocative (M2.3): a human who typed no @mention but opened with
    // "Hey {name}," / "{name}:" naming exactly one agent routes to it — strictly weaker
    // than an @mention, stronger than the default responder.
    if (ordered.length === 0) {
      const nl = parseNLVocative(trigger.text, agents);
      if (nl !== undefined) add(nl);
    }
    if (ordered.length === 0 && opts.defaultResponderId && opts.defaultResponderId !== 0n) {
      add(opts.defaultResponderId);
    }
  } else {
    for (const id of parseTextMentions(trigger.text, agents)) {
      if (byId.get(id)?.respondsToAgents) add(id);
    }
  }
  return ordered;
}

let runCounter = 0;
/** Client-owned reply correlation key (so the orchestrator never needs the row id). */
export function newRunId(selfHex: string): string {
  runCounter += 1;
  return `${selfHex.slice(0, 12)}-${Date.now().toString(36)}-${runCounter}`;
}

export interface Batcher {
  /** Append a streamed chunk; schedules (or, if the buffer is large, forces) a flush. */
  push(chunk: string): void;
  /** Flush the pending delta now (if any). */
  flush(): void;
  /** Flush and stop the timer. */
  stop(): void;
}

/** Default soft cap on a single coalesced delta — bounds per-INSERT size (backpressure). */
export const MAX_PENDING_CHARS = 8192;

/**
 * Coalescing delta batcher (M1.9): accumulates streamed chunks and flushes their
 * **concatenation** at most once per `intervalMs` — collapsing a burst of token
 * deltas into one small, append-only INSERT (not a growing cumulative UPDATE; OT-004).
 * Backpressure: if the LLM out-runs the flush and pending exceeds `maxPendingChars`,
 * it flushes immediately so no single delta INSERT grows unbounded. `onFlush` is
 * called once per flush, so the caller can assign a monotonic `seq` per flush.
 */
export function createBatcher(opts: {
  onFlush: (text: string) => void;
  intervalMs: number;
  maxPendingChars?: number;
}): Batcher {
  const maxPending = opts.maxPendingChars ?? MAX_PENDING_CHARS;
  let pending = '';
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = (): void => {
    if (pending.length > 0) {
      const text = pending;
      pending = '';
      opts.onFlush(text);
    }
  };

  return {
    push(chunk: string): void {
      if (chunk.length === 0) return;
      pending += chunk;
      timer ??= setInterval(tick, opts.intervalMs);
      if (pending.length >= maxPending) tick(); // bounded buffer — flush early
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
