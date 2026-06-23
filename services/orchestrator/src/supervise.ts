// Connection supervisor (M2.5 / BL-022). The SpacetimeDB SDK has no auto-reconnect,
// and on-device verification showed a dropped Maincloud socket killing the
// orchestrator process. This loop keeps the service alive: connect → arm the reply
// loop (`onReady`) → wait for a disconnect → back off → reconnect, forever. A pending
// backoff timer keeps the Node event loop alive across the gap. The persisted-token
// identity (see `spacetime.ts`) stays stable across reconnects.
import type { Identity } from 'spacetimedb';
import { nextBackoff, type BackoffOpts } from '@agentspace/shared';
import type { DbConnection } from '@agentspace/stdb-bindings';
import { connectOrchestrator, type OrchestratorConnection } from './spacetime';

/** Establish one connection, wiring a disconnect notification. Injectable for tests. */
export type Connector = (onDisconnect: (err?: Error) => void) => Promise<OrchestratorConnection>;

export interface SuperviseOptions {
  /** Builds a connection; defaults to the real `connectOrchestrator`. */
  connect?: Connector;
  /** Arm the per-connection runtime (registerService + gateway + reply loop). Called
   *  on every (re)connection with that connection's fresh handles. */
  onReady: (conn: DbConnection, identity: Identity) => void;
  backoff?: BackoffOpts;
  /** Sleep between attempts; injectable so tests run without real timers. */
  sleep?: (ms: number) => Promise<void>;
  /** Test escape hatch: stop after this many disconnect cycles (default Infinity). */
  maxCycles?: number;
  log?: (msg: string) => void;
}

const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export async function runOrchestrator(opts: SuperviseOptions): Promise<void> {
  const connect: Connector = opts.connect ?? ((onDisconnect) => connectOrchestrator({ onDisconnect }));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = opts.log ?? ((m: string): void => console.info(`[orchestrator] ${m}`));
  const maxCycles = opts.maxCycles ?? Infinity;

  let attempt = 0; // grows across consecutive failures; reset to 0 on a stuck connect
  let cycles = 0; // disconnect cycles, for the test escape hatch only

  for (;;) {
    // Fresh disconnect signal per connection; the connector wires the drop to resolve it.
    let signalDrop: (err?: Error) => void = () => {};
    const disconnected = new Promise<Error | undefined>((resolve) => {
      signalDrop = resolve;
    });

    let connection: OrchestratorConnection;
    try {
      connection = await connect((err) => signalDrop(err));
    } catch (err) {
      const delay = nextBackoff(attempt++, opts.backoff);
      log(`connect failed (${errMsg(err)}); retrying in ${delay}ms`);
      await sleep(delay);
      continue;
    }

    attempt = 0; // a connection that succeeded resets the backoff
    log(`connected as ${connection.identity.toHexString()}`);
    opts.onReady(connection.conn, connection.identity);

    const err = await disconnected; // resolves only when this socket drops
    if (++cycles >= maxCycles) return;
    const delay = nextBackoff(attempt++, opts.backoff);
    log(`disconnected (${err ? errMsg(err) : 'clean'}); reconnecting in ${delay}ms`);
    await sleep(delay);
  }
}
