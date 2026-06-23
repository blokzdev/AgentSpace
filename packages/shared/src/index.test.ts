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
