// Model Gateway — the provider-agnostic surface the orchestrator calls (SPEC §4).
// M1.4 implements streaming + tool-calling on the Vercel AI SDK over a pluggable
// provider registry, with BYOK credential resolution. `embed` lands in M3.1 (RAG).
import {
  jsonSchema,
  streamText,
  tool,
  type ModelMessage,
  type TextStreamPart,
  type ToolSet,
} from 'ai';
import type { JSONSchema7 } from '@ai-sdk/provider';
import type { ModelRef, ToolSpec } from '@agentspace/shared';
import { defaultProviders, type ProviderRegistry } from './providers';
import type { CredentialResolver } from './credentials';

export * from './credentials';
export { defaultProviders, type ProviderRegistry, type ProviderFactory } from './providers';

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
  /** Endpoint for local/self-hosted providers (kind 'baseUrl', e.g. Ollama). */
  baseUrl?: string;
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

export interface ModelGatewayOptions {
  /** Resolves `GatewayRequest.credentialRef` to a live API key (BYOK). */
  resolveCredential?: CredentialResolver;
  /** Provider adapters; defaults to the real Anthropic/OpenAI registry. */
  providers?: ProviderRegistry;
}

/** Normalize one AI SDK stream part to a GatewayDelta (null = drop). */
function toGatewayDelta(part: TextStreamPart<ToolSet>): GatewayDelta | null {
  switch (part.type) {
    case 'text-delta':
      return { type: 'text', text: part.text };
    case 'tool-call':
      return { type: 'tool-call', name: part.toolName, input: part.input };
    case 'finish':
      return {
        type: 'finish',
        usage: {
          inputTokens: part.totalUsage.inputTokens ?? 0,
          outputTokens: part.totalUsage.outputTokens ?? 0,
        },
        finishReason: part.finishReason,
      };
    default:
      return null;
  }
}

/** Split gateway messages into the AI SDK `system` arg + turn history. */
function toModelMessages(messages: GatewayMessage[]): { system?: string; messages: ModelMessage[] } {
  const systemParts: string[] = [];
  const history: ModelMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') systemParts.push(m.content);
    else if (m.role === 'user') history.push({ role: 'user', content: m.content });
    else history.push({ role: 'assistant', content: m.content });
  }
  return { system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined, messages: history };
}

/** Map normalized tool specs to the AI SDK tool set (declaration only). */
function toToolSet(tools?: ToolSpec[]): ToolSet | undefined {
  if (!tools || tools.length === 0) return undefined;
  const set: ToolSet = {};
  for (const t of tools) {
    set[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema(t.inputSchema as JSONSchema7),
    });
  }
  return set;
}

export function createModelGateway(options: ModelGatewayOptions = {}): ModelGateway {
  const providers = options.providers ?? defaultProviders;
  const { resolveCredential } = options;

  return {
    async *stream(req: GatewayRequest): AsyncIterable<GatewayDelta> {
      if (!resolveCredential) {
        throw new Error('ModelGateway: no credential resolver configured');
      }
      const factory = providers[req.model.provider];
      if (!factory) {
        throw new Error(`ModelGateway: no provider adapter for "${req.model.provider}"`);
      }
      const apiKey = await resolveCredential(req.credentialRef);
      const model = factory(apiKey, req.model.model, { baseUrl: req.baseUrl });
      const { system, messages } = toModelMessages(req.messages);

      const result = streamText({ model, system, messages, tools: toToolSet(req.tools) });
      for await (const part of result.fullStream) {
        if (part.type === 'error') {
          throw part.error instanceof Error ? part.error : new Error(String(part.error));
        }
        const delta = toGatewayDelta(part);
        if (delta) yield delta;
      }
    },

    embed(): Promise<number[][]> {
      return Promise.reject(new Error('ModelGateway.embed is implemented in M3.1 (RAG)'));
    },
  };
}
