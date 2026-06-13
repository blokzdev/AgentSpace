// Provider registry: maps a ModelRef.provider to a Vercel AI SDK model factory.
// Anthropic + OpenAI are implemented in v1 (M1.4); Google and the
// OpenAI-compatible (local) adapter are registered but inert until a later chunk
// (BACKLOG) — adding them is a one-line factory each.
import type { LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { ModelProvider } from '@agentspace/shared';

export type ProviderFactory = (apiKey: string, model: string) => LanguageModel;

export type ProviderRegistry = Partial<Record<ModelProvider, ProviderFactory>>;

function unsupported(name: ModelProvider): ProviderFactory {
  return () => {
    throw new Error(`Model provider "${name}" is not supported in Model Gateway v1 (M1.4)`);
  };
}

export const defaultProviders: ProviderRegistry = {
  anthropic: (apiKey, model) => createAnthropic({ apiKey })(model),
  openai: (apiKey, model) => createOpenAI({ apiKey })(model),
  google: unsupported('google'),
  'openai-compatible': unsupported('openai-compatible'),
};
