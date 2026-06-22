// Provider registry: maps a ModelRef.provider to a Vercel AI SDK model factory.
// M1.8.1 makes all single-API-key cloud providers live; `openai-compatible`
// (local, needs a baseURL) lands in M1.8.2 and the multi-credential providers
// (Bedrock/Azure/Vertex) in M1.8.3. The provider id set is PROVIDER_CATALOG in
// @agentspace/shared (coupled — a new catalog entry needs a factory here).
import type { LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createCohere } from '@ai-sdk/cohere';
import { createGroq } from '@ai-sdk/groq';
import { createXai } from '@ai-sdk/xai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createPerplexity } from '@ai-sdk/perplexity';
import { createTogetherAI } from '@ai-sdk/togetherai';
import { createFireworks } from '@ai-sdk/fireworks';
import { createDeepInfra } from '@ai-sdk/deepinfra';
import { createCerebras } from '@ai-sdk/cerebras';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ModelProvider } from '@agentspace/shared';

/** `credential` is a raw API key (kind 'apiKey'/'baseUrl') or a JSON blob (kind 'multi');
 *  `opts.baseUrl` is the endpoint for local/self-hosted providers (kind 'baseUrl'). */
export type ProviderFactory = (
  credential: string,
  model: string,
  opts?: { baseUrl?: string },
) => LanguageModel;

export type ProviderRegistry = Partial<Record<ModelProvider, ProviderFactory>>;

// Single-API-key cloud providers (M1.8.1) + local/openai-compatible (M1.8.2).
export const defaultProviders: ProviderRegistry = {
  anthropic: (apiKey, model) => createAnthropic({ apiKey })(model),
  openai: (apiKey, model) => createOpenAI({ apiKey })(model),
  google: (apiKey, model) => createGoogleGenerativeAI({ apiKey })(model),
  mistral: (apiKey, model) => createMistral({ apiKey })(model),
  cohere: (apiKey, model) => createCohere({ apiKey })(model),
  groq: (apiKey, model) => createGroq({ apiKey })(model),
  xai: (apiKey, model) => createXai({ apiKey })(model),
  deepseek: (apiKey, model) => createDeepSeek({ apiKey })(model),
  perplexity: (apiKey, model) => createPerplexity({ apiKey })(model),
  togetherai: (apiKey, model) => createTogetherAI({ apiKey })(model),
  fireworks: (apiKey, model) => createFireworks({ apiKey })(model),
  deepinfra: (apiKey, model) => createDeepInfra({ apiKey })(model),
  cerebras: (apiKey, model) => createCerebras({ apiKey })(model),
  // Local / self-hosted (Ollama / vLLM / LM Studio) — needs a baseURL; key optional.
  'openai-compatible': (apiKey, model, opts) =>
    createOpenAICompatible({
      name: 'openai-compatible',
      baseURL: opts?.baseUrl ?? '',
      apiKey: apiKey || undefined,
    })(model),
  // Multi-credential providers (Bedrock/Azure/Vertex) land in M1.8.3.
};
