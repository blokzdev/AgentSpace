import { describe, it, expect } from 'vitest';
import { PROVIDER_CATALOG } from '@agentspace/shared';
import { defaultProviders } from './providers';

// The catalog (shared) and the factory registry (gateway) are coupled: every
// single-API-key provider the UI offers must have a live factory here.
describe('defaultProviders registry', () => {
  const apiKeyProviders = PROVIDER_CATALOG.filter((p) => p.kind === 'apiKey');

  it('covers every single-API-key provider in the catalog (≥13)', () => {
    for (const p of apiKeyProviders) {
      expect(defaultProviders[p.id], `missing factory for "${p.id}"`).toBeTypeOf('function');
    }
    expect(apiKeyProviders.length).toBeGreaterThanOrEqual(13);
  });

  it('each factory constructs a LanguageModel from (apiKey, model) without a network call', () => {
    for (const p of apiKeyProviders) {
      const model = defaultProviders[p.id]!('test-key', p.defaultModel);
      expect(model, `factory for "${p.id}" returned nothing`).toBeTruthy();
    }
  });

  it('the local (openai-compatible) factory constructs from a baseURL, key optional', () => {
    const factory = defaultProviders['openai-compatible'];
    expect(factory).toBeTypeOf('function');
    expect(factory!('', 'llama3.2', { baseUrl: 'http://localhost:11434/v1' })).toBeTruthy();
  });

  it('multi-credential factories construct from a sealed JSON credential', () => {
    const cases: Record<string, string> = {
      'amazon-bedrock': JSON.stringify({ region: 'us-east-1', accessKeyId: 'AKIA', secretAccessKey: 'sk' }),
      azure: JSON.stringify({ resourceName: 'res', apiKey: 'k' }),
      'google-vertex': JSON.stringify({ project: 'p', location: 'us-central1', apiKey: 'k' }),
    };
    for (const p of PROVIDER_CATALOG.filter((x) => x.kind === 'multi')) {
      const factory = defaultProviders[p.id];
      expect(factory, `missing factory for "${p.id}"`).toBeTypeOf('function');
      expect(factory!(cases[p.id], p.defaultModel)).toBeTruthy();
    }
  });
});
