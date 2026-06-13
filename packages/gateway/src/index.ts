// Model Gateway — the provider-agnostic surface the orchestrator calls (SPEC §4).
// Real adapters (Anthropic/Google/OpenAI/OpenAI-compatible) are implemented on
// the Vercel AI SDK in M1.4; this is the interface + a not-yet-implemented stub.
import type { ModelRef, ToolSpec } from '@agentspace/shared';

export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GatewayRequest {
  model: ModelRef;
  messages: GatewayMessage[];
  tools?: ToolSpec[];
  /** Opaque handle the gateway resolves to a BYOK credential server-side. */
  credentialRef: string;
}

export interface GatewayUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}

export type GatewayDelta =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; name: string; input: unknown }
  | { type: 'finish'; usage: GatewayUsage; finishReason: string };

export interface ModelGateway {
  /** Streamed text + tool-call deltas, terminated by a `finish` delta. */
  stream(req: GatewayRequest): AsyncIterable<GatewayDelta>;
  /** Embeddings for RAG ingestion/retrieval. */
  embed(texts: string[]): Promise<number[][]>;
}

const NOT_IMPLEMENTED = 'ModelGateway is a stub; provider adapters arrive in M1.4 (embed: M3.1)';

/**
 * Placeholder gateway. Methods throw until the Vercel AI SDK integration lands.
 * Keeping the surface stable now lets the orchestrator be built against it.
 */
export function createModelGateway(): ModelGateway {
  return {
    stream(): AsyncIterable<GatewayDelta> {
      return {
        [Symbol.asyncIterator](): AsyncIterator<GatewayDelta> {
          throw new Error(NOT_IMPLEMENTED);
        },
      };
    },
    embed(): Promise<number[][]> {
      return Promise.reject(new Error(NOT_IMPLEMENTED));
    },
  };
}
