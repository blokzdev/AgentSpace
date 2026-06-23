// Unit tests for handleReply's finalization paths (M1.9 + M2.1 tags): a happy
// stream finishes `complete`; a stalled provider times out to `failed`; a gateway
// error finishes `failed`; a superseding human message cancels the in-flight reply.
// Every begin carries the M2.1 agentId/episodeId tags. Uses a minimal fake
// DbConnection + scripted gateways (no SpacetimeDB / network).
import { describe, it, expect } from 'vitest';
import { Identity } from 'spacetimedb';
import type { GatewayDelta, GatewayRequest, ModelGateway } from '@agentspace/gateway';
import { DbConnection } from '@agentspace/stdb-bindings';
import { createLoopState, handleReply } from './replyLoop';

type Call = [string, Record<string, unknown>];

const AGENT_ID = 7n;
const EPISODE_ID = 100n;

/** A DbConnection stub covering only what handleReply reads/writes. */
function fakeConn(calls: Call[]): DbConnection {
  // Reducer calls return a promise (the real SDK rejects it on a reducer error;
  // handleReply awaits begin and `.catch`es the fire-and-forget calls).
  const rec = (name: string) => (args: Record<string, unknown>): Promise<void> => {
    calls.push([name, args]);
    return Promise.resolve();
  };
  return {
    db: {
      my_active_personas: { iter: () => [] },
      my_thread_agents: { iter: () => [] },
      my_thread_members: { iter: () => [] },
      my_thread_messages: { iter: () => [] },
      my_threads: { iter: () => [{ id: 1n, agentId: 0n }] },
      user: { iter: () => [] },
    },
    reducers: {
      agentReplyBegin: rec('begin'),
      agentReplyDelta: rec('delta'),
      agentReplyFinish: rec('finish'),
      agentReplyCancel: rec('cancel'),
    },
  } as unknown as DbConnection;
}

const SELF = { toHexString: () => 'deadbeef0000', isEqual: () => false } as unknown as Identity;

const run = (conn: DbConnection, gateway: ModelGateway, flushMs: number, idleMs: number) =>
  handleReply(conn, SELF, gateway, flushMs, idleMs, 1n, AGENT_ID, EPISODE_ID, createLoopState());

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const untilAbort = (signal?: AbortSignal): Promise<never> =>
  new Promise((_resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });

const FAST = 5; // flush interval (ms) for tests

describe('handleReply finalization (M1.9.2 + M2.1 tags)', () => {
  it('streams deltas, finishes `complete`, and tags begin with agentId + episodeId', async () => {
    const calls: Call[] = [];
    const gateway: ModelGateway = {
      async *stream(): AsyncIterable<GatewayDelta> {
        yield { type: 'text', text: 'Hel' };
        yield { type: 'text', text: 'lo!' };
        yield { type: 'finish', usage: { inputTokens: 3, outputTokens: 2 }, finishReason: 'stop' };
      },
      embed: () => Promise.reject(new Error('no')),
    };

    await run(fakeConn(calls), gateway, FAST, 1000);

    const begin = calls.find((c) => c[0] === 'begin');
    expect(begin?.[1]).toMatchObject({ agentId: AGENT_ID, episodeId: EPISODE_ID });
    const deltas = calls.filter((c) => c[0] === 'delta');
    expect(deltas.map((c) => c[1].text).join('')).toBe('Hello!');
    const seqs = deltas.map((c) => c[1].seq as bigint);
    expect(seqs).toEqual([...seqs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(new Set(seqs).size).toBe(seqs.length);
    const finish = calls.find((c) => c[0] === 'finish');
    expect(finish?.[1]).toMatchObject({ text: 'Hello!', ok: true, outputTokens: 2n });
    expect(calls.some((c) => c[0] === 'cancel')).toBe(false);
  });

  it('times out a stalled provider to `failed` (no token past the idle window)', async () => {
    const calls: Call[] = [];
    const gateway: ModelGateway = {
      async *stream(req: GatewayRequest): AsyncIterable<GatewayDelta> {
        yield { type: 'text', text: 'thinking' };
        await untilAbort(req.signal);
      },
      embed: () => Promise.reject(new Error('no')),
    };

    await run(fakeConn(calls), gateway, FAST, 40);

    const finish = calls.find((c) => c[0] === 'finish');
    expect(finish?.[1]).toMatchObject({ ok: false, text: 'thinking' });
    expect(calls.some((c) => c[0] === 'cancel')).toBe(false);
  });

  it('finishes `failed` on a gateway error before any token', async () => {
    const calls: Call[] = [];
    const gateway: ModelGateway = {
      // eslint-disable-next-line require-yield
      async *stream(): AsyncIterable<GatewayDelta> {
        throw new Error('boom');
      },
      embed: () => Promise.reject(new Error('no')),
    };

    await run(fakeConn(calls), gateway, FAST, 1000);

    const finish = calls.find((c) => c[0] === 'finish');
    expect(finish?.[1]).toMatchObject({ ok: false });
    expect(finish?.[1].text).toContain('could not generate');
  });

  it('cancels the in-flight reply when superseded (run cancelled, partial kept)', async () => {
    const calls: Call[] = [];
    const state = createLoopState();
    const gateway: ModelGateway = {
      async *stream(req: GatewayRequest): AsyncIterable<GatewayDelta> {
        yield { type: 'text', text: 'par' };
        await untilAbort(req.signal);
        yield { type: 'text', text: 'tial' }; // never reached
      },
      embed: () => Promise.reject(new Error('no')),
    };

    const p = handleReply(fakeConn(calls), SELF, gateway, FAST, 5000, 1n, AGENT_ID, EPISODE_ID, state);
    expect(state.running.has(1n)).toBe(true); // registered synchronously
    await sleep(20);
    state.running.get(1n)?.supersede();
    await p;

    const cancel = calls.find((c) => c[0] === 'cancel');
    expect(cancel?.[1]).toMatchObject({ text: 'par' });
    expect(calls.some((c) => c[0] === 'finish')).toBe(false);
    expect(state.running.has(1n)).toBe(false); // unwound
  });
});
