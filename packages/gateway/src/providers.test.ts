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
});
