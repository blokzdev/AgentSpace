// Unit tests for handleReply's finalization paths (M1.9): a happy stream finishes
// `complete`; a stalled provider times out to `failed`; a gateway error finishes
// `failed`; a superseding human message cancels the in-flight reply. Uses a minimal
// fake DbConnection + scripted gateways (no SpacetimeDB / network).
import { describe, it, expect } from 'vitest';
import { Identity } from 'spacetimedb';
import type { GatewayDelta, GatewayRequest, ModelGateway } from '@agentspace/gateway';
import { DbConnection } from '@agentspace/stdb-bindings';
import { handleReply, type InFlight } from './replyLoop';

type Call = [string, Record<string, unknown>];

/** A DbConnection stub covering only what handleReply touches. */
function fakeConn(calls: Call[]): DbConnection {
  const rec = (name: string) => (args: Record<string, unknown>) => calls.push([name, args]);
  return {
    db: {
      my_active_personas: { iter: () => [] },
      my_threads: { iter: () => [{ id: 1n, agentId: 0n }] },
      my_thread_messages: { iter: () => [] },
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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** Reject as soon as the signal aborts (covers the already-aborted race). */
const untilAbort = (signal?: AbortSignal): Promise<never> =>
  new Promise((_resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });

const FAST = 5; // flush interval (ms) for tests

describe('handleReply finalization (M1.9.2)', () => {
  it('streams deltas then finishes `complete` with the full text', async () => {
    const calls: Call[] = [];
    const gateway: ModelGateway = {
      async *stream(): AsyncIterable<GatewayDelta> {
        yield { type: 'text', text: 'Hel' };
        yield { type: 'text', text: 'lo!' };
        yield { type: 'finish', usage: { inputTokens: 3, outputTokens: 2 }, finishReason: 'stop' };
      },
      embed: () => Promise.reject(new Error('no')),
    };

    await handleReply(fakeConn(calls), SELF, gateway, FAST, 1000, 1n, new Map<bigint, InFlight>());

    expect(calls.filter((c) => c[0] === 'begin')).toHaveLength(1);
    const deltas = calls.filter((c) => c[0] === 'delta');
    expect(deltas.length).toBeGreaterThan(0);
    // Concatenation of all delta chunks reconstructs the reply, regardless of how the
    // coalescing batcher split them across flushes.
    expect(deltas.map((c) => c[1].text).join('')).toBe('Hello!');
    // seq is strictly increasing (0, 1, …), one per flush.
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
        await untilAbort(req.signal); // hang until the watchdog aborts
      },
      embed: () => Promise.reject(new Error('no')),
    };

    await handleReply(fakeConn(calls), SELF, gateway, FAST, 40, 1n, new Map<bigint, InFlight>());

    const finish = calls.find((c) => c[0] === 'finish');
    expect(finish?.[1]).toMatchObject({ ok: false, text: 'thinking' }); // partial kept
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

    await handleReply(fakeConn(calls), SELF, gateway, FAST, 1000, 1n, new Map<bigint, InFlight>());

    const finish = calls.find((c) => c[0] === 'finish');
    expect(finish?.[1]).toMatchObject({ ok: false });
    expect(finish?.[1].text).toContain('could not generate');
  });

  it('cancels the in-flight reply when superseded (run cancelled, partial kept)', async () => {
    const calls: Call[] = [];
    const inFlight = new Map<bigint, InFlight>();
    const gateway: ModelGateway = {
      async *stream(req: GatewayRequest): AsyncIterable<GatewayDelta> {
        yield { type: 'text', text: 'par' };
        await untilAbort(req.signal); // wait to be superseded
        yield { type: 'text', text: 'tial' }; // never reached
      },
      embed: () => Promise.reject(new Error('no')),
    };

    const p = handleReply(fakeConn(calls), SELF, gateway, FAST, 5000, 1n, inFlight);
    expect(inFlight.has(1n)).toBe(true); // registered synchronously
    await sleep(20); // let the first delta land
    inFlight.get(1n)?.supersede(); // a newer human message arrives
    await p;

    const cancel = calls.find((c) => c[0] === 'cancel');
    expect(cancel?.[1]).toMatchObject({ text: 'par' }); // partial preserved
    expect(calls.some((c) => c[0] === 'finish')).toBe(false); // not finished, cancelled
    expect(inFlight.has(1n)).toBe(false); // unwound
  });
});
