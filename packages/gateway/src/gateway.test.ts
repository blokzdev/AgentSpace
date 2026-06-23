import { describe, it, expect } from 'vitest';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import type { ToolSpec } from '@agentspace/shared';
import { createModelGateway, type GatewayDelta, type GatewayRequest } from './index';

const USAGE = {
  inputTokens: { total: 11, noCache: 11, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

function mockModel(chunks: LanguageModelV3StreamPart[]): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: () =>
      Promise.resolve({
        stream: simulateReadableStream({ chunks, initialDelayInMs: 0, chunkDelayInMs: 0 }),
      }),
  });
}

function gatewayOver(chunks: LanguageModelV3StreamPart[]) {
  return createModelGateway({
    resolveCredential: () => Promise.resolve('test-key'),
    providers: { anthropic: () => mockModel(chunks) },
  });
}

async function collect(stream: AsyncIterable<GatewayDelta>): Promise<GatewayDelta[]> {
  const out: GatewayDelta[] = [];
  for await (const d of stream) out.push(d);
  return out;
}

const baseReq: GatewayRequest = {
  model: { provider: 'anthropic', model: 'claude-opus-4-8' },
  credentialRef: 'anthropic',
  messages: [
    { role: 'system', content: 'Be terse.' },
    { role: 'user', content: 'hi' },
  ],
};

describe('createModelGateway.stream', () => {
  it('normalizes text deltas and a terminal finish with usage', async () => {
    const gateway = gatewayOver([
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: '0' },
      { type: 'text-delta', id: '0', delta: 'Hello ' },
      { type: 'text-delta', id: '0', delta: 'world' },
      { type: 'text-end', id: '0' },
      { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: USAGE },
    ]);

    const deltas = await collect(gateway.stream(baseReq));
    const text = deltas.filter((d) => d.type === 'text').map((d) => d.text).join('');
    expect(text).toBe('Hello world');

    const finish = deltas.at(-1);
    expect(finish).toMatchObject({
      type: 'finish',
      finishReason: 'stop',
      usage: { inputTokens: 11, outputTokens: 5 },
    });
  });

  it('surfaces tool calls as tool-call deltas', async () => {
    const gateway = gatewayOver([
      { type: 'stream-start', warnings: [] },
      {
        type: 'tool-call',
        toolCallId: 't1',
        toolName: 'get_weather',
        input: JSON.stringify({ city: 'NYC' }),
      },
      { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_use' }, usage: USAGE },
    ]);

    const weatherTool: ToolSpec = {
      name: 'get_weather',
      description: 'Get the weather for a city.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
      source: 'function',
      sideEffects: 'none',
      approval: 'auto',
    };

    const deltas = await collect(gateway.stream({ ...baseReq, tools: [weatherTool] }));
    const call = deltas.find((d) => d.type === 'tool-call');
    expect(call).toMatchObject({ type: 'tool-call', name: 'get_weather' });
    expect(call?.type === 'tool-call' && call.input).toEqual({ city: 'NYC' });
  });

  it('throws when no credential resolver is configured', async () => {
    const gateway = createModelGateway({ providers: { anthropic: () => mockModel([]) } });
    await expect(collect(gateway.stream(baseReq))).rejects.toThrow(/no credential resolver/i);
  });

  it('throws for an unregistered provider', async () => {
    const gateway = createModelGateway({ resolveCredential: () => Promise.resolve('k'), providers: {} });
    await expect(collect(gateway.stream(baseReq))).rejects.toThrow(/no provider adapter/i);
  });

  function captureModel(captured: { maxOutputTokens?: number; stopSequences?: string[] }): MockLanguageModelV3 {
    return new MockLanguageModelV3({
      doStream: (options) => {
        captured.maxOutputTokens = options.maxOutputTokens;
        captured.stopSequences = options.stopSequences;
        return Promise.resolve({
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: USAGE },
            ],
            initialDelayInMs: 0,
            chunkDelayInMs: 0,
          }),
        });
      },
    });
  }

  it('forwards maxOutputTokens + stopSequences to the model (M2.1 per-run cap, guard #4)', async () => {
    const captured: { maxOutputTokens?: number; stopSequences?: string[] } = {};
    const gateway = createModelGateway({
      resolveCredential: () => Promise.resolve('k'),
      providers: { anthropic: () => captureModel(captured) },
    });
    await collect(gateway.stream({ ...baseReq, maxOutputTokens: 2000, stopSequences: ['\nBanjo:'] }));
    expect(captured.maxOutputTokens).toBe(2000);
    expect(captured.stopSequences).toEqual(['\nBanjo:']);
  });

  it('omits stopSequences when none are given (empty array → undefined)', async () => {
    const captured: { maxOutputTokens?: number; stopSequences?: string[] } = {};
    const gateway = createModelGateway({
      resolveCredential: () => Promise.resolve('k'),
      providers: { anthropic: () => captureModel(captured) },
    });
    await collect(gateway.stream({ ...baseReq, stopSequences: [] }));
    expect(captured.stopSequences).toBeUndefined();
  });

  it('embed is deferred to M3.1', async () => {
    const gateway = createModelGateway();
    await expect(gateway.embed(['x'])).rejects.toThrow(/M3\.1/);
  });
});
