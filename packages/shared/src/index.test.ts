import { describe, it, expect } from 'vitest';
import { DEFAULT_MODEL, MESSAGE_STREAM_STATES, RUN_STATUSES, TOOL_APPROVALS } from './index';

describe('shared contracts', () => {
  it('defaults to Claude Opus 4.8', () => {
    expect(DEFAULT_MODEL).toEqual({ provider: 'anthropic', model: 'claude-opus-4-8' });
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
