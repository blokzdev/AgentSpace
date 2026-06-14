// Agent Orchestrator entrypoint (BLUEPRINT.md §4). M0.4 wires the trusted
// SpacetimeDB connection + the echo reply loop. The Model Gateway stays a stub
// until M1.4; agent/persona/run features arrive in M1.
import { createModelGateway, envResolver, type ModelGateway } from '@agentspace/gateway';
import { DEFAULT_MODEL, type ModelRef } from '@agentspace/shared';
import { connectOrchestrator } from './spacetime';
import { startReplyLoop } from './replyLoop';

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
    // BYOK keys resolved from env in v1 (M1.4); a per-user encrypted store wires
    // in with the real reply loop (M1.6 / OT-007).
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
  const { conn, identity } = await connectOrchestrator();
  const orchestrator = createOrchestrator();
  console.info(`[orchestrator] connected as ${identity.toHexString()}`);
  console.info(orchestrator.describe());
  // Register as the agent service so authored personas can be deployed (M1.5).
  conn.reducers.registerService({});
  startReplyLoop(conn, identity, orchestrator.config.gateway);
}
