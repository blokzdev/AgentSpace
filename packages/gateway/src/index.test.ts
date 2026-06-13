import { describe, it, expect } from 'vitest';
import { createModelGateway, createEncryptedKeyStore, envResolver, defaultProviders } from './index';

describe('gateway package surface', () => {
  it('exposes the gateway factory + BYOK helpers from the entrypoint', () => {
    const gw = createModelGateway();
    expect(typeof gw.stream).toBe('function');
    expect(typeof gw.embed).toBe('function');
    expect(typeof createEncryptedKeyStore).toBe('function');
    expect(typeof envResolver).toBe('function');
  });

  it('registers the two v1 cloud providers', () => {
    expect(typeof defaultProviders.anthropic).toBe('function');
    expect(typeof defaultProviders.openai).toBe('function');
  });
});
