// Trusted SpacetimeDB connection for the orchestrator (BLUEPRINT §4, SPEC §6).
// Authenticates with a persisted token so the service keeps a stable Identity.
// A real OIDC client-credentials service account replaces the anonymous token in
// M0.5 (auth).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Identity } from 'spacetimedb';
import { DbConnection, type ErrorContext } from '@agentspace/stdb-bindings';

const DEFAULT_HOST = process.env.AGENTSPACE_STDB_HOST ?? 'ws://127.0.0.1:3000';
const DEFAULT_DB = process.env.AGENTSPACE_STDB_DB ?? 'agentspace';

export interface OrchestratorConnection {
  conn: DbConnection;
  identity: Identity;
}

export interface ConnectOptions {
  host?: string;
  db?: string;
  /** File the auth token is cached in, so the service keeps a stable Identity. */
  tokenFile?: string;
  /** Called when a connection that initially succeeded later drops (M2.5/BL-022).
   *  The supervisor (`supervise.ts`) uses this to reconnect with backoff instead of
   *  letting the process exit. Not fired for an initial connect failure (that
   *  rejects the returned promise via `onConnectError`). */
  onDisconnect?: (err?: Error) => void;
}

function defaultTokenFile(db: string): string {
  return join(tmpdir(), `agentspace-orchestrator-${db}.token`);
}

export function connectOrchestrator(opts: ConnectOptions = {}): Promise<OrchestratorConnection> {
  const host = opts.host ?? DEFAULT_HOST;
  const db = opts.db ?? DEFAULT_DB;
  const tokenFile = opts.tokenFile ?? defaultTokenFile(db);
  const existing = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '';

  return new Promise<OrchestratorConnection>((resolve, reject) => {
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(db)
      .withToken(existing.length > 0 ? existing : undefined)
      .onConnect((conn, identity, token) => {
        try {
          writeFileSync(tokenFile, token);
        } catch {
          // non-fatal: the identity just won't persist across restarts
        }
        resolve({ conn, identity });
      })
      .onConnectError((_ctx: ErrorContext, err: Error) => {
        reject(err);
      })
      .onDisconnect((_ctx: ErrorContext, err?: Error) => {
        opts.onDisconnect?.(err);
      })
      .build();
  });
}
