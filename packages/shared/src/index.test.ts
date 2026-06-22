import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MODEL,
  MESSAGE_STREAM_STATES,
  MODEL_PROVIDERS,
  PROVIDER_CATALOG,
  RUN_STATUSES,
  TOOL_APPROVALS,
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
