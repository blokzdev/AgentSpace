// Unit tests for the reconnect supervisor (M2.5 / BL-022). An injected connector +
// injected sleep drive the loop deterministically (no real timers / network): a
// disconnect must re-arm the runtime instead of exiting, failed connects back off
// with growth, and a stuck connection resets the backoff.
import { describe, it, expect, vi } from 'vitest';
import type { Identity } from 'spacetimedb';
import type { DbConnection } from '@agentspace/stdb-bindings';
import type { OrchestratorConnection } from './spacetime';
import { runOrchestrator, type Connector } from './supervise';

const fakeIdentity = (hex: string): Identity => ({ toHexString: () => hex } as unknown as Identity);
const fakeConn = (hex = 'svc0'): OrchestratorConnection =>
  ({ conn: {} as unknown as DbConnection, identity: fakeIdentity(hex) });

// rand=0.5 + base=100 makes nextBackoff deterministic: attempt 0→50, 1→100, 2→200…
const backoff = { baseMs: 100, factor: 2, capMs: 30_000, rand: () => 0.5 };

describe('reconnect supervisor (M2.5 / BL-022)', () => {
  it('re-arms the runtime after a disconnect and never throws/exits', async () => {
    const sleeps: number[] = [];
    // Each successful connect auto-drops on the next microtask so the loop advances.
    const connect: Connector = vi.fn(async (onDisconnect) => {
      queueMicrotask(() => onDisconnect(new Error('socket closed')));
      return fakeConn();
    });
    const onReady = vi.fn();

    await expect(
      runOrchestrator({ connect, onReady, sleep: async (ms) => void sleeps.push(ms), backoff, maxCycles: 3, log: () => {} }),
    ).resolves.toBeUndefined();

    // initial connect + 2 reconnects before the 3rd disconnect ends the loop
    expect(onReady).toHaveBeenCalledTimes(3);
    expect(connect).toHaveBeenCalledTimes(3);
    // a stuck connection keeps resetting attempt → every reconnect waits nextBackoff(0)
    expect(sleeps).toEqual([50, 50]);
  });

  it('backs off with growth on failed connects and resets after one sticks', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const connect: Connector = vi.fn(async (onDisconnect) => {
      calls += 1;
      if (calls <= 2) throw new Error('refused'); // first two connects fail
      queueMicrotask(() => onDisconnect(undefined)); // then succeed + auto-drop
      return fakeConn(`svc${calls}`);
    });
    const onReady = vi.fn();

    await runOrchestrator({
      connect,
      onReady,
      sleep: async (ms) => void sleeps.push(ms),
      backoff,
      maxCycles: 2,
      log: () => {},
    });

    // [fail#0=50, fail#1=100, then connect#3 succeeds → attempt reset → drop waits 50, …]
    expect(sleeps[0]).toBe(50);
    expect(sleeps[1]).toBe(100); // grows while failing
    expect(sleeps[1]).toBeGreaterThan(sleeps[0]);
    expect(sleeps[2]).toBe(50); // reset to attempt 0 after a successful connect
    expect(onReady).toHaveBeenCalledTimes(2); // only the two successful connects arm the runtime
  });

  it('passes each fresh connection through to onReady', async () => {
    const seen: string[] = [];
    let n = 0;
    const connect: Connector = async (onDisconnect) => {
      n += 1;
      queueMicrotask(() => onDisconnect());
      return fakeConn(`id-${n}`);
    };
    await runOrchestrator({
      connect,
      onReady: (_conn, identity) => seen.push(identity.toHexString()),
      sleep: async () => {},
      backoff,
      maxCycles: 2,
      log: () => {},
    });
    expect(seen).toEqual(['id-1', 'id-2']);
  });
});
