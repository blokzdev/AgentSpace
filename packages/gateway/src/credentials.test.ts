import { describe, it, expect } from 'vitest';
import { createEncryptedKeyStore, envResolver } from './credentials';

const KEK = Buffer.alloc(32, 7);

describe('EncryptedKeyStore (AES-256-GCM)', () => {
  it('seals and opens a value round-trip without leaking plaintext', () => {
    const store = createEncryptedKeyStore({ kek: KEK });
    const blob = store.seal('sk-secret-123');
    expect(blob).not.toContain('sk-secret-123');
    expect(store.open(blob)).toBe('sk-secret-123');
  });

  it('resolves a stored key by ref', async () => {
    const store = createEncryptedKeyStore({ kek: KEK });
    store.putKey('anthropic', 'sk-ant');
    await expect(store.resolve('anthropic')).resolves.toBe('sk-ant');
  });

  it('rejects an unknown ref', async () => {
    const store = createEncryptedKeyStore({ kek: KEK });
    await expect(store.resolve('missing')).rejects.toThrow(/no credential/i);
  });

  it('rejects a tampered blob (GCM auth tag)', () => {
    const store = createEncryptedKeyStore({ kek: KEK });
    const buf = Buffer.from(store.seal('sk-secret'), 'base64');
    buf[buf.length - 1] ^= 0xff;
    expect(() => store.open(buf.toString('base64'))).toThrow();
  });

  it('rejects decryption under a different KEK', () => {
    const a = createEncryptedKeyStore({ kek: Buffer.alloc(32, 1) });
    const b = createEncryptedKeyStore({ kek: Buffer.alloc(32, 2) });
    expect(() => b.open(a.seal('sk-secret'))).toThrow();
  });

  it('requires a 32-byte KEK', () => {
    expect(() => createEncryptedKeyStore({ kek: Buffer.alloc(16) })).toThrow(/32 bytes/);
  });
});

describe('envResolver', () => {
  it('maps a provider ref to <PROVIDER>_API_KEY', async () => {
    const resolve = envResolver({ ANTHROPIC_API_KEY: 'sk-ant' } as NodeJS.ProcessEnv);
    await expect(resolve('anthropic')).resolves.toBe('sk-ant');
  });

  it('normalizes hyphens in the ref', async () => {
    const resolve = envResolver({ OPENAI_COMPATIBLE_API_KEY: 'sk-local' } as NodeJS.ProcessEnv);
    await expect(resolve('openai-compatible')).resolves.toBe('sk-local');
  });

  it('rejects when the env var is missing', async () => {
    const resolve = envResolver({} as NodeJS.ProcessEnv);
    await expect(resolve('openai')).rejects.toThrow(/no api key/i);
  });
});
