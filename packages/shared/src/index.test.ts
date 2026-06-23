import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MODEL,
  MESSAGE_STREAM_STATES,
  MODEL_PROVIDERS,
  PROVIDER_CATALOG,
  RUN_STATUSES,
  TOOL_APPROVALS,
  MENTION_KINDS,
  MAX_TURNS_HARD,
  MAX_CONCURRENT,
  EPISODE_TOKEN_CEILING,
  evaluateBegin,
  type EpisodeView,
  RECONNECT,
  nextBackoff,
  reconnectReducer,
  INITIAL_RECONNECT,
  type ReconnectState,
} from './index';

describe('shared contracts', () => {
  it('defaults to Claude Opus 4.8', () => {
    expect(DEFAULT_MODEL).toEqual({ provider: 'anthropic', model: 'claude-opus-4-8' });
  });

  it('keeps the provider catalog consistent (ids ⊆ MODEL_PROVIDERS, unique, default ∈ suggestions)', () => {
    const ids = PROVIDER_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    for (const p of PROVIDER_CATALOG) {
      expect(MODEL_PROVIDERS).toContain(p.id);
      expect(p.suggestedModels).toContain(p.defaultModel);
      expect(p.getKeyUrl).toMatch(/^https:\/\//);
    }
    // DEFAULT_MODEL's provider is in the catalog
    expect(ids).toContain(DEFAULT_MODEL.provider);
  });

  it('declares the message + run state spaces (SPEC §1, §2)', () => {
    expect(MESSAGE_STREAM_STATES).toEqual(['streaming', 'complete', 'failed']);
    expect(RUN_STATUSES).toContain('queued');
    expect(RUN_STATUSES).toContain('succeeded');
  });

  it('gates destructive tools behind approval (SPEC §5)', () => {
    expect(TOOL_APPROVALS).toContain('ask');
  });
});

describe('multi-agent episode budget (DEC-031)', () => {
  const open = (over: Partial<EpisodeView> = {}): EpisodeView => ({
    status: 'open',
    turnsRemaining: 5,
    tokenBudgetRemaining: 10_000n,
    ...over,
  });

  it('declares the mention kinds and the budget dials', () => {
    expect(MENTION_KINDS).toEqual(['agent', 'human', 'all']);
    expect(MAX_TURNS_HARD).toBeGreaterThan(0);
    expect(MAX_CONCURRENT).toBeGreaterThan(0);
    expect(EPISODE_TOKEN_CEILING).toBeGreaterThan(0n);
  });

  it('admits a reply when the episode is open and within budget', () => {
    expect(evaluateBegin({ episode: open(), runningInThread: 0, agentAlreadyReplied: false })).toEqual({ ok: true });
  });

  it('rejects with the most specific reason, in order', () => {
    // missing/closed episode beats everything
    expect(evaluateBegin({ episode: undefined, runningInThread: 9, agentAlreadyReplied: true }))
      .toEqual({ ok: false, reason: 'episode_closed' });
    expect(evaluateBegin({ episode: open({ status: 'closed' }), runningInThread: 0, agentAlreadyReplied: false }))
      .toEqual({ ok: false, reason: 'episode_closed' });
    // turns before budget before per-agent before concurrency
    expect(evaluateBegin({ episode: open({ turnsRemaining: 0 }), runningInThread: 9, agentAlreadyReplied: true }))
      .toEqual({ ok: false, reason: 'turns_exhausted' });
    expect(evaluateBegin({ episode: open({ tokenBudgetRemaining: 0n }), runningInThread: 9, agentAlreadyReplied: true }))
      .toEqual({ ok: false, reason: 'budget_exhausted' });
    expect(evaluateBegin({ episode: open(), runningInThread: 9, agentAlreadyReplied: true }))
      .toEqual({ ok: false, reason: 'already_replied' });
  });

  it('enforces the concurrency cap (and honors an override)', () => {
    expect(evaluateBegin({ episode: open(), runningInThread: MAX_CONCURRENT, agentAlreadyReplied: false }))
      .toEqual({ ok: false, reason: 'concurrency_cap' });
    expect(evaluateBegin({ episode: open(), runningInThread: 1, agentAlreadyReplied: false, maxConcurrent: 1 }))
      .toEqual({ ok: false, reason: 'concurrency_cap' });
  });
});

describe('reconnect backoff (BL-022 / M2.5)', () => {
  it('returns a whole-ms delay within [0, ceiling] and grows then plateaus at the cap', () => {
    const opts = { baseMs: 1000, factor: 2, capMs: 30_000, rand: () => 0.5 };
    // ceiling = min(cap, base·2^attempt); delay = floor(0.5 · ceiling)
    expect(nextBackoff(0, opts)).toBe(500); // min(30k, 1000)·0.5
    expect(nextBackoff(1, opts)).toBe(1000); // 2000·0.5
    expect(nextBackoff(2, opts)).toBe(2000); // 4000·0.5
    expect(nextBackoff(5, opts)).toBe(15_000); // 1000·2^5=32000 → capped to 30000, ·0.5
    // monotonic non-decreasing under a fixed rand
    let prev = -1;
    for (let a = 0; a < 12; a++) {
      const d = nextBackoff(a, opts);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });

  it('never exceeds the cap even for a huge attempt (overflow-safe)', () => {
    expect(nextBackoff(1000, { rand: () => 0.999999 })).toBeLessThanOrEqual(RECONNECT.capMs);
    expect(nextBackoff(0, { rand: () => 0 })).toBe(0); // rand 0 → no delay
  });

  it('walks the gate phase machine: drop → backoff → reconnect → up resets attempt', () => {
    let s: ReconnectState = INITIAL_RECONNECT;
    expect(s).toEqual({ phase: 'connecting', attempt: 0, nonce: 0 });
    s = reconnectReducer(s, 'connected');
    expect(s.phase).toBe('up');
    s = reconnectReducer(s, 'dropped');
    expect(s.phase).toBe('reconnecting');
    s = reconnectReducer(s, 'backoffElapsed'); // refresh OK → remount
    expect(s).toEqual({ phase: 'connecting', attempt: 1, nonce: 1 });
    s = reconnectReducer(s, 'dropped'); // remount didn't stick
    expect(s.phase).toBe('reconnecting');
    s = reconnectReducer(s, 'backoffElapsed');
    expect(s).toEqual({ phase: 'connecting', attempt: 2, nonce: 2 });
    s = reconnectReducer(s, 'connected'); // sticks → attempt resets
    expect(s).toEqual({ phase: 'up', attempt: 0, nonce: 2 });
  });

  it('routes a failed token refresh to authLost, and a foreground to an immediate reset retry', () => {
    const reconnecting = reconnectReducer(reconnectReducer(INITIAL_RECONNECT, 'connected'), 'dropped');
    expect(reconnecting.phase).toBe('reconnecting');
    expect(reconnectReducer(reconnecting, 'refreshFailed').phase).toBe('authLost');
    // foreground from reconnecting → connecting, attempt reset, nonce bumped
    expect(reconnectReducer({ phase: 'reconnecting', attempt: 5, nonce: 3 }, 'appForegrounded'))
      .toEqual({ phase: 'connecting', attempt: 0, nonce: 4 });
    // duplicate drop while authLost is ignored; foreground while up is a no-op
    expect(reconnectReducer({ phase: 'authLost', attempt: 2, nonce: 1 }, 'dropped').phase).toBe('authLost');
    expect(reconnectReducer({ phase: 'up', attempt: 0, nonce: 0 }, 'appForegrounded').phase).toBe('up');
  });
});
