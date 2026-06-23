import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_MODEL } from '@agentspace/shared';
import {
  buildPrompt,
  createBatcher,
  mentionStops,
  newRunId,
  parseNLVocative,
  parseTextMentions,
  resolveAddressees,
  selectPersona,
  selectPersonaById,
  stripLeadingName,
  DEFAULT_SYSTEM_PROMPT,
  MAX_PENDING_CHARS,
  type AgentRef,
  type PromptRow,
  type ThreadAgentInfo,
  type ThreadRef,
} from './prompt';

// A human row (agentId 0n) and an agent row, for prompt assembly.
const human = (id: bigint, text: string, sentMicros: bigint, name = 'Alice'): PromptRow => ({
  id, agentId: 0n, senderName: name, text, sentMicros,
});
const agentRow = (id: bigint, agentId: bigint, text: string, sentMicros: bigint, name = 'Agent'): PromptRow => ({
  id, agentId, senderName: name, text, sentMicros,
});

describe('buildPrompt — DM mode (empty roster ⇒ pre-M2 behavior)', () => {
  it('orders by sentMicros, maps roles by TAG, prepends the system prompt', () => {
    const rows: PromptRow[] = [
      human(2n, 'second', 200n),
      human(1n, 'first', 100n),
      agentRow(3n, 42n, 'agent reply', 150n, 'Pete'),
    ];
    expect(buildPrompt(rows, { targetAgentId: 42n })).toEqual([
      { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'agent reply' },
      { role: 'user', content: 'second' },
    ]);
  });

  it('drops empty (in-flight streaming) rows and honors a custom system prompt', () => {
    const rows: PromptRow[] = [human(1n, 'hi', 1n), agentRow(2n, 42n, '', 2n)];
    expect(buildPrompt(rows, { targetAgentId: 42n, system: 'be terse' })).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hi' },
    ]);
  });

  it('drops trailing assistant turns so the conversation ends with a user message', () => {
    const rows: PromptRow[] = [
      human(1n, 'hello', 1n),
      agentRow(2n, 42n, '⚠️ Sorry — I could not generate a reply.', 2n),
    ];
    expect(buildPrompt(rows, { targetAgentId: 42n })).toEqual([
      { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
      { role: 'user', content: 'hello' },
    ]);
  });

  it('breaks a same-microsecond tie deterministically by message id', () => {
    const rows: PromptRow[] = [human(2n, 'B', 100n), human(1n, 'A', 100n)];
    // Both human → merged into one user turn, in id order.
    expect(buildPrompt(rows, { targetAgentId: 42n })).toEqual([
      { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
      { role: 'user', content: 'A\n\nB' },
    ]);
  });
});

describe('buildPrompt — GROUP mode (no persona-bleed; DEC-031 showstopper)', () => {
  const A = 1n;
  const B = 9n;
  const rows: PromptRow[] = [
    human(1n, 'hi all', 1n, 'Alice'),
    agentRow(2n, A, 'hello, I am A', 2n, 'Aria'),
    agentRow(3n, B, 'and I am B', 3n, 'Banjo'),
    human(4n, 'thanks', 4n, 'Alice'),
  ];

  it('tags non-self turns with the sender name, merges same-role runs, appends a roster footer', () => {
    const out = buildPrompt(rows, { targetAgentId: A, selfName: 'Aria', roster: ['Banjo', 'Alice'] });
    expect(out[0].role).toBe('system');
    expect(out[0].content).toContain('You are "Aria"');
    expect(out[0].content).toContain('Other participants: Banjo, Alice.');
    expect(out.slice(1)).toEqual([
      { role: 'user', content: 'Alice: hi all' },
      { role: 'assistant', content: 'hello, I am A' },
      // B's turn + Alice's "thanks" are consecutive user turns → merged.
      { role: 'user', content: 'Banjo: and I am B\n\nAlice: thanks' },
    ]);
  });

  it('computes isAgent FROM THE TAG, not identity — the same rows differ by target agent', () => {
    const forA = buildPrompt(rows, { targetAgentId: A, roster: ['Banjo', 'Alice'] });
    const forB = buildPrompt(rows, { targetAgentId: B, roster: ['Aria', 'Alice'] });
    const assistantText = (m: { role: string; content: string }[]): string[] =>
      m.filter((t) => t.role === 'assistant').map((t) => t.content);
    // For A, only A's message is assistant; B's is a user turn (and vice-versa).
    expect(assistantText(forA)).toEqual(['hello, I am A']);
    expect(assistantText(forB)).toEqual(['and I am B']);
    expect(JSON.stringify(forA)).not.toContain('assistant","content":"and I am B');
  });
});

