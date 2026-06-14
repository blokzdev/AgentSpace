import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_MODEL } from '@agentspace/shared';
import {
  buildPrompt,
  createBatcher,
  newRunId,
  selectPersona,
  DEFAULT_SYSTEM_PROMPT,
  type AgentRef,
  type PromptRow,
  type ThreadRef,
} from './prompt';

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

describe('selectPersona', () => {
  const threads: ThreadRef[] = [
    { id: 1n, agentId: 0n },
    { id: 2n, agentId: 42n },
    { id: 3n, agentId: 99n },
  ];
  const agents: AgentRef[] = [
    { id: 42n, systemPrompt: 'You are Pirate Pete.', provider: 'openai', model: 'gpt-4o' },
    { id: 99n, systemPrompt: '', provider: 'not-a-provider', model: 'x' },
  ];

  it('uses the bound persona prompt + model', () => {
    expect(selectPersona(threads, agents, 2n)).toEqual({
      systemPrompt: 'You are Pirate Pete.',
      model: { provider: 'openai', model: 'gpt-4o' },
    });
  });

  it('falls back to defaults for a human thread (agentId 0)', () => {
    expect(selectPersona(threads, agents, 1n)).toEqual({
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      model: DEFAULT_MODEL,
    });
  });

  it('falls back when the persona has an unknown provider', () => {
    expect(selectPersona(threads, agents, 3n)).toEqual({
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      model: DEFAULT_MODEL,
    });
  });

  it('falls back for an unknown thread', () => {
    expect(selectPersona(threads, agents, 777n).model).toEqual(DEFAULT_MODEL);
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
