// Agent Orchestrator — skeleton entrypoint (BLUEPRINT.md §4).
// The trusted SpacetimeDB connection (OIDC service identity), the work-surface
// subscription, and the reply loop land in M0.4 / M1.6. For now this wires the
// Model Gateway and proves the package graph compiles end to end.
import { createModelGateway, type ModelGateway } from '@agentspace/gateway';
import { DEFAULT_MODEL, type ModelRef } from '@agentspace/shared';

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
    gateway: config?.gateway ?? createModelGateway(),
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

export function main(): void {
  console.info(createOrchestrator().describe());
}