describe('mentionStops / stripLeadingName (group output hygiene)', () => {
  it('builds "\\nName:" stop sequences for the other participants only', () => {
    expect(mentionStops(['Banjo', '', 'Alice'])).toEqual(['\nBanjo:', '\nAlice:']);
  });

  it('strips a leading self-name label the model may echo', () => {
    expect(stripLeadingName('Aria: hello there', 'Aria')).toBe('hello there');
    expect(stripLeadingName('  Aria:   hi', 'Aria')).toBe('hi');
    expect(stripLeadingName('hello there', 'Aria')).toBe('hello there');
    expect(stripLeadingName('anything', '')).toBe('anything');
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

describe('selectPersonaById / selectPersona', () => {
  const agents: AgentRef[] = [
    { id: 42n, name: 'Pirate Pete', systemPrompt: 'You are Pirate Pete.', provider: 'openai', model: 'gpt-4o', owner: 'abc123', baseUrl: '' },
    { id: 99n, name: 'Broken', systemPrompt: '', provider: 'not-a-provider', model: 'x', owner: 'def456', baseUrl: '' },
    { id: 7n, name: 'Local', systemPrompt: 'local', provider: 'openai-compatible', model: 'llama3.2', owner: 'aaa', baseUrl: 'http://localhost:11434/v1' },
  ];

  it('resolves a persona by agent id (name + prompt + model + owner)', () => {
    expect(selectPersonaById(agents, 42n)).toEqual({
      name: 'Pirate Pete', systemPrompt: 'You are Pirate Pete.',
      model: { provider: 'openai', model: 'gpt-4o' }, ownerHex: 'abc123', baseUrl: '',
    });
  });

  it('carries a local (openai-compatible) base URL through', () => {
    expect(selectPersonaById(agents, 7n).baseUrl).toBe('http://localhost:11434/v1');
  });

  it('falls back to the default persona for 0n / unknown / unsupported provider', () => {
    for (const id of [0n, 99n, 777n]) {
      expect(selectPersonaById(agents, id)).toEqual({
        name: '', systemPrompt: DEFAULT_SYSTEM_PROMPT, model: DEFAULT_MODEL, ownerHex: '', baseUrl: '',
      });
    }
  });

  it('selectPersona delegates via the singular thread.agentId (DM path)', () => {
    const threads: ThreadRef[] = [{ id: 1n, agentId: 0n }, { id: 2n, agentId: 42n }];
    expect(selectPersona(threads, agents, 2n).name).toBe('Pirate Pete');
    expect(selectPersona(threads, agents, 1n).model).toEqual(DEFAULT_MODEL);
  });
});

describe('resolveAddressees (arbitration; DEC-031)', () => {
  // roster order: Aria, Banjo, Cleo
  const agents: ThreadAgentInfo[] = [
    { agentId: 1n, name: 'Aria', respondsToAgents: true, isDefaultResponder: true },
    { agentId: 9n, name: 'Banjo', respondsToAgents: false, isDefaultResponder: false },
    { agentId: 5n, name: 'Cleo', respondsToAgents: true, isDefaultResponder: false },
  ];
  const human = (mentions: { kind: string; ref: bigint }[]): { agentId: bigint; text: string; mentions: typeof mentions } =>
    ({ agentId: 0n, text: '', mentions });
  const humanText = (text: string, mentions: { kind: string; ref: bigint }[] = []): { agentId: bigint; text: string; mentions: typeof mentions } =>
    ({ agentId: 0n, text, mentions });

  it('human @a @b → those agents, in mention order', () => {
    expect(resolveAddressees(human([{ kind: 'agent', ref: 9n }, { kind: 'agent', ref: 1n }]), agents)).toEqual([9n, 1n]);
  });

  it('human @everyone → all agents, in roster order', () => {
    expect(resolveAddressees(human([{ kind: 'all', ref: 0n }]), agents)).toEqual([1n, 9n, 5n]);
  });

  it('human with no mentions → the default responder (or nobody if none set)', () => {
    expect(resolveAddressees(human([]), agents, { defaultResponderId: 1n })).toEqual([1n]);
    expect(resolveAddressees(human([]), agents)).toEqual([]);
  });

  it('ignores a duplicate / dedupes @everyone + explicit @a', () => {
    expect(resolveAddressees(human([{ kind: 'all', ref: 0n }, { kind: 'agent', ref: 1n }]), agents)).toEqual([1n, 9n, 5n]);
  });

  it('agent-authored: parses @Name from text, admits ONLY opted-in agents, never itself', () => {
    // Aria (agentId 1) thanks Banjo (opted-OUT) and Cleo (opted-IN) and mentions herself.
    const trigger = { agentId: 1n, text: 'thanks @Banjo and @Cleo — also @Aria', mentions: [] };
    expect(resolveAddressees(trigger, agents)).toEqual([5n]); // only Cleo; Banjo opted out; self excluded
  });

  it('agent-authored with no @mention → nobody (no default-responder fallback)', () => {
    expect(resolveAddressees({ agentId: 1n, text: 'just thinking out loud', mentions: [] }, agents)).toEqual([]);
  });

  it('parseTextMentions matches @Name on a word boundary, case-insensitive', () => {
    expect(parseTextMentions('hey @ARIA and @Cleo!', agents)).toEqual([1n, 5n]);
    expect(parseTextMentions('email ariana@x.com', agents)).toEqual([]); // not an @mention of Aria
  });

  // NL soft-vocative precedence (M2.3): @mention/@everyone win; NL beats default; agent-branch ignores NL.
  it('routes a no-@mention human NL vocative to the named agent', () => {
    expect(resolveAddressees(humanText('Hey Banjo, ping?'), agents, { defaultResponderId: 1n })).toEqual([9n]);
  });
  it('an explicit @mention / @everyone always overrides an NL vocative', () => {
    expect(resolveAddressees(humanText('Aria, ask Cleo', [{ kind: 'agent', ref: 5n }]), agents, { defaultResponderId: 1n })).toEqual([5n]);
    expect(resolveAddressees(humanText('Aria, hello', [{ kind: 'all', ref: 0n }]), agents)).toEqual([1n, 9n, 5n]);
  });
  it('NL vocative beats the default responder; a non-vocative message falls to default', () => {
    expect(resolveAddressees(humanText('Cleo: status'), agents, { defaultResponderId: 1n })).toEqual([5n]);
    expect(resolveAddressees(humanText('hey there'), agents, { defaultResponderId: 1n })).toEqual([1n]);
  });
  it('the agent-authored branch ignores NL vocatives (only @Name + opt-in)', () => {
    expect(resolveAddressees({ agentId: 1n, text: 'Banjo, take it', mentions: [] }, agents)).toEqual([]);
  });
});

describe('parseNLVocative (M2.3 — leading NL soft-address, precision over recall)', () => {
  const A = (agentId: bigint, name: string): ThreadAgentInfo => ({ agentId, name, respondsToAgents: false, isDefaultResponder: false });
  const roster = [A(1n, 'Aria'), A(9n, 'Banjo'), A(5n, 'Cleo')];

  it('routes a leading vocative (with or without a salutation) to the one named agent', () => {
    expect(parseNLVocative('Hey Aria, can you draft this?', roster)).toBe(1n);
    expect(parseNLVocative('Aria: status?', roster)).toBe(1n);
    expect(parseNLVocative('  banjo, thoughts?', roster)).toBe(9n); // leading space + case-insensitive
    expect(parseNLVocative('yo Cleo: ping', roster)).toBe(5n);
  });

  it('returns undefined for non-vocative / mid-sentence / possessive / unterminated names', () => {
    expect(parseNLVocative('hey there, anyone home?', roster)).toBeUndefined();
    expect(parseNLVocative('thanks, all', roster)).toBeUndefined();
    expect(parseNLVocative('I talked to Aria yesterday', roster)).toBeUndefined(); // mid-sentence
    expect(parseNLVocative("Aria's idea was good", roster)).toBeUndefined(); // possessive (no ,/:)
    expect(parseNLVocative('Aria can you help', roster)).toBeUndefined(); // no terminator
    expect(parseNLVocative('Aria! help', roster)).toBeUndefined(); // ! is not a vocative signal
  });

  it('requires a WHOLE-name match (no partial / prefix)', () => {
    expect(parseNLVocative('Ari, hi', roster)).toBeUndefined();
    expect(parseNLVocative('Ar, hi', roster)).toBeUndefined();
    // roster "Ari" alongside "Aria" → "Aria," matches only Aria
    expect(parseNLVocative('Aria, hi', [A(1n, 'Aria'), A(2n, 'Ari')])).toBe(1n);
  });

  it('matches a common-word persona name only as a real leading vocative', () => {
    const r = [A(3n, 'Art')];
    expect(parseNLVocative('Art, draft the email', r)).toBe(3n);
    expect(parseNLVocative('I love art, honestly', r)).toBeUndefined();
  });

  it('matches a persona named after a salutation via the salutation-less branch', () => {
    expect(parseNLVocative('Yo, ship it', [A(4n, 'Yo')])).toBe(4n);
  });

  it('treats regex metacharacters in a name literally; refuses ambiguous same-name; skips empty names', () => {
    expect(parseNLVocative('C++ Bot: build', [A(8n, 'C++ Bot')])).toBe(8n);
    expect(parseNLVocative('Pete, hi', [A(1n, 'Pete'), A(2n, 'Pete')])).toBeUndefined(); // ≥2 → undefined
    expect(parseNLVocative('Aria, hi', [A(1n, ''), A(2n, 'Aria')])).toBe(2n);
  });
});

describe('per-agent systemPrompt isolation (M2.3 guarantee)', () => {
  it("buildPrompt for agent A never contains agent B's systemPrompt — each agent sees only its own", () => {
    const A_SYS = 'You are Aria. Speak in haiku.';
    const B_SECRET = 'SECRET-B-ONLY-INSTRUCTIONS';
    const rows: PromptRow[] = [
      human(1n, 'hi all', 1n, 'Alice'),
      agentRow(2n, 1n, 'a poem', 2n, 'Aria'),
      agentRow(3n, 9n, 'a song', 3n, 'Banjo'),
    ];
    // Built FOR Aria with ONLY Aria's system — handleReply calls buildPrompt once per
    // agent with that agent's persona.systemPrompt (replyLoop.ts:317-325), so agent B's
    // system is never an input here and can never leak into A's prompt.
    const forA = buildPrompt(rows, { targetAgentId: 1n, system: A_SYS, selfName: 'Aria', roster: ['Banjo', 'Alice'] });
    const serialized = JSON.stringify(forA);
    expect(serialized).toContain('You are Aria');
    expect(serialized).toContain('Other participants:'); // roster footer present
    expect(serialized).not.toContain(B_SECRET); // B's instructions never appear in A's prompt
  });
});

describe('createBatcher (M1.9 delta-accumulate)', () => {
  it('coalesces a burst of deltas into one concatenated flush per interval', () => {
    vi.useFakeTimers();
    const flushed: string[] = [];
    const b = createBatcher({ intervalMs: 50, onFlush: (t) => flushed.push(t) });

    b.push('Hello');
    b.push(', ');
    b.push('world');
    expect(flushed).toEqual([]); // nothing until the interval fires
    vi.advanceTimersByTime(50);
    expect(flushed).toEqual(['Hello, world']); // the burst's deltas, concatenated — once

    b.push('!');
    b.stop(); // flushes the tail and clears the timer
    expect(flushed).toEqual(['Hello, world', '!']);
    expect(flushed.join('')).toBe('Hello, world!');
    vi.useRealTimers();
  });

  it('emits one flush per interval window (so the caller can assign a monotonic seq)', () => {
    vi.useFakeTimers();
    const flushed: string[] = [];
    const b = createBatcher({ intervalMs: 50, onFlush: (t) => flushed.push(t) });

    b.push('a');
    vi.advanceTimersByTime(50);
    b.push('b');
    b.push('c');
    vi.advanceTimersByTime(50);
    expect(flushed).toEqual(['a', 'bc']); // two windows → two flushes (→ seq 0, 1)
    vi.advanceTimersByTime(500); // idle: no pending, no spurious flush
    expect(flushed).toEqual(['a', 'bc']);
    b.stop();
    vi.useRealTimers();
  });

  it('flushes immediately when pending exceeds the soft cap (backpressure)', () => {
    vi.useFakeTimers();
    const flushed: string[] = [];
    const b = createBatcher({ intervalMs: 50, maxPendingChars: 8, onFlush: (t) => flushed.push(t) });

    b.push('1234'); // under the cap → buffered, waits for the interval
    expect(flushed).toEqual([]);
    b.push('5678'); // reaches the cap → flush now, no timer wait
    expect(flushed).toEqual(['12345678']);
    b.stop();
    vi.useRealTimers();
  });

  it('ignores empty chunks and the default cap is generous', () => {
    vi.useFakeTimers();
    const flushed: string[] = [];
    const b = createBatcher({ intervalMs: 50, onFlush: (t) => flushed.push(t) });
    expect(MAX_PENDING_CHARS).toBeGreaterThan(1000);
    b.push('');
    b.stop(); // nothing pending → no flush
    expect(flushed).toEqual([]);
    vi.useRealTimers();
  });
});
