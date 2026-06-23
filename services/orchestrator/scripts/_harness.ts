// Shared guard for the orchestrator verify/integration scripts.
//
// PRECONDITION: do NOT run these scripts while an orchestrator (`tsx src/main.ts`,
// i.e. `pnpm --filter @agentspace/orchestrator start`) is connected to the SAME DB.
// Both the scripts and the orchestrator call `register_service`, which is
// last-write-wins (modules/spacetime/src/index.ts) — so a stray orchestrator steals
// the singleton `service` identity, `add_agent_to_thread` then makes IT (not the
// script) the thread's `agent` member, and the script's own `agent_reply_begin` is
// refused with "Not an agent member of this thread". This guard converts that opaque
// failure (previously a 15s setup timeout — OT-008) into an actionable message.
import type { Identity } from 'spacetimedb';
import type { DbConnection } from '@agentspace/stdb-bindings';

/**
 * Assert this script owns the singleton `service` registration. Reads the singleton
 * from the (already-subscribed) `service_info` view on `userConn` and fails fast unless
 * it equals `orchIdentity`. Call it AFTER the script's own `register_service`, before
 * any `agent_reply_begin`.
 */
export function assertWeOwnService(
  userConn: DbConnection,
  orchIdentity: Identity,
  fail: (msg: string) => never,
): void {
  const svc = [...userConn.db.service_info.iter()][0];
  if (!svc || !svc.identity.isEqual(orchIdentity)) {
    fail(
      `service singleton is registered to ${svc?.identity.toHexString() ?? '(none)'}, not this ` +
        `script's orchestrator (${orchIdentity.toHexString()}). A stray orchestrator process is ` +
        `holding the service row — stop it (kill any 'tsx src/main.ts' / node) and re-run.`,
    );
  }
}
