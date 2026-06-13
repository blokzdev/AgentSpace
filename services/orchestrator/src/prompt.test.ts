import { describe, it, expect, vi } from 'vitest';
import { buildPrompt, createBatcher, newRunId, DEFAULT_SYSTEM_PROMPT, type PromptRow } from './prompt';

describe('buildPrompt', () => {
  it('orders by sentMicros, maps roles, and prepends the system prompt', () => {
    const rows: PromptRow[] = [
      { isAgent: false, text: 'second', sentMicros: 200n },
      { isAgent: false, text: 'first', sentMicros: 100n },
      { isAgent: true, text: 'agent reply', sentMicros: 150n },
    ];
    expect(buildPrompt(rows)).toEqual([
      { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'agent reply' },
      { role: 'user', content: 'second' },
    ]);
  });

  it('drops empty (in-flight streaming) rows and honors a custom system prompt', () => {
    const rows: PromptRow[] = [
      { isAgent: false, text: 'hi', sentMicros: 1n },
      { isAgent: true, text: '', sentMicros: 2n },
    ];
    expect(buildPrompt(rows, 'be terse')).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hi' },
    ]);
  });
});

describe('newRunId', () => {
  it('is unique per call and embeds a prefix of the identity', () => {
    const a = newRunId('abcdef0123456789');
    const b = newRunId('abcdef0123456789');
    expect(a).not.toBe(b);
    expect(a.startsWith('abcdef012345-')).toBe(true);
  });
});

describe('createBatcher', () => {
  it('coalesces bursts and flushes the latest text on the interval', () => {
    vi.useFakeTimers();
    const flushed: string[] = [];
    const b = createBatcher({ intervalMs: 50, onFlush: (t) => flushed.push(t) });

    b.push('a');
    b.push('ab');
    b.push('abc');
    expect(flushed).toEqual([]); // nothing until the interval fires
    vi.advanceTimersByTime(50);
    expect(flushed).toEqual(['abc']); // only the latest cumulative text

    b.push('abcd');
    b.stop(); // flushes the tail and clears the timer
    expect(flushed).toEqual(['abc', 'abcd']);
    vi.useRealTimers();
  });
});
