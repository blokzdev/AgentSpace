// Agent Orchestrator entrypoint (BLUEPRINT.md §4). M0.4 wires the trusted
// SpacetimeDB connection + the echo reply loop. The Model Gateway stays a stub
// until M1.4; agent/persona/run features arrive in M1.
import { createModelGateway, envResolver, type ModelGateway } from '@agentspace/gateway';
import { DEFAULT_MODEL, type ModelRef } from '@agentspace/shared';
import { runOrchestrator } from './supervise';
import { startReplyLoop } from './replyLoop';
import { createByokResolver, defaultKeyFile, loadOrCreateKeypair, pubKeyB64 } from './byok';

export interface OrchestratorConfig {
  gateway: ModelGateway;
  defaultModel: ModelRef;
}

export interface Orchestrator {
  readonly config: OrchestratorConfig;
  describe(): string;
}

export function createOrchestrator(config?: Partial<OrchestratorConfig>): Orchestrator {
  const resolved: OrchestratorConfig = {
    // INTERIM (DEC-024): one operator key per provider via envResolver. Per-user
    // in-app BYOK — swap this for a real per-user CredentialResolver — is M1.7.
    gateway: config?.gateway ?? createModelGateway({ resolveCredential: envResolver() }),
    defaultModel: config?.defaultModel ?? DEFAULT_MODEL,
  };
  return {
    config: resolved,
    describe(): string {
      const { provider, model } = resolved.defaultModel;
      return `AgentSpace orchestrator (default model: ${provider}/${model})`;
    },
  };
}

export async function main(): Promise<void> {
  console.info(createOrchestrator().describe());

  // BYOK (M1.7): one persistent box keypair for the lifetime of the service. We
  // publish its public key so users can seal their provider keys to us, and rebind
  // the resolver to each (re)connection's `my_persona_keys` view.
  const keypair = loadOrCreateKeypair(defaultKeyFile());

  // M2.5/BL-022: supervise the connection. A dropped socket reconnects with backoff
  // and re-arms the reply loop on the FRESH connection (the gateway resolver + the
  // loop's subscriptions close over `conn`, so they must be rebuilt each time) — the
  // process never exits on a drop. Runs until the process is killed.
  await runOrchestrator({
    onReady: (conn, identity) => {
      conn.reducers.registerService({ encPubKey: pubKeyB64(keypair) });
      const gateway = createModelGateway({
        resolveCredential: createByokResolver({
          keys: () => conn.db.my_persona_keys.iter(),
          secretKey: keypair.secretKey,
        }),
      });
      startReplyLoop(conn, identity, gateway);
    },
  });
}
